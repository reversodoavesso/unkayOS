// server/app.mjs
// Same-origin gateway: cookie session, CSRF, deny-by-default authorization and
// an AI proxy that keeps upstream credentials on the server.

import { randomBytes } from 'node:crypto';
import { GatewayError, createAiGateway } from './ai.mjs';
import { toPublicMetadata } from './config.mjs';
import { createOidcClient } from './oidc.mjs';
import { createSessionStore, parseCookies, principalId, serializeCookie } from './session.mjs';
import { createStaticHandler } from './static.mjs';

const BODY_LIMIT = 1024 * 1024;
const TXN_TTL_MS = 10 * 60 * 1000;

/** @param {import('node:http').IncomingMessage} req */
async function readJson(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > BODY_LIMIT) throw new GatewayError(413, 'PAYLOAD_TOO_LARGE', 'Corpo da requisição excede o limite.');
        chunks.push(chunk);
    }
    if (chunks.length === 0) return {};
    let value;
    try {
        value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        throw new GatewayError(400, 'INVALID_JSON', 'Corpo JSON inválido.');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new GatewayError(400, 'INVALID_JSON', 'O corpo deve ser um objeto JSON.');
    }
    return value;
}

/** @param {import('node:http').ServerResponse} res @param {number} status @param {any} body @param {Record<string,string>} [headers] */
function sendJson(res, status, body, headers = {}) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        ...headers
    });
    res.end(payload);
}

/** @param {import('node:http').ServerResponse} res @param {string} code @param {string} message @param {number} status */
function sendError(res, status, code, message) {
    sendJson(res, status, { error: { code, message } });
}

/** @param {any} error */
function errorStatus(error) {
    return error instanceof GatewayError ? error.status : 500;
}

/** @param {import('node:http').IncomingMessage} req */
function sameOrigin(req) {
    const origin = req.headers.origin;
    if (typeof origin === 'string') {
        try {
            if (new URL(origin).host !== req.headers.host) return false;
        } catch {
            return false;
        }
    }
    const site = req.headers['sec-fetch-site'];
    if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') return false;
    return true;
}

/** @param {() => number} now */
function createLimiter(now) {
    /** @type {Map<string, { start: number, count: number }>} */
    const buckets = new Map();
    return {
        /** @param {string} key @param {number} limit */
        consume(key, limit) {
            if (buckets.size > 5000) buckets.clear();
            const timestamp = now();
            let bucket = buckets.get(key);
            if (!bucket || timestamp - bucket.start >= 60000) {
                bucket = { start: timestamp, count: 0 };
                buckets.set(key, bucket);
            }
            if (bucket.count >= limit) return false;
            bucket.count += 1;
            return true;
        }
    };
}

/**
 * @param {object} options
 * @param {any} options.config
 * @param {any} options.policy
 * @param {any} options.secrets
 * @param {typeof fetch} [options.fetchImpl]
 * @param {() => number} [options.now]
 * @param {string | null} [options.staticRoot]
 */
export function createGateway({ config, policy, secrets, fetchImpl = globalThis.fetch, now = Date.now, staticRoot = null }) {
    const staticHandler = staticRoot ? createStaticHandler({ root: staticRoot }) : null;
    const sessionConfig = config.session;
    const cookieName = sessionConfig.cookieName;
    const csrfHeader = String(sessionConfig.csrfHeader || 'x-unkay-csrf').toLowerCase();
    const sessions = createSessionStore({
        cookieName,
        cookieSecure: sessionConfig.cookieSecure,
        cookieSameSite: sessionConfig.cookieSameSite || 'Lax',
        idleTimeoutMs: sessionConfig.idleTimeoutSeconds * 1000,
        absoluteTimeoutMs: sessionConfig.absoluteTimeoutSeconds * 1000,
        now
    });
    const authorization = policy;
    const metadata = toPublicMetadata(config, policy);
    const ai = config.ai ? createAiGateway({ config, fetchImpl }) : null;
    const oidc = config.identity.mode === 'oidc'
        ? createOidcClient({ config, clientSecret: secrets.oidcClientSecret, fetchImpl, now })
        : null;
    const txnCookie = `${cookieName}_txn`;
    /** @type {Map<string, { verifier: string, createdAt: number }>} */
    const transactions = new Map();
    const limiter = createLimiter(now);

    const secure = sessionConfig.cookieSecure === true;
    const sameSite = sessionConfig.cookieSameSite || 'Lax';
    const baseCookie = { secure, sameSite, path: '/' };

    /** @param {string} token @param {number} maxAge */
    const sessionCookie = (token, maxAge) => serializeCookie(cookieName, token, { ...baseCookie, httpOnly: true, maxAge });
    /** @param {string} token @param {number} maxAge */
    const csrfCookie = (token, maxAge) => serializeCookie(sessions.csrfCookieName, token, { ...baseCookie, httpOnly: false, maxAge });

    /** @param {any} session */
    const publicPrincipal = session => Object.freeze({
        id: session.principal.id,
        name: session.principal.name || '',
        issuer: session.principal.issuer,
        groups: session.principal.groups || [],
        mfa: session.principal.mfa === true
    });

    /** @param {import('node:http').IncomingMessage} req */
    function currentSession(req) {
        const cookies = parseCookies(req.headers.cookie);
        const token = cookies[cookieName];
        return { session: sessions.get(token), token, cookies };
    }

    /** @param {import('node:http').IncomingMessage} req @param {any} session */
    function csrfValid(req, session) {
        if (!sameOrigin(req)) return false;
        const cookies = parseCookies(req.headers.cookie);
        const cookieValue = cookies[sessions.csrfCookieName];
        const headerValue = req.headers[csrfHeader];
        if (typeof headerValue !== 'string' || !sessions.csrfMatches(cookieValue, headerValue)) return false;
        return session ? sessions.csrfMatches(session.csrf, headerValue) : true;
    }

    /** @param {import('node:http').ServerResponse} res @param {any} session @param {string} csrf */
    function writeSession(res, session, csrf, maxAge) {
        res.setHeader('Set-Cookie', [sessionCookie(session.id, maxAge), csrfCookie(csrf, maxAge)]);
    }

    /** @param {any} session */
    function allowedModels(session) {
        if (!ai) return [];
        const principal = session?.principal || null;
        if (!principal) return [];
        return ai.models.filter(model => authorization.evaluate({
            principal,
            action: 'ai.chat',
            resource: { kind: 'ai', model }
        }).allowed);
    }

    /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res */
    async function handleSession(req, res) {
        const { session, cookies } = currentSession(req);
        const csrf = session ? session.csrf : (cookies[sessions.csrfCookieName] || randomBytes(24).toString('base64url'));
        const maxAge = sessionConfig.absoluteTimeoutSeconds;
        if (session) writeSession(res, session, csrf, maxAge);
        else res.setHeader('Set-Cookie', csrfCookie(csrf, maxAge));
        sendJson(res, 200, {
            authenticated: Boolean(session),
            principal: session ? publicPrincipal(session) : null,
            csrfToken: csrf,
            installation: metadata,
            ai: ai ? { models: allowedModels(session) } : null,
            access: { policyVersion: policy.policyVersion }
        });
    }

    /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res */
    async function handleLogin(req, res) {
        if (oidc) {
            // Login is a navigation: the state cookie binds the callback to this
            // browser, so a cross-site POST cannot complete a session by itself.
            if (req.method === 'POST' && !csrfValid(req, currentSession(req).session)) {
                return sendError(res, 403, 'CSRF_INVALID', 'Requisição bloqueada pela proteção CSRF.');
            }
            const { url, transaction } = await oidc.begin();
            transactions.set(transaction.state, { verifier: transaction.verifier, createdAt: transaction.createdAt });
            for (const [state, value] of transactions) {
                if (now() - value.createdAt > TXN_TTL_MS) transactions.delete(state);
            }
            if (transactions.size > 1000) transactions.clear();
            res.setHeader('Set-Cookie', serializeCookie(txnCookie, transaction.state, {
                ...baseCookie, httpOnly: true, maxAge: Math.floor(TXN_TTL_MS / 1000)
            }));
            res.writeHead(302, { Location: url, 'Cache-Control': 'no-store' });
            return res.end();
        }
        if (!csrfValid(req, null)) return sendError(res, 403, 'CSRF_INVALID', 'Requisição bloqueada pela proteção CSRF.');
        const { session: oldSession } = currentSession(req);
        if (oldSession) sessions.destroy(oldSession.id);
        const principal = {
            issuer: 'local',
            subject: `device:${config.installationId}`,
            id: principalId('local', `device:${config.installationId}`),
            name: 'Sessão local',
            groups: ['local'],
            mfa: false
        };
        const session = sessions.create(principal);
        writeSession(res, session, session.csrf, sessionConfig.absoluteTimeoutSeconds);
        sendJson(res, 200, {
            authenticated: true,
            principal: publicPrincipal(session),
            csrfToken: session.csrf,
            installation: metadata,
            ai: ai ? { models: allowedModels(session) } : null
        });
    }

    /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res */
    async function handleCallback(req, res, url) {
        if (!oidc) return sendError(res, 404, 'NOT_FOUND', 'Rota não encontrada.');
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const cookies = parseCookies(req.headers.cookie);
        if (!code || !state || cookies[txnCookie] !== state) {
            return sendError(res, 400, 'OIDC_STATE_INVALID', 'Retorno de login inválido ou expirado.');
        }
        const transaction = transactions.get(state);
        transactions.delete(state);
        if (!transaction || now() - transaction.createdAt > TXN_TTL_MS) {
            return sendError(res, 400, 'OIDC_STATE_INVALID', 'Transação de login expirada.');
        }
        const principal = await oidc.complete({ code, transaction });
        const { session: oldSession } = currentSession(req);
        if (oldSession) sessions.destroy(oldSession.id);
        const session = sessions.create(principal);
        res.setHeader('Set-Cookie', [
            sessionCookie(session.id, sessionConfig.absoluteTimeoutSeconds),
            csrfCookie(session.csrf, sessionConfig.absoluteTimeoutSeconds),
            serializeCookie(txnCookie, '', { ...baseCookie, httpOnly: true, maxAge: 0, clear: true })
        ]);
        const target = config.identity.postLoginPath || '/';
        res.writeHead(302, { Location: target, 'Cache-Control': 'no-store' });
        return res.end();
    }

    /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res */
    async function handleLogout(req, res) {
        const { session } = currentSession(req);
        if (!csrfValid(req, session)) return sendError(res, 403, 'CSRF_INVALID', 'Requisição bloqueada pela proteção CSRF.');
        if (session) sessions.destroy(session.id);
        res.setHeader('Set-Cookie', [
            sessionCookie('', 0),
            csrfCookie('', 0),
            serializeCookie(txnCookie, '', { ...baseCookie, httpOnly: true, maxAge: 0, clear: true })
        ]);
        sendJson(res, 200, { authenticated: false });
    }

    /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res */
    async function handleEvaluate(req, res, session) {
        if (!session) return sendError(res, 401, 'UNAUTHENTICATED', 'Sessão necessária.');
        if (!csrfValid(req, session)) return sendError(res, 403, 'CSRF_INVALID', 'Requisição bloqueada pela proteção CSRF.');
        const body = await readJson(req);
        if (typeof body.action !== 'string' || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(body.action)) {
            return sendError(res, 400, 'INVALID_ACTION', 'Ação inválida.');
        }
        const resource = body.resource ?? {};
        if (!resource || typeof resource !== 'object' || Array.isArray(resource)) {
            return sendError(res, 400, 'INVALID_RESOURCE', 'Recurso inválido.');
        }
        for (const key of Object.keys(resource)) {
            if (!['kind', 'model', 'ownerId'].includes(key)) {
                return sendError(res, 400, 'INVALID_RESOURCE', 'Campo de recurso não suportado.');
            }
        }
        const decision = authorization.evaluate({ principal: session.principal, action: body.action, resource });
        sendJson(res, 200, decision);
    }

    /**
     * @param {import('node:http').IncomingMessage} req
     * @param {import('node:http').ServerResponse} res
     * @param {any} session
     * @param {boolean} stream
     */
    async function handleAi(req, res, session, stream) {
        if (!ai) return sendError(res, 503, 'AI_DISABLED', 'IA não configurada neste servidor.');
        if (!session) return sendError(res, 401, 'UNAUTHENTICATED', 'Sessão necessária.');
        if (!csrfValid(req, session)) return sendError(res, 403, 'CSRF_INVALID', 'Requisição bloqueada pela proteção CSRF.');
        const body = await readJson(req);
        const alias = typeof body.model === 'string' ? body.model : config.ai.defaultModel;
        const target = ai.resolveModel(alias);
        const decision = authorization.evaluate({
            principal: session.principal,
            action: 'ai.chat',
            resource: { kind: 'ai', model: target.name }
        });
        if (!decision.allowed) return sendError(res, 403, 'FORBIDDEN', `Acesso negado (${decision.reason}).`);
        const limit = decision.restrictions?.requestsPerMinute;
        if (typeof limit === 'number' && !limiter.consume(`${session.principal.id}:ai.chat`, limit)) {
            return sendError(res, 429, 'QUOTA_EXCEEDED', 'Limite de requisições de IA excedido.');
        }
        const apiKey = secrets.upstreamKeys[target.model.upstream];
        if (!apiKey) return sendError(res, 503, 'UPSTREAM_UNAVAILABLE', 'Fornecedor de IA indisponível.');
        const controller = new AbortController();
        let closed = false;
        res.on('close', () => {
            if (!res.writableEnded) {
                closed = true;
                controller.abort(new DOMException('Client disconnected.', 'AbortError'));
            }
        });
        if (!stream) {
            try {
                const reply = await ai.chat(alias, body.messages, { apiKey, signal: controller.signal });
                if (closed) return;
                return sendJson(res, 200, { reply });
            } catch (error) {
                if (closed) return;
                throw error;
            }
        }
        let started = false;
        const startStream = () => {
            started = true;
            res.writeHead(200, {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff',
                'X-Accel-Buffering': 'no'
            });
        };
        try {
            await ai.stream(alias, body.messages, chunk => {
                if (closed) return;
                if (!started) startStream();
                res.write(chunk);
            }, { apiKey, signal: controller.signal });
            if (!started) startStream();
            if (!closed) res.end();
        } catch (error) {
            if (!started && !closed && !res.headersSent) {
                sendError(res, errorStatus(error), error.code || 'AI_ERROR', error.message);
            } else if (!closed) {
                res.end();
            }
        }
    }

    /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res */
    async function handler(req, res) {
        try {
            if (!sameOrigin(req) && req.method !== 'GET' && req.method !== 'HEAD') {
                return sendError(res, 403, 'CROSS_ORIGIN', 'Requisição cross-origin bloqueada.');
            }
            const url = new URL(req.url || '/', 'http://gateway.local');
            const path = url.pathname;
            if (path === '/health' && req.method === 'GET') {
                return sendJson(res, 200, { status: 'ok', service: 'unkayos-gateway' });
            }
            if (path === '/ready' && req.method === 'GET') {
                return sendJson(res, 200, { status: 'ready', policyVersion: policy.policyVersion });
            }
            if (path === '/session') {
                if (req.method !== 'GET') return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não suportado.');
                return await handleSession(req, res);
            }
            if (path === '/session/login') {
                if (!(req.method === 'POST' || (oidc && req.method === 'GET'))) {
                    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não suportado.');
                }
                return await handleLogin(req, res);
            }
            if (path === '/session/login/callback') {
                if (req.method !== 'GET') return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não suportado.');
                return await handleCallback(req, res, url);
            }
            if (path === '/session/logout') {
                if (req.method !== 'POST') return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não suportado.');
                return await handleLogout(req, res);
            }
            if (path === '/access/evaluate') {
                if (req.method !== 'POST') return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não suportado.');
                const { session } = currentSession(req);
                return await handleEvaluate(req, res, session);
            }
            if (ai && path === `${config.ai.basePath}/chat`) {
                if (req.method !== 'POST') return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não suportado.');
                const { session } = currentSession(req);
                return await handleAi(req, res, session, false);
            }
            if (ai && path === `${config.ai.basePath}/chat/stream`) {
                if (req.method !== 'POST') return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não suportado.');
                const { session } = currentSession(req);
                return await handleAi(req, res, session, true);
            }
            if (staticHandler && (req.method === 'GET' || req.method === 'HEAD') && await staticHandler(req, res, url)) {
                return;
            }
            return sendError(res, 404, 'NOT_FOUND', 'Rota não encontrada.');
        } catch (error) {
            if (res.headersSent) {
                if (!res.writableEnded) res.end();
                return;
            }
            if (error instanceof GatewayError) return sendError(res, error.status, error.code, error.message);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Falha interna do gateway.');
        }
    }

    return {
        handler,
        sessions,
        metadata,
        policy,
        close() {
            sessions.stop();
        }
    };
}
