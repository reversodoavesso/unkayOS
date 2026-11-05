// core/SystemManager.js - v2.0.0
// Boot composition for unkayOS. Systems are now registered and started as kernel
// features (core/host/unkayosFeatures.js) instead of hardcoded phases.

import { Kernel } from './kernel/index.js';
import { createUnkayosFeatures } from './host/unkayosFeatures.js';

import eventBus from './eventBus.js';
import { fileSystem, fs } from './FileSystem.js';
import { keyboardManager } from './KeyboardManager.js';
import { windowLayerManager } from './WindowLayerManager.js';
import { dragManager } from './DragManager.js';
import { positionManager } from './PositionManager.js';
import { loadingManager } from './LoadingManager.js';
import { loadingUI } from './LoadingUI.js';
import { lazyResourceLoader } from './LazyResourceLoader.js';
import { wasmFileSystem, wasmFs } from './WasmFileSystem.js';
import { unkay } from './sdk/unkay.js';
import { fullscreenManager } from './FullscreenManager.js';
import { contextMenuManager } from './ContextMenuManager.js';

/** Systems exposed through the legacy `getSystem()` view. */
const SYSTEM_NAMES = Object.freeze([
    'eventBus',
    'fileSystem',
    'fs',
    'keyboardManager',
    'windowLayerManager',
    'dragManager',
    'positionManager',
    'loadingManager',
    'loadingUI',
    'lazyResourceLoader',
    'wasmFileSystem',
    'wasmFs',
    'unkaySDK',
    'fullscreenManager',
    'contextMenuManager',
    'authSystem',
    'appManager',
    'packageManager',
    'appFeatureRegistry',
    'hostProfile',
    'accessPolicy',
    'aiService',
    'syncService'
]);

/** App-declared capability -> internal system name. */
const CAPABILITY_SYSTEMS = Object.freeze({
    auth: 'authSystem',
    fs: 'fs',
    packages: 'packageManager',
    ai: 'aiService',
    sync: 'syncService',
    window: 'appManager'
});

/**
 * SystemManager - kernel-backed boot coordinator.
 *
 * Responsibilities:
 * - compose host features and start them in dependency order;
 * - keep the legacy `getSystem()` surface for apps and core modules;
 * - own the startup/shutdown lifecycle.
 */
export class SystemManager {
    /**
     * @param {object} [options]
     * @param {typeof createUnkayosFeatures} [options.featureFactory] Test seam.
     * @param {() => any} [options.identityProvider]
     * @param {any} [options.deployment]
     */
    constructor(options = {}) {
        this.isInitialized = false;
        this.isInitializing = false;
        this.initializationPromise = null;

        this.featureFactory = options.featureFactory || createUnkayosFeatures;
        this.identityProvider = typeof options.identityProvider === 'function' ? options.identityProvider : null;
        this.deployment = options.deployment || null;

        /** @type {Kernel | null} */
        this.kernel = null;

        // Synchronous singletons remain available before boot (notably eventBus).
        this.systems = {
            eventBus,
            fileSystem,
            fs,
            keyboardManager,
            windowLayerManager,
            dragManager,
            positionManager,
            loadingManager,
            loadingUI,
            lazyResourceLoader,
            wasmFileSystem,
            wasmFs,
            unkaySDK: unkay,
            fullscreenManager,
            contextMenuManager,
            authSystem: null,
            appManager: null,
            packageManager: null,
            appFeatureRegistry: null
        };

        this.config = {
            desktop: null,
            appConfigs: []
        };

        this.systemEventListeners = new Map();

        console.log('[SystemManager] Instância criada');
    }

    /**
     * Registra e inicia todas as features do host.
     *
     * @param {HTMLElement} desktopElement
     * @returns {Promise<void>}
     */
    async initialize(desktopElement) {
        if (this.isInitialized) {
            console.warn('[SystemManager] Sistema já foi inicializado');
            return;
        }

        if (this.isInitializing) {
            console.warn('[SystemManager] Sistema já está sendo inicializado, aguardando...');
            return this.initializationPromise;
        }

        this.isInitializing = true;
        this.config.desktop = desktopElement;
        this.initializationPromise = this._performInitialization();

        try {
            await this.initializationPromise;
            this.isInitialized = true;
            this.isInitializing = false;
            console.log('[SystemManager] Todos os sistemas inicializados com sucesso');

            this.systems.eventBus.emit('system:ready', {
                timestamp: new Date().toISOString(),
                systems: Object.keys(this.systems)
            });
        } catch (error) {
            this.isInitializing = false;
            console.error('[SystemManager] Erro durante inicialização:', error);
            throw error;
        }
    }

    /**
     * @private
     */
    async _performInitialization() {
        console.log('[SystemManager] Iniciando features do kernel...');

        this.kernel = new Kernel();
        const features = await this.featureFactory({
            getDesktop: () => this.config.desktop,
            systemManager: this,
            identityProvider: this.identityProvider,
            deployment: this.deployment
        });
        this.kernel.register(features);

        await this.kernel.start();
        this._syncSystemsFromKernel();

        this.config.appConfigs = /** @type {any[]} */ (this.kernel.get('appConfigs')) || [];
        console.log('[SystemManager] Kernel pronto:', this.kernel.describe().features.map(feature => feature.id).join(', '));
    }

    /**
     * Copies started capabilities into the legacy systems view.
     * @private
     */
    _syncSystemsFromKernel() {
        if (!this.kernel || this.kernel.state !== 'running') return;
        for (const name of SYSTEM_NAMES) {
            const value = this.kernel.get(name);
            if (value !== undefined && value !== null) {
                this.systems[name] = value;
            }
        }
    }

    /**
     * Obtém uma instância de sistema.
     * @param {string} systemName
     * @returns {object|null}
     */
    getSystem(systemName) {
        const running = this.kernel?.get(systemName);
        if (running !== undefined && running !== null) return running;

        const value = this.systems[systemName] || null;
        if (!this.isInitialized && systemName !== 'eventBus' && value === null) {
            console.warn(`[SystemManager] Sistema ${systemName} solicitado antes da inicialização completa`);
        }

        return value;
    }

    /**
     * Checks whether an app-declared capability is available.
     * Does not warn before initialization (used during boot).
     *
     * @param {string} capability
     * @returns {boolean}
     */
    hasCapability(capability) {
        const systemName = CAPABILITY_SYSTEMS[capability] || capability;
        const fromKernel = this.kernel?.get(systemName);
        return Boolean(fromKernel ?? this.systems[systemName]);
    }

    /**
     * Obtém todos os sistemas (somente leitura).
     * @returns {object}
     */
    getAllSystems() {
        const all = { ...this.systems };
        if (this.kernel?.state === 'running') {
            for (const capability of this.kernel.describe().capabilities) {
                all[capability] = this.kernel.get(capability);
            }
        }
        return all;
    }

    /**
     * Registra um listener de evento do sistema.
     * @param {string} event
     * @param {function} callback
     * @param {string|null} [listenerId]
     */
    onSystemEvent(event, callback, listenerId = null) {
        const id = listenerId || `listener_${Date.now()}_${Math.random()}`;

        this.systems.eventBus.on(event, callback);

        if (!this.systemEventListeners.has(event)) {
            this.systemEventListeners.set(event, new Set());
        }
        this.systemEventListeners.get(event).add({ id, callback });

        return id;
    }

    /**
     * Remove um listener de evento do sistema.
     * @param {string} event
     * @param {string} listenerId
     */
    offSystemEvent(event, listenerId) {
        if (!this.systemEventListeners.has(event)) return;

        const listeners = this.systemEventListeners.get(event);
        for (const listener of listeners) {
            if (listener.id === listenerId) {
                this.systems.eventBus.off(event, listener.callback);
                listeners.delete(listener);
                break;
            }
        }
    }

    /**
     * Executa shutdown limpo de todos os sistemas.
     * Stop hooks owned by the features clean up apps, menus and the wasm VFS.
     * @returns {Promise<void>}
     */
    async shutdown() {
        if (!this.isInitialized) {
            console.warn('[SystemManager] Sistema não está inicializado');
            return;
        }

        console.log('[SystemManager] Iniciando shutdown...');

        try {
            this.systems.eventBus.emit('system:shutdown', {
                timestamp: new Date().toISOString()
            });

            if (this.kernel) {
                await this.kernel.stop();
            }

            this.systemEventListeners.clear();
            this.systems.authSystem = null;
            this.systems.appManager = null;
            this.systems.packageManager = null;
            this.systems.appFeatureRegistry = null;

            this.isInitialized = false;
            console.log('[SystemManager] Shutdown concluído');
        } catch (error) {
            console.error('[SystemManager] Erro durante shutdown:', error);
            throw error;
        }
    }

    /**
     * Obtém estatísticas do sistema.
     * @returns {object}
     */
    getSystemStats() {
        return {
            isInitialized: this.isInitialized,
            isInitializing: this.isInitializing,
            systemsLoaded: Object.keys(this.systems).filter(key => this.systems[key] !== null),
            profile: /** @type {any} */ (this.kernel?.get('hostProfile'))?.id || null,
            runningApps: this.systems.appManager ? this.systems.appManager.runningApps.size : 0,
            kernel: this.kernel ? this.kernel.describe() : null,
            eventListeners: Array.from(this.systemEventListeners.entries()).map(([event, listeners]) => ({
                event,
                count: listeners.size
            }))
        };
    }
}

// Instância singleton global
export const systemManager = new SystemManager();

// Expose no window para compatibilidade (será removido gradualmente)
if (typeof window !== 'undefined') {
    window.systemManager = systemManager;
}
