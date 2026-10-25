// core/SystemManager.js - v1.0.0
// Sistema centralizado de gerenciamento de estado para unkayOS

import { AppManager } from './AppManager.js';
import { AuthSystem } from './AuthSystem.js';
import { fileSystem, fs } from './FileSystem.js';
import { loadingManager } from './LoadingManager.js';
import { loadingUI } from './LoadingUI.js';
import { lazyResourceLoader } from './LazyResourceLoader.js';
import { keyboardManager } from './KeyboardManager.js';
import { windowLayerManager } from './WindowLayerManager.js';
import { dragManager } from './DragManager.js';
import { positionManager } from './PositionManager.js';
import eventBus from './eventBus.js';
import { wasmFileSystem, wasmFs } from './WasmFileSystem.js';
import { unkay } from './sdk/unkay.js';
import { migrateLegacyStorage } from './utils/storageMigration.js';
import { hostDropManager } from './HostDropManager.js';

/**
 * SystemManager - Gerenciador centralizado de todos os sistemas do unkayOS
 * 
 * Responsabilidades:
 * - Inicialização ordenada e controlada de todos os sistemas
 * - Gerenciamento de dependências entre sistemas
 * - Controle de ciclo de vida (startup, shutdown)
 * - Prevenção de vazamentos de memória
 * - Interface única para acesso aos sistemas
 */
export class SystemManager {
    constructor() {
        // Estado de inicialização
        this.isInitialized = false;
        this.isInitializing = false;
        this.initializationPromise = null;
        
        // Sistemas principais (singletons)
        this.systems = {
            eventBus: eventBus,
            fileSystem: fileSystem,
            fs: fs,
            keyboardManager: keyboardManager,
            windowLayerManager: windowLayerManager,
            dragManager: dragManager,
            positionManager: positionManager,
            loadingManager: loadingManager,
            loadingUI: loadingUI,
            lazyResourceLoader: lazyResourceLoader,
            wasmFileSystem: wasmFileSystem,
            wasmFs: wasmFs,
            unkaySDK: unkay,
            authSystem: null, // Será inicializado
            appManager: null  // Será inicializado
        };
        
        // Configurações de inicialização
        this.config = {
            desktop: null,
            appConfigs: []
        };
        
        // Listeners de eventos do sistema
        this.systemEventListeners = new Map();
        
        console.log('[SystemManager] Instância criada');
    }

    /**
     * Inicializa todos os sistemas na ordem correta
     * @param {HTMLElement} desktopElement - Elemento DOM do desktop
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
            
            // Emite evento de sistema pronto
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
     * Executa a inicialização ordenada dos sistemas
     * @private
     */
    async _performInitialization() {
        console.log('[SystemManager] Iniciando sistemas...');

        // Fase 1: Sistemas base (sem dependências)
        await this._initializePhase1();
        
        // Fase 2: Sistemas com dependências leves
        await this._initializePhase2();
        
        // Fase 3: Sistemas complexos (AppManager, etc.)
        await this._initializePhase3();
        
        // Fase 4: Configuração final e apps autorun
        await this._initializePhase4();
    }

    /**
     * Fase 1: Sistemas base
     * @private
     */
    async _initializePhase1() {
        console.log('[SystemManager] Fase 1: Sistemas base');
        
        // FileSystem já é singleton, apenas validamos
        if (!this.systems.fileSystem || !this.systems.fs) {
            throw new Error('FileSystem não foi carregado corretamente');
        }
        
        // KeyboardManager já é singleton
        if (!this.systems.keyboardManager) {
            throw new Error('KeyboardManager não foi carregado corretamente');
        }
        
        // Sistemas de loading já são singletons
        if (!this.systems.loadingManager || !this.systems.loadingUI) {
            throw new Error('Sistemas de loading não foram carregados corretamente');
        }
        
        // Inicializa unkayOS 2.0 Wasm Kernel e VFS
        try {
            console.log('[SystemManager] Inicializando WasmFileSystem e Worker...');
            await wasmFileSystem.initialize();
            console.log('[SystemManager] WasmFileSystem pronto.');
            await migrateLegacyStorage(wasmFileSystem);
        } catch (vfsErr) {
            console.warn('[SystemManager] WasmFileSystem inicializado com fallback:', vfsErr);
        }

        console.log('[SystemManager] Fase 1 concluída');
    }

    /**
     * Fase 2: Sistemas com dependências leves
     * @private
     */
    async _initializePhase2() {
        console.log('[SystemManager] Fase 2: Sistemas de interface');
        
        // AuthSystem
        this.systems.authSystem = new AuthSystem();
        await this._waitForSystemReady('authSystem');
        
        console.log('[SystemManager] Fase 2 concluída');
    }

    /**
     * Fase 3: Sistemas complexos
     * @private
     */
    async _initializePhase3() {
        console.log('[SystemManager] Fase 3: Carregando configurações de apps');
        
        // Carrega configurações de apps
        try {
            const response = await fetch('/apps/apps.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const jsonData = await response.json();
            this.config.appConfigs = jsonData.app_configs || [];
            
        } catch (error) {
            console.error('[SystemManager] Erro ao carregar apps.json:', error);
            throw error;
        }
        
        // AppManager
        this.systems.appManager = new AppManager(
            this.config.desktop, 
            null, 
            this.config.appConfigs
        );
        
        // Carrega configurações detalhadas dos apps
        await this.systems.appManager.loadAppConfigs();
        
        console.log('[SystemManager] Fase 3 concluída');
    }

    /**
     * Fase 4: Finalização
     * @private
     */
    async _initializePhase4() {
        console.log('[SystemManager] Fase 4: Iniciando apps autorun');
        
        // Inicia apps que devem executar automaticamente
        this.systems.appManager.initAutorunApps();

        // Inicializa suporte a arrastar arquivos do sistema operacional para o desktop
        if (this.config.desktop) {
            hostDropManager.initialize(this.config.desktop);
        }
        
        console.log('[SystemManager] Fase 4 concluída');
    }

    /**
     * Aguarda um sistema estar pronto
     * @private
     */
    async _waitForSystemReady(systemName, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const checkSystem = () => {
                if (this.systems[systemName]) {
                    resolve();
                } else if (Date.now() - startTime > timeout) {
                    reject(new Error(`Timeout aguardando sistema ${systemName}`));
                } else {
                    setTimeout(checkSystem, 100);
                }
            };
            
            checkSystem();
        });
    }

    /**
     * Obtém uma instância de sistema
     * @param {string} systemName - Nome do sistema
     * @returns {object|null}
     */
    getSystem(systemName) {
        if (!this.isInitialized && systemName !== 'eventBus') {
            console.warn(`[SystemManager] Sistema ${systemName} solicitado antes da inicialização completa`);
        }
        
        return this.systems[systemName] || null;
    }

    /**
     * Obtém todos os sistemas (somente leitura)
     * @returns {object}
     */
    getAllSystems() {
        return { ...this.systems };
    }

    /**
     * Registra um listener de evento do sistema
     * @param {string} event - Nome do evento
     * @param {function} callback - Callback do evento
     * @param {string} listenerId - ID único do listener
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
     * Remove um listener de evento do sistema
     * @param {string} event - Nome do evento
     * @param {string} listenerId - ID do listener
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
     * Executa shutdown limpo de todos os sistemas
     * @returns {Promise<void>}
     */
    async shutdown() {
        if (!this.isInitialized) {
            console.warn('[SystemManager] Sistema não está inicializado');
            return;
        }

        console.log('[SystemManager] Iniciando shutdown...');
        
        try {
            // Emite evento de shutdown
            this.systems.eventBus.emit('system:shutdown', {
                timestamp: new Date().toISOString()
            });
            
            // Para todos os apps
            if (this.systems.appManager) {
                this.systems.appManager.killAll();
            }
            if (this.systems.wasmFileSystem?.shutdown) {
                this.systems.wasmFileSystem.shutdown();
            }
            
            // Limpa listeners de eventos
            this.systemEventListeners.clear();
            
            // Limpa referências
            this.systems.authSystem = null;
            this.systems.appManager = null;
            
            this.isInitialized = false;
            console.log('[SystemManager] Shutdown concluído');
            
        } catch (error) {
            console.error('[SystemManager] Erro durante shutdown:', error);
            throw error;
        }
    }

    /**
     * Obtém estatísticas do sistema
     * @returns {object}
     */
    getSystemStats() {
        return {
            isInitialized: this.isInitialized,
            isInitializing: this.isInitializing,
            systemsLoaded: Object.keys(this.systems).filter(key => this.systems[key] !== null),
            runningApps: this.systems.appManager ? this.systems.appManager.runningApps.size : 0,
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
