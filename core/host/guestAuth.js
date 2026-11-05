// core/host/guestAuth.js
// Standalone identity provider. It deliberately avoids importing AuthSystem or
// the SSO configuration: the clean build runs without any RDA identity service.

import { createLocalAccess } from '../features/access/index.js';

/**
 * Minimal AuthSystem-compatible facade for the standalone profile.
 * Local actions are explicitly granted; unknown and remote actions are denied.
 */
export function createGuestAuthSystem() {
    const policy = createLocalAccess();
    const hasPermission = permission => policy.evaluate(permission).allowed;
    /** @type {Map<string, Set<(payload?: unknown) => void>>} */
    const listeners = new Map();

    const on = (event, callback) => {
        if (typeof callback !== 'function') return () => {};
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(callback);
        return () => off(event, callback);
    };

    const off = (event, callback) => {
        listeners.get(event)?.delete(callback);
    };

    const emit = (event, payload) => {
        for (const listener of [...(listeners.get(event) || [])]) {
            try {
                listener(payload);
            } catch {
                // Guest listeners must never break the host.
            }
        }
    };

    const login = async () => {
        console.info('[Standalone] SSO desativado nesta versão; a sessão permanece local.');
        return null;
    };

    const logout = async () => {
        emit('change', null);
    };

    const providerInfo = () => ({
        id: 'local',
        label: 'Sessão local',
        providerName: 'este dispositivo',
        mode: 'local',
        supportsLogin: false,
        supportsLogout: false,
        loginLabel: null,
        accountLabel: 'dispositivo',
        connectedDescription: 'Sessão local neste dispositivo.',
        loginDescription: 'Este dispositivo funciona sem conta externa. Seus dados ficam no navegador.'
    });

    const api = {
        isAuthenticated: () => false,
        getCurrentUser: () => null,
        getUserPrompt: () => 'guest@local',
        login,
        logout,
        hasPermission,
        hasRole: () => false,
        on,
        off,
        getAuthToken: () => null,
        getProviderInfo: providerInfo,
        authenticatedRequest: async () => {
            throw new Error('SSO indisponível nesta versão do unkayOS.');
        }
    };

    return {
        ready: Promise.resolve(),
        isAuthenticated: false,
        currentUser: null,
        authToken: null,
        getCurrentUser: () => null,
        getAuthToken: () => null,
        login,
        logout,
        hasPermission,
        hasRole: () => false,
        on,
        off,
        emit,
        getAPI: () => api,
        getProviderInfo: providerInfo,
        destroy: () => listeners.clear()
    };
}
