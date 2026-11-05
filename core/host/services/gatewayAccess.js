// core/host/services/gatewayAccess.js
// Remote authorization adapter. Deny by default and on every transport failure:
// a network error must never be interpreted as permission.

const DEFAULTS = Object.freeze({
    basePath: '',
    sessionPath: '/session',
    evaluatePath: '/access/evaluate',
    timeoutMs: 8000,
    cacheTtlMs: 5000,
    csrfHeader: 'x-unkay-csrf'
});

/**
 * @param {object} options
 * @param {typeof fetch} [options.transport]
 * @param {string} [options.basePath]
 * @param {string} [options.sessionPath]
 * @param {string} [options.evaluatePath]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.cacheTtlMs]
 * @param {string} [options.csrfHeader]
 * @param {() => number} [options.now]
 */
export function createGatewayAccess(options = {}) {
    const config = { ...DEFAULTS, ...options };
    const transport = options.transport || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    const now = options.now || Date.now;
    if (!transport) throw new Error('Gateway access requires a fetch transport.');
    let csrfToken = '';
    /** @type {Map<string, { at: number, decision: any }>} */
    const cache = new Map();
    /** @type {Set<AbortController>} */
    const pending = new Set();
    let destroyed = false;

    const deny = reason => Object.freeze({ allowed: false, reason, policyVersion: null });

    async function send(path, init) {
        if (destroyed) throw Object.assign(new Error('Gateway access destroyed.'), { code: 'CANCELLED' });
        const controller = new AbortController();
        pending.add(controller);
        const timer = setTimeout(() => controller.abort(new DOMException('Access request timeout.', 'TimeoutError')), config.timeoutMs);
        const abort = () => controller.abort(init.signal?.reason);
        init.signal?.addEventListener('abort', abort, { once: true });
        try {
            return await transport(path, {
                ...init,
                credentials: 'same-origin',
                redirect: 'error',
                signal: controller.signal,
                headers: { Accept: 'application/json', ...(init.headers || {}) }
            });
        } finally {
            clearTimeout(timer);
            init.signal?.removeEventListener('abort', abort);
            pending.delete(controller);
        }
    }

    async function ensureCsrf() {
        if (csrfToken) return csrfToken;
        const response = await send(`${config.basePath}${config.sessionPath}`, { method: 'GET' });
        if (!response.ok) throw Object.assign(new Error('Sessão indisponível.'), { code: 'UNAUTHENTICATED' });
        const body = await response.json().catch(() => null);
        if (typeof body?.csrfToken !== 'string' || body.csrfToken.length < 8) {
            throw Object.assign(new Error('Token CSRF ausente.'), { code: 'PROTOCOL_ERROR' });
        }
        csrfToken = body.csrfToken;
        return csrfToken;
    }

    /** @param {string} action @param {any} resource */
    function cacheKey(action, resource) {
        const resourceKey = resource && typeof resource === 'object'
            ? ['kind', 'model', 'ownerId'].map(name => `${name}=${resource[name] ?? ''}`).join('&')
            : '';
        return `${action}|${resourceKey}`;
    }

    /**
     * @param {string} action
     * @param {{ kind?: string, model?: string, ownerId?: string }} [resource]
     * @param {{ signal?: AbortSignal, cache?: boolean }} [options]
     */
    async function evaluate(action, resource = {}, options = {}) {
        if (typeof action !== 'string' || action.length === 0) return deny('ACTION_INVALID');
        const key = cacheKey(action, resource);
        const cached = cache.get(key);
        if (options.cache !== false && cached && now() - cached.at < config.cacheTtlMs) {
            return cached.decision;
        }
        try {
            let response = await evaluateOnce(action, resource, options);
            if (response.status === 403) {
                const mirror = typeof response.clone === 'function' ? response.clone() : response;
                const body = await mirror.json().catch(() => null);
                if (body?.error?.code === 'CSRF_INVALID') {
                    // The session rotated (login/logout in this or another tab).
                    csrfToken = '';
                    response = await evaluateOnce(action, resource, options);
                }
            }
            const body = await response.json().catch(() => null);
            if (response.status === 401) {
                csrfToken = '';
                return deny('UNAUTHENTICATED');
            }
            if (!response.ok || !body || typeof body.allowed !== 'boolean') {
                return deny(response.status === 403 ? 'FORBIDDEN' : 'SERVICE_UNAVAILABLE');
            }
            const decision = Object.freeze({
                allowed: body.allowed === true,
                reason: typeof body.reason === 'string' ? body.reason : (body.allowed === true ? 'ALLOW' : 'DEFAULT_DENY'),
                policyVersion: typeof body.policyVersion === 'string' ? body.policyVersion : null
            });
            if (options.cache !== false) {
                if (cache.size > 500) cache.clear();
                cache.set(key, { at: now(), decision });
            }
            return decision;
        } catch (error) {
            // Timeout, cancellation, malformed response and network failures are
            // all denied: availability problems are not authorizations.
            if (error?.code === 'UNAUTHENTICATED') return deny('UNAUTHENTICATED');
            return deny(error?.code === 'CANCELLED' ? 'CANCELLED' : 'SERVICE_UNAVAILABLE');
        }
    }

    async function evaluateOnce(action, resource, options) {
        const token = await ensureCsrf();
        return send(`${config.basePath}${config.evaluatePath}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', [config.csrfHeader]: token },
            body: JSON.stringify({ action, resource }),
            signal: options.signal
        });
    }

    return Object.freeze({
        evaluate,
        async can(action, resource = {}, options = {}) {
            return (await evaluate(action, resource, options)).allowed === true;
        },
        clear: () => cache.clear(),
        destroy: () => {
            destroyed = true;
            cache.clear();
            for (const controller of pending) controller.abort();
            pending.clear();
        }
    });
}
