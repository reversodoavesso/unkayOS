// core/utils/storageNamespace.js
// Deterministic private-storage namespace derived from installation + principal.
// Hashes avoid putting e-mail addresses or subject claims into OPFS directory names.

const VERSION = 'v1';

/**
 * Accepts a path-like string or an array of segments.
 * @param {unknown} value
 * @returns {string[] | null}
 */
export function normalizeStorageNamespace(value) {
    const raw = Array.isArray(value) ? value.join('/') : value;
    if (typeof raw !== 'string') return null;
    const segments = raw.split('/').filter(Boolean);
    if (segments.length === 0 || segments.length > 8) return null;
    for (const segment of segments) {
        if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(segment)) return null;
    }
    return segments;
}

/** @param {string} value */
async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new Error('Web Crypto indisponível para derivar o namespace de armazenamento.');
    const digest = await subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {object} [options]
 * @param {string} [options.installationId]
 * @param {{ issuer?: string, subject?: string, id?: string } | null} [options.principal]
 * @param {string} [options.scope] Private scope discriminator (default: principal).
 * @returns {Promise<{ id: string, segments: readonly string[], installationId: string }>}
 */
export async function deriveStorageNamespace(options = {}) {
    const installationId = typeof options.installationId === 'string' && options.installationId
        ? options.installationId
        : 'unkayos';
    const principal = options.principal || null;
    // The opaque id is preferred; issuer+subject keeps external identities distinct
    // even when two providers reuse the same subject value.
    const identity = principal
        ? (principal.issuer && principal.subject
            ? `${principal.issuer}\u0000${principal.subject}`
            : (principal.id || null))
        : null;
    const scope = typeof options.scope === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(options.scope)
        ? options.scope
        : 'principal';
    const installationHash = (await sha256(`installation\u0000${installationId}`)).slice(0, 16);
    const principalHash = identity ? (await sha256(`principal\u0000${identity}`)).slice(0, 16) : 'anonymous';
    const segments = Object.freeze(['unkayos', VERSION, installationHash, principalHash, scope]);
    return Object.freeze({
        id: segments.join('/'),
        segments,
        installationId
    });
}
