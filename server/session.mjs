// server/session.mjs
// Opaque cookie sessions. The browser never receives provider tokens; the actor
// is represented by a normalized principal with an opaque, stable id.

import { createHash, randomBytes as randomBytesDefault, timingSafeEqual } from 'node:crypto';

/** @param {string} value */
function digest(value) {
    return createHash('sha256').update(value).digest('hex');
}

/**
 * @param {object} options
 * @param {string} options.cookieName
 * @param {boolean} options.cookieSecure
 * @param {'Lax'|'Strict'} [options.cookieSameSite]
 * @param {number} options.idleTimeoutMs
 * @param {number} options.absoluteTimeoutMs
 * @param {() => number} [options.now]
 * @param {(bytes: number) => string} [options.randomToken]
 */
export function createSessionStore(options) {
    const {
        cookieName,
        cookieSecure,
        cookieSameSite = 'Lax',
        idleTimeoutMs,
        absoluteTimeoutMs,
        now = Date.now,
        randomToken = bytes => randomBytesDefault(bytes).toString('base64url')
    } = options;
    const maxSessions = 10000;
    /** @type {Map<string, { id: string, principal: any, csrf: string, createdAt: number, lastSeenAt: number, absoluteExpiresAt: number }>} */
    const sessions = new Map();

    /** @param {string | undefined} token */
    function get(token) {
        if (typeof token !== 'string' || token.length < 16) return null;
        const entry = sessions.get(digest(token));
        if (!entry) return null;
        const timestamp = now();
        if (timestamp >= entry.absoluteExpiresAt || timestamp - entry.lastSeenAt >= idleTimeoutMs) {
            sessions.delete(digest(token));
            return null;
        }
        entry.lastSeenAt = timestamp;
        return entry;
    }

    /** @param {any} principal */
    function create(principal) {
        const token = randomToken(32);
        const timestamp = now();
        const entry = {
            id: token,
            principal: Object.freeze({ ...principal, groups: Object.freeze([...(principal.groups || [])]) }),
            csrf: randomToken(24),
            createdAt: timestamp,
            lastSeenAt: timestamp,
            absoluteExpiresAt: timestamp + absoluteTimeoutMs
        };
        if (sessions.size >= maxSessions) sweep(true);
        sessions.set(digest(token), entry);
        return entry;
    }

    /** @param {string} token */
    function destroy(token) {
        return sessions.delete(digest(token));
    }

    /** @param {boolean} [force] */
    function sweep(force = false) {
        const timestamp = now();
        for (const [key, entry] of sessions) {
            const expired = timestamp >= entry.absoluteExpiresAt || timestamp - entry.lastSeenAt >= idleTimeoutMs;
            if (expired || force) sessions.delete(key);
            if (!force && sessions.size < maxSessions) break;
        }
        return sessions.size;
    }

    const timer = setInterval(() => sweep(), Math.min(idleTimeoutMs, 60000));
    timer.unref?.();

    /** @param {string} cookieValue @param {string} headerValue */
    function csrfMatches(cookieValue, headerValue) {
        if (typeof cookieValue !== 'string' || typeof headerValue !== 'string') return false;
        const a = Buffer.from(cookieValue);
        const b = Buffer.from(headerValue);
        return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
    }

    return {
        get,
        create,
        destroy,
        sweep,
        csrfMatches,
        stop: () => clearInterval(timer),
        cookieName,
        csrfCookieName: `${cookieName}_csrf`,
        cookieSecure,
        cookieSameSite
    };
}

/** @param {string | undefined} header */
export function parseCookies(header) {
    /** @type {Record<string, string>} */
    const cookies = {};
    if (!header) return cookies;
    for (const part of header.split(';')) {
        const index = part.indexOf('=');
        if (index < 1) continue;
        const name = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (!name) continue;
        try {
            cookies[name] = decodeURIComponent(value);
        } catch {
            cookies[name] = value;
        }
    }
    return cookies;
}

/**
 * @param {string} name
 * @param {string} value
 * @param {{ maxAge?: number, httpOnly?: boolean, secure?: boolean, sameSite?: string, path?: string, clear?: boolean }} [options]
 */
export function serializeCookie(name, value, options = {}) {
    const parts = [`${name}=${options.clear ? '' : encodeURIComponent(value)}`, `Path=${options.path || '/'}`];
    if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
    if (options.httpOnly !== false) parts.push('HttpOnly');
    if (options.secure) parts.push('Secure');
    if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
    return parts.join('; ');
}

/** Normalized principal id: issuer and subject are both part of the identity. @param {string} issuer @param {string} subject */
export function principalId(issuer, subject) {
    return createHash('sha256').update(`${issuer}\u0000${subject}`).digest('hex').slice(0, 32);
}
