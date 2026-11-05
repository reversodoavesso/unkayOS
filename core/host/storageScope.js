// core/host/storageScope.js
// Binds private storage (VFS snapshot, legacy migration) to the current
// installation + principal and coordinates identity changes across tabs.
//
// Device-scoped preferences (appearance, shell) intentionally stay outside this
// scope: they belong to the device, not to a private document of the principal.

import { defineFeature } from '../kernel/index.js';
import { deriveStorageNamespace } from '../utils/storageNamespace.js';

export const STORAGE_SCOPE_KEY = 'unkayos_storage_scope';
export const STORAGE_SCOPE_CHANNEL = 'unkayos-storage-scope';

/**
 * @param {object} options
 * @param {any} options.wasmFileSystem
 * @param {any} options.authSystem
 * @param {any} [options.deployment]
 * @param {{ getItem(key: string): string | null, setItem(key: string, value: string): void } | null} [options.storage]
 * @param {{ postMessage(value: any): void, close?(): void, onmessage?: ((event: any) => void) | null } | null} [options.channel]
 * @param {any} [options.window]
 * @param {{ warn?: (...args: any[]) => void, error?: (...args: any[]) => void, info?: (...args: any[]) => void }} [options.logger]
 */
export function createStorageScope(options) {
    const { wasmFileSystem, authSystem, deployment = null } = options;
    const storage = options.storage === undefined
        ? (typeof localStorage !== 'undefined' ? localStorage : null)
        : options.storage;
    const hostWindow = options.window === undefined ? (typeof window !== 'undefined' ? window : null) : options.window;
    const channel = options.channel === undefined
        ? (typeof BroadcastChannel === 'function' ? new BroadcastChannel(STORAGE_SCOPE_CHANNEL) : null)
        : options.channel;
    const logger = options.logger || (typeof console !== 'undefined' ? console : { warn: () => {} });
    if (!wasmFileSystem || typeof wasmFileSystem.switchNamespace !== 'function') {
        throw new TypeError('Storage scope requires a VFS adapter with switchNamespace().');
    }

    let currentId = null;
    let queue = Promise.resolve();
    let started = false;
    let unsubscribeAuth = null;
    let unsubscribeStorage = null;

    const currentPrincipal = () => {
        try {
            return authSystem?.getCurrentUser?.() || null;
        } catch {
            return null;
        }
    };

    /** Local/device identities never sign in; remote identities must not claim legacy data before login. */
    const supportsInteractiveLogin = () => {
        try {
            return authSystem?.getProviderInfo?.()?.supportsLogin === true;
        } catch {
            // Unknown provider: assume it can authenticate and defer the migration.
            return true;
        }
    };

    const derive = () => deriveStorageNamespace({
        installationId: deployment?.installationId,
        principal: currentPrincipal()
    });

    const announce = namespaceId => {
        try {
            storage?.setItem(STORAGE_SCOPE_KEY, namespaceId);
        } catch {
            // Quota or privacy mode: cross-tab announcement is best-effort.
        }
        try {
            channel?.postMessage?.({ scope: namespaceId });
        } catch {
            // Channel closed; the local scope is still applied.
        }
    };

    async function apply(reason) {
        const principal = currentPrincipal();
        const namespace = await deriveStorageNamespace({
            installationId: deployment?.installationId,
            principal
        });
        if (namespace.id === currentId) return currentId;
        await wasmFileSystem.flush?.().catch(() => {});
        const info = await wasmFileSystem.switchNamespace(namespace.id);
        currentId = info?.namespace || namespace.id;
        // The pre-namespace snapshot is claimed exactly once. An installation that
        // can authenticate only claims it after a real principal exists; otherwise
        // legacy files would be stranded in the anonymous namespace.
        if (principal || !supportsInteractiveLogin()) {
            try {
                await wasmFileSystem.claimLegacy?.();
            } catch (error) {
                logger.warn?.('[storage-scope] Migração legada indisponível:', error?.message || error);
            }
        } else {
            logger.info?.('[storage-scope] Migração legada adiada até o primeiro login.');
        }
        announce(currentId);
        logger.info?.(`[storage-scope] Escopo privado: ${currentId} (${reason}).`);
        return currentId;
    }

    function refresh(reason = 'refresh') {
        if (!started) return Promise.resolve(currentId);
        queue = queue.then(() => apply(reason)).catch(error => {
            logger.error?.('[storage-scope] Falha ao trocar o escopo privado:', error);
            return currentId;
        });
        return queue;
    }

    /** Re-evaluate after another tab announced an identity change. */
    function onRemoteChange(payload) {
        const scope = payload?.scope;
        if (typeof scope !== 'string' || scope === currentId) return;
        // Refresh the local session before switching: the announcement is a hint,
        // never an authorization to adopt another identity's namespace.
        Promise.resolve()
            .then(() => authSystem?.refresh?.())
            .then(() => refresh('remote-change'))
            .catch(error => logger.warn?.('[storage-scope] Sessão remota indisponível:', error?.message || error));
    }

    function start() {
        if (started) return queue;
        started = true;
        unsubscribeAuth = authSystem?.on?.('change', () => { void refresh('identity-change'); }) || null;
        if (channel) {
            channel.onmessage = event => onRemoteChange(event?.data);
        }
        if (hostWindow?.addEventListener) {
            const listener = event => {
                if (event?.key !== STORAGE_SCOPE_KEY || !event.newValue) return;
                onRemoteChange({ scope: event.newValue });
            };
            hostWindow.addEventListener('storage', listener);
            unsubscribeStorage = () => hostWindow.removeEventListener('storage', listener);
        }
        return refresh('boot');
    }

    function destroy() {
        started = false;
        unsubscribeAuth?.();
        unsubscribeStorage?.();
        unsubscribeAuth = null;
        unsubscribeStorage = null;
        if (channel) {
            channel.onmessage = null;
            channel.close?.();
        }
    }

    return {
        get id() {
            return currentId;
        },
        derive,
        start,
        refresh,
        destroy
    };
}

/**
 * @param {{ deployment?: any }} [options]
 */
export function createStorageScopeFeature(options = {}) {
    return defineFeature({
        id: 'storage-scope',
        version: '1.0.0',
        description: 'Per-principal private storage namespace and cross-tab coordination.',
        provides: ['storageScope'],
        requires: ['wasmFileSystem', 'authSystem'],
        after: ['wasm-vfs', 'auth'],
        setup: context => ({
            storageScope: createStorageScope({
                wasmFileSystem: context.require('wasmFileSystem'),
                authSystem: context.require('authSystem'),
                deployment: options.deployment,
                logger: context.logger
            })
        }),
        start: async context => {
            await /** @type {any} */ (context.get('storageScope'))?.start();
        },
        stop: (_context, api) => {
            api.storageScope?.destroy();
        }
    });
}

