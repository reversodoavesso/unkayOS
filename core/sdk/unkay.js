// core/sdk/unkay.js - unkayOS 2.0 Unified SDK
// Composition root: binds the host-agnostic features to unkayOS systems.
// Features live in core/features/* and never import unkayOS internals.

import { wasmFileSystem } from '../WasmFileSystem.js';
import { fullscreenManager } from '../FullscreenManager.js';
import { contextMenuManager } from '../ContextMenuManager.js';
import { keyboardManager } from '../KeyboardManager.js';

import { createKv } from '../features/kv/index.js';
import { createAuth, mapUserTier } from '../features/auth/index.js';
import { createFs } from '../features/fs/index.js';
import { createAi } from '../features/ai/index.js';
import { createPackages } from '../features/packages/index.js';
import { createWindow } from '../features/window/index.js';
import { createContextMenu } from '../features/context-menu/index.js';
import { createShortcuts } from '../features/shortcuts/index.js';
import { createAccess } from '../features/access/index.js';
import { unavailable } from '../features/serviceError.js';

/**
 * Builds the standard application SDK.
 *
 * @param {any} [appCore]
 * @param {{ getSystem(name: string): any } | null} [systemManager]
 * @param {{ aiEnabled?: boolean, syncEnabled?: boolean }} [options]
 */
export function createUnkaySDK(appCore = null, systemManager = null, options = {}) {
    const { aiEnabled = true, syncEnabled = true } = options;
    // Explicit manager is authoritative: never fall back to another host's services.
    const getSystem = name => (systemManager || (typeof window !== 'undefined' ? /** @type {any} */ (window).systemManager : null))?.getSystem(name);
    const getAuth = () => getSystem('authSystem') || (!systemManager && typeof window !== 'undefined' ? window.authSystem : null);
    const getVfs = () => (typeof window !== 'undefined' && window.wasmFileSystem) || wasmFileSystem;
    const getFullscreen = () => systemManager?.getSystem('fullscreenManager') || (typeof window !== 'undefined' && window.fullscreenManager) || fullscreenManager;
    const getContextMenu = () => systemManager?.getSystem('contextMenuManager') || (typeof window !== 'undefined' && window.contextMenuManager) || contextMenuManager;
    const getKeyboard = () => systemManager?.getSystem('keyboardManager') || (typeof window !== 'undefined' && window.keyboardManager) || keyboardManager;
    const getPackages = () => {
        const manager = (systemManager || (typeof window !== 'undefined' && window.systemManager))?.getSystem('packageManager');
        if (!manager) throw new Error('Gerenciador de pacotes indisponível.');
        return manager;
    };
    const getStorage = () => (typeof localStorage !== 'undefined' ? localStorage : null);
    /** Stable, path-safe identity of the current principal for private storage. */
    const principalStorageKey = () => {
        let user = null;
        try {
            user = getAuth()?.getCurrentUser?.() || null;
        } catch {
            user = null;
        }
        const value = String(user?.id || user?.sub || 'guest').replace(/[^A-Za-z0-9_-]/g, '');
        return value.slice(0, 64) || 'guest';
    };

    const auth = createAuth({
        mapTier: user => getSystem('accessPolicy')?.getTier?.(user) || mapUserTier(user),
        provider: {
            getCurrentUser: () => getAuth()?.getCurrentUser?.() || null,
            getAuthToken: () => getAuth()?.getAuthToken?.() || null,
            login: () => getAuth()?.login?.(),
            logout: () => getAuth()?.logout?.()
        }
    });

    const fs = createFs({
        adapter: {
            flush: () => getVfs().flush(),
            readFile: (path, options) => getVfs().readFile(path, options),
            writeFile: (path, content) => getVfs().writeFile(path, content),
            readdir: path => getVfs().readdir(path),
            stat: path => getVfs().stat(path),
            exists: path => getVfs().exists(path),
            mkdir: (path, options) => getVfs().mkdir(path, options),
            remove: (path, options) => getVfs().remove(path, options),
            async mountLocalDirectory() {
                if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
                    throw new Error('File System Access API not supported in this browser');
                }
                try {
                    const dirHandle = await window.showDirectoryPicker();
                    const mountPath = `/mnt/host_${dirHandle.name}`;
                    await getVfs().mkdir(mountPath, { recursive: true });
                    return mountPath;
                } catch (err) {
                    if (err && /** @type {any} */ (err).name === 'AbortError') {
                        throw new Error('User cancelled directory picker');
                    }
                    throw err;
                }
            }
        },
        syncCloud: async () => {
            const adapter = syncEnabled && getSystem('syncService');
            if (!adapter) throw unavailable('Sincronização não disponível nesta versão do unkayOS.');
            return adapter.sync();
        }
    });

    const packages = createPackages({
        manager: {
            list: () => getPackages().list(),
            getStatus: id => getPackages().getStatus(id),
            refresh: options => getPackages().refresh(options),
            install: id => getPackages().install(id),
            installLocal: bundle => getPackages().installLocal(bundle),
            uninstall: id => getPackages().uninstall(id),
            open: id => getPackages().open(id),
            subscribe: listener => getPackages().subscribe(listener),
            get catalogError() {
                return getPackages().catalogError;
            }
        }
    });

    const ai = createAi({ adapter: () => aiEnabled ? getSystem('aiService') : null });

    const kv = createKv({
        storage: getStorage(),
        // Private app data is scoped by principal; the previous unscoped namespace
        // is read once and migrated lazily so upgrades keep their values.
        namespace: `${principalStorageKey()}::${appCore?.app_name || 'global'}`,
        legacyNamespace: appCore?.app_name || 'global'
    });

    const windowApi = createWindow({
        controller: {
            setTitle(title) {
                if (appCore?.windowElement) {
                    const titleEl = appCore.windowElement.querySelector('.window-title, .app__top_bar__app_name');
                    if (titleEl) titleEl.textContent = title;
                }
            },
            setSize(width, height) {
                if (appCore?.windowElement) {
                    appCore.windowElement.style.width = typeof width === 'number' ? `${width}px` : width;
                    appCore.windowElement.style.height = typeof height === 'number' ? `${height}px` : height;
                }
            },
            minimize() {
                if (appCore?.windowSystem?.minimizeWindow) {
                    appCore.windowSystem.minimizeWindow();
                    return;
                }
                const appWindowSystem = systemManager?.getSystem('appWindowSystem');
                if (appCore && appWindowSystem?.minimizeWindow) {
                    appWindowSystem.minimizeWindow(appCore.instanceId);
                }
            },
            maximize() {
                appCore?.windowSystem?.toggleMaximizeWindow?.();
            },
            snap(zone) {
                appCore?.windowSystem?.snapTo?.(zone);
            },
            center() {
                appCore?.windowSystem?.centerWindow?.();
            },
            close() {
                const appManager = systemManager?.getSystem('appManager') || (typeof window !== 'undefined' ? window.appManager : null);
                if (appCore && appManager?.closeApp) {
                    appManager.closeApp(appCore.instanceId);
                }
            },
            toggleFullscreen: () => getFullscreen()?.toggleFullscreen?.(),
            isFullscreen: () => Boolean(getFullscreen()?.isFullscreen?.())
        }
    });

    const contextMenu = createContextMenu({
        provider: {
            register(target, builder = null) {
                if (!appCore?.instanceId) return () => {};
                return getContextMenu()?.registerAppProvider?.(appCore.instanceId, target, builder);
            },
            open(items, options = {}) {
                return getContextMenu()?.openCustomMenu?.(items, options);
            },
            close() {
                return getContextMenu()?.closeMenu?.();
            }
        }
    });

    const shortcuts = createShortcuts({
        keyboard: {
            getSystemShortcuts: () => getKeyboard()?.getSystemShortcuts?.() || []
        }
    });

    return {
        auth,
        access: createAccess({ provider: {
            evaluate: (action, resource) => {
                const policy = getSystem('accessPolicy');
                return policy?.evaluate(action, resource) || { allowed: false, reason: 'POLICY_UNAVAILABLE' };
            }
        } }),
        fs,
        packages,
        ai,
        kv,
        window: windowApi,
        contextMenu,
        shortcuts
    };
}

// Global default SDK instance
export const unkay = createUnkaySDK();
