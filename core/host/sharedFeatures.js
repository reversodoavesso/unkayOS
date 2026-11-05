// core/host/sharedFeatures.js
// Host feature builders shared by the `rda` and `standalone` profiles.
// Everything here binds the kernel to unkayOS host modules; the profiles decide
// which identity, package and app policy is composed.

import { defineFeature } from '../kernel/index.js';

import eventBus from '../eventBus.js';
import { fileSystem, fs } from '../FileSystem.js';
import { keyboardManager } from '../KeyboardManager.js';
import { windowLayerManager } from '../WindowLayerManager.js';
import { dragManager } from '../DragManager.js';
import { positionManager } from '../PositionManager.js';
import { loadingManager } from '../LoadingManager.js';
import { loadingUI } from '../LoadingUI.js';
import { lazyResourceLoader } from '../LazyResourceLoader.js';
import { wasmFileSystem, wasmFs } from '../WasmFileSystem.js';
import { fullscreenManager } from '../FullscreenManager.js';
import { contextMenuManager } from '../ContextMenuManager.js';
import { hostDropManager } from '../HostDropManager.js';
import { migrateLegacyStorage } from '../utils/storageMigration.js';
import { AppManager } from '../AppManager.js';
import { AppFeatureRegistry } from '../apps/AppFeatureRegistry.js';

/**
 * Host primitives that exist in every profile.
 *
 * @param {{ sdk: object }} options
 */
export function createBaseFeatures({ sdk }) {
    if (!sdk) throw new TypeError('createBaseFeatures requires an SDK instance.');

    return [
        defineFeature({
            id: 'events',
            version: '1.0.0',
            description: 'Global event bus.',
            provides: ['eventBus'],
            setup: () => ({ eventBus })
        }),
        defineFeature({
            id: 'core-fs',
            version: '1.0.0',
            description: 'Legacy JavaScript file system.',
            provides: ['fileSystem', 'fs'],
            setup: () => ({ fileSystem, fs })
        }),
        defineFeature({
            id: 'keyboard',
            provides: ['keyboardManager'],
            setup: () => ({ keyboardManager })
        }),
        defineFeature({
            id: 'window-layer',
            provides: ['windowLayerManager'],
            setup: () => ({ windowLayerManager })
        }),
        defineFeature({
            id: 'drag',
            provides: ['dragManager'],
            setup: () => ({ dragManager })
        }),
        defineFeature({
            id: 'position',
            provides: ['positionManager'],
            setup: () => ({ positionManager })
        }),
        defineFeature({
            id: 'loading',
            provides: ['loadingManager', 'loadingUI'],
            setup: () => ({ loadingManager, loadingUI })
        }),
        defineFeature({
            id: 'lazy-resources',
            provides: ['lazyResourceLoader'],
            setup: () => ({ lazyResourceLoader })
        }),
        defineFeature({
            id: 'sdk',
            provides: ['unkaySDK'],
            setup: () => ({ unkaySDK: sdk })
        }),
        defineFeature({
            id: 'wasm-vfs',
            description: 'Wasm kernel and virtual file system.',
            provides: ['wasmFileSystem', 'wasmFs'],
            setup: () => ({ wasmFileSystem, wasmFs }),
            start: async context => {
                try {
                    await wasmFileSystem.initialize();
                    await migrateLegacyStorage(wasmFileSystem);
                } catch (error) {
                    // Keep the historical fallback: boot continues without the wasm VFS.
                    context.logger.warn('WasmFileSystem inicializado com fallback:', error);
                }
            },
            stop: () => {
                wasmFileSystem.shutdown?.();
            }
        }),
        defineFeature({
            id: 'fullscreen',
            provides: ['fullscreenManager'],
            setup: () => ({ fullscreenManager })
        }),
        defineFeature({
            id: 'context-menu',
            provides: ['contextMenuManager'],
            setup: () => ({ contextMenuManager }),
            stop: (_context, api) => {
                api.contextMenuManager.destroy?.();
            }
        })
    ];
}

/**
 * Apps that depend on RDA-only services are pinned off outside the RDA profile.
 * `user-profile` stays enabled because it renders a local identity view.
 */
export const RDA_ONLY_APP_OVERRIDES = Object.freeze({
    store: { enabled: false, locked: true },
    openui: { enabled: false, locked: true }
});

/**
 * @param {'rda' | 'standalone' | 'sso'} id
 * @param {{ sso?: boolean, marketplace?: boolean, ai?: boolean, compute?: boolean, rdaServices?: boolean }} [capabilities]
 */
export function createHostProfileFeature(id, capabilities = {}) {
    return defineFeature({
        id: 'host-profile',
        description: 'Active host profile.',
        provides: ['hostProfile'],
        setup: () => ({ hostProfile: Object.freeze({ id, capabilities: Object.freeze({ ...capabilities }) }) })
    });
}

/**
 * @param {object} options
 * @param {string} [options.id]
 * @param {string} [options.description]
 * @param {() => Promise<object> | object} options.create
 */
export function createAuthFeature(options) {
    const { id = 'auth', description = 'Identity provider.', create } = options;
    return defineFeature({
        id,
        description,
        provides: ['authSystem'],
        after: ['wasm-vfs'],
        setup: async () => {
            const authSystem = await create();
            if (authSystem?.ready) await authSystem.ready;
            return { authSystem };
        }
    });
}

export function createAppCatalogFeature() {
    return defineFeature({
        id: 'app-catalog',
        description: 'Declarative app catalog (apps.json).',
        provides: ['appConfigs'],
        after: ['auth'],
        setup: async () => {
            const response = await fetch('/apps/apps.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const jsonData = await response.json();
            return { appConfigs: jsonData.app_configs || [] };
        }
    });
}

/**
 * @param {object} options
 * @param {Record<string, { enabled?: boolean, locked?: boolean }>} [options.overrides]
 * @param {{ hasCapability(capability: string): boolean }} options.systemManager
 */
export function createAppFeaturesFeature({ systemManager, overrides = {} }) {
    return defineFeature({
        id: 'app-features',
        description: 'App feature registry with enable/disable and requirements.',
        provides: ['appFeatureRegistry'],
        requires: ['appConfigs'],
        setup: context => {
            const registry = new AppFeatureRegistry({
                isCapabilityAvailable: capability => systemManager.hasCapability(capability),
                storage: typeof localStorage !== 'undefined' ? localStorage : null
            });
            registry.register(
                .../** @type {Array<Record<string, any>>} */ (context.require('appConfigs')).map(config => {
                    const override = overrides[config.id] || {};
                    return {
                        id: config.id,
                        path: config.path,
                        requires: config.requires,
                        optionalRequires: config.optionalRequires,
                        enabled: override.enabled ?? (config.enabled !== false),
                        locked: override.locked ?? (config.locked === true)
                    };
                })
            );
            return { appFeatureRegistry: registry };
        }
    });
}

/** @param {{ getDesktop: () => HTMLElement | null }} options */
export function createAppManagerFeature({ getDesktop }) {
    return defineFeature({
        id: 'app-manager',
        description: 'Application lifecycle and window orchestration.',
        provides: ['appManager'],
        requires: ['appConfigs', 'appFeatureRegistry'],
        after: ['auth'],
        setup: async context => {
            const registry = /** @type {any} */ (context.require('appFeatureRegistry'));
            const appManager = new AppManager(
                getDesktop(),
                null,
                context.require('appConfigs'),
                { appFeatureRegistry: registry }
            );
            await appManager.loadAppConfigs();
            appManager.appFeatureUnsubscribe = registry.subscribe(() => {
                appManager.syncAppFeatures().catch(error => {
                    context.logger.error('Falha ao sincronizar o catálogo de apps:', error);
                });
            });
            return { appManager };
        },
        stop: async (_context, api) => {
            api.appManager.appFeatureUnsubscribe?.();
            await api.appManager.killAll();
        }
    });
}

/** @param {{ getDesktop: () => HTMLElement | null }} options */
export function createShellFeature({ getDesktop }) {
    return defineFeature({
        id: 'shell',
        description: 'Desktop shell integrations and autorun apps.',
        provides: ['shellRuntime'],
        requires: ['appManager', 'contextMenuManager', 'windowLayerManager'],
        setup: () => {
            const shellRuntime = { started: false };
            return { shellRuntime };
        },
        start: async context => {
            const appManager = /** @type {any} */ (context.require('appManager'));
            await appManager.initAutorunApps();

            const desktop = getDesktop();
            if (desktop) {
                hostDropManager.initialize(desktop);
                contextMenuManager.initialize(desktop);
            }

            const shellRuntime = /** @type {{ started: boolean }} */ (context.get('shellRuntime'));
            shellRuntime.started = true;
        }
    });
}
