// core/host/services/gatewayIdentity.js
// Identity adapter for a same-origin BFF session. The browser never receives a
// provider token: only the normalized principal exposed by the gateway.

const DEFAULTS = Object.freeze({
    basePath: '',
    loginPath: '/session/login',
    logoutPath: '/session/logout',
    timeoutMs: 10000,
    csrfHeader: 'x-unkay-csrf'
});

/**
 * @param {object} options
 * @param {typeof fetch} [options.transport]
 * @param {string} [options.basePath]
 * @param {string} [options.loginPath]
 * @param {string} [options.logoutPath]
 * @param {number} [options.timeoutMs]
 * @param {string} [options.csrfHeader]
 * @param {(url: string) => void} [options.navigate]
 */
export function createGatewayIdentity(options = {}) {
    const config = { ...DEFAULTS, ...options };
    const transport = options.transport || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    const navigate = options.navigate || (url => { if (typeof location !== 'undefined') location.assign(url); });
    if (!transport) throw new Error('Gateway identity requires a fetch transport.');
    /** @type {any} */
    let session = null;
    /** @type {Map<string, Set<(payload?: unknown) => void>>} */
    const listeners = new Map();
    /** @type {Set<AbortController>} */
    const pending = new Set();
    let destroyed = false;
    let lastIdentity = null;

    const emit = (event, payload) => {
        for (const listener of [...(listeners.get(event) || [])]) {
            try {
                listener(payload);
            } catch {
                // A listener must never break the identity adapter.
            }
        }
    };

    const on = (event, callback) => {
        if (typeof callback !== 'function') return () => {};
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(callback);
        return () => listeners.get(event)?.delete(callback);
    };

    const off = (event, callback) => listeners.get(event)?.delete(callback);

    const csrf = () => (typeof session?.csrfToken === 'string' ? session.csrfToken : '');

    async function request(path, init = {}) {
        if (destroyed) throw Object.assign(new Error('Gateway identity destroyed.'), { code: 'CANCELLED' });
        const controller = new AbortController();
        pending.add(controller);
        const timer = setTimeout(() => controller.abort(new DOMException('Identity request timeout.', 'TimeoutError')), config.timeoutMs);
        const abort = () => controller.abort(init.signal?.reason);
        init.signal?.addEventListener('abort', abort, { once: true });
        try {
            return await transport(path, {
                method: 'GET',
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

    /** @param {string} path @param {RequestInit} init */
    async function requestJson(path, init) {
        const response = await request(path, init);
        let body = null;
        try {
            body = await response.json();
        } catch {
            body = null;
        }
        if (!response.ok) {
            const error = Object.assign(new Error(body?.error?.message || `Gateway HTTP ${response.status}.`), {
                code: body?.error?.code || (response.status === 401 ? 'UNAUTHENTICATED' : response.status === 403 ? 'FORBIDDEN' : 'SERVICE_UNAVAILABLE'),
                status: response.status
            });
            throw error;
        }
        return body;
    }

    const user = () => {
        if (!session?.authenticated || !session.principal) return null;
        const groups = Array.isArray(session.principal.groups) ? [...session.principal.groups] : [];
        return {
            id: session.principal.id,
            name: session.principal.name || '',
            username: session.principal.name || '',
            provider: 'gateway',
            issuer: session.principal.issuer,
            roles: groups,
            groups,
            mfa: session.principal.mfa === true
        };
    };

    function adopt(next) {
        session = next;
        const current = user();
        const identity = current?.id || null;
        if (identity !== lastIdentity) {
            lastIdentity = identity;
            emit('change', current);
        }
        return session;
    }

    async function refresh(options = {}) {
        const body = await requestJson(`${config.basePath}/session`, { signal: options.signal });
        return adopt(body);
    }

    const providerInfo = () => {
        const mode = session?.installation?.identity?.mode || 'local';
        const requiresLogin = session?.installation?.identity?.requiresLogin === true;
        return {
            id: 'gateway',
            label: requiresLogin ? 'Sessão do servidor' : 'Sessão local do servidor',
            providerName: mode === 'oidc' ? 'servidor desta instalação' : 'este dispositivo',
            mode,
            supportsLogin: true,
            supportsLogout: Boolean(session?.authenticated),
            loginLabel: requiresLogin ? 'Entrar' : null,
            accountLabel: session?.principal?.name || 'visitante',
            connectedDescription: 'Sessão gerenciada pelo servidor da instalação, sem tokens no navegador.',
            loginDescription: requiresLogin
                ? 'Entre pelo provedor configurado nesta instalação.'
                : 'Esta instalação usa uma sessão local emitida pelo servidor.'
        };
    };

    async function login() {
        await refresh();
        const requiresLogin = session?.installation?.identity?.requiresLogin === true;
        if (requiresLogin) {
            navigate(`${config.basePath}${config.loginPath}`);
            return null;
        }
        const body = await requestJson(`${config.basePath}${config.loginPath}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', [config.csrfHeader]: csrf() },
            body: '{}'
        });
        adopt(body);
        return user();
    }

    async function logout() {
        if (session?.csrfToken) {
            await requestJson(`${config.basePath}${config.logoutPath}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', [config.csrfHeader]: csrf() },
                body: '{}'
            }).catch(() => null);
        }
        session = null;
        lastIdentity = null;
        emit('change', null);
        emit('logout');
        return null;
    }

    async function authenticatedRequest(path, init = {}) {
        if (!session?.csrfToken) await refresh();
        return request(`${config.basePath}${path}`, {
            ...init,
            headers: {
                ...(init.headers || {}),
                ...(csrf() ? { [config.csrfHeader]: csrf() } : {})
            }
        });
    }

    const api = {
        isAuthenticated: () => session?.authenticated === true,
        getCurrentUser: user,
        getUserPrompt: () => user()?.name || 'guest@local',
        login,
        logout,
        hasPermission: () => false,
        hasRole: () => false,
        on,
        off,
        getAuthToken: () => null,
        getProviderInfo: providerInfo,
        authenticatedRequest
    };

    return {
        ready: refresh().catch(error => {
            // A missing gateway must not look like an authenticated session.
            if (error?.code !== 'CANCELLED') console.warn('[gateway-identity] Sessão indisponível:', error.message);
        }),
        isAuthenticated: api.isAuthenticated,
        getCurrentUser: user,
        getAuthToken: () => null,
        login,
        logout,
        hasPermission: api.hasPermission,
        hasRole: api.hasRole,
        on,
        off,
        emit,
        refresh,
        getAPI: () => api,
        getProviderInfo: providerInfo,
        destroy: () => {
            destroyed = true;
            for (const controller of pending) controller.abort();
            pending.clear();
            listeners.clear();
        }
    };
}
