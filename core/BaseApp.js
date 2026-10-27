// core/BaseApp.js - v1.0.3

/**
 * Classe base para todos os aplicativos do sistema.
 * Padrão obrigatório:
 * - Todo acesso ao DOM deve ser feito a partir de this.appContentRoot (nunca do document global).
 * - IDs em HTML dos apps são apenas para escopo local.
 * - Métodos de ciclo de vida: onRun() para inicialização, onCleanup() para limpeza.
 * - Use os utilitários this.$(selector) e this.$$(selector) para acessar elementos do DOM local.
 * - Use this.registerKeyboardShortcut() para atalhos de teclado seguros.
 */

export class BaseApp {
    /**
     * Construtor da BaseApp.
     * @param {AppCore} CORE - A instância do AppCore associada a este aplicativo.
     * @param {object} standardAPIs - Objeto contendo APIs padrão (setTimeout, setInterval, appManager, etc.).
     * @param {HTMLElement} [appContentRoot=null] - O elemento raiz onde o conteúdo do app é renderizado.
     * @param {HTMLElement} [desktopElement=null] - O elemento desktop para referência de posicionamento.
     */
    constructor(CORE, standardAPIs, appContentRoot = null, desktopElement = null) {
        this.appCore = CORE;
        this.instanceId = CORE.instanceId;
        this.appName = CORE.app_name;
        // APIs padrão fornecidas pelo sistema
        this.setTimeout = standardAPIs.setTimeout;
        this.setInterval = standardAPIs.setInterval;
        this.clearTimeout = standardAPIs.clearTimeout;
        this.clearInterval = standardAPIs.clearInterval;
        this.appManager = standardAPIs.appManager;
        // Sistema de arquivos disponível para todos os apps
        this.fileSystem = standardAPIs.fileSystem;
        this.fs = standardAPIs.fs;
        this.wasmFileSystem = standardAPIs.wasmFileSystem;
        this.wasmFs = standardAPIs.wasmFs;
        this.unkay = standardAPIs.unkaySDK;
        this.standardAPIs = standardAPIs;
        // O elemento HTML que contém o conteúdo do aplicativo.
        this.appContentRoot = appContentRoot;
        // O elemento desktop para referência de posicionamento e drag and drop
        this.desktopElement = desktopElement;
        // Adiciona parâmetro help ao schema se não existir
        const ctor = this.constructor;
        if (!ctor.parameters) ctor.parameters = {};
        if (!ctor.parameters.help) {
            ctor.parameters.help = {
                type: 'boolean',
                required: false,
                description: 'Exibe esta mensagem de ajuda com os parâmetros aceitos pelo app.'
            };
        }
    }

    /**
     * Utilitário para buscar um elemento dentro do DOM local da instância.
     * @param {string} selector - Seletor CSS.
     * @returns {Element|null}
     */
    $(selector) {
        return this.appContentRoot ? this.appContentRoot.querySelector(selector) : null;
    }

    /**
     * Utilitário para buscar todos os elementos dentro do DOM local da instância.
     * @param {string} selector - Seletor CSS.
     * @returns {NodeListOf<Element>}
     */
    $$(selector) {
        return this.appContentRoot ? this.appContentRoot.querySelectorAll(selector) : [];
    }

    /**
     * Método a ser sobrescrito pelos aplicativos.
     * É chamado quando o aplicativo é executado e seu DOM está pronto.
     * @param {function} [terminalOutputCallback=null] - Callback para enviar saída para o terminal (usado por apps headless).
     * @param {object} [appParams={}] - Parâmetros nomeados passados ao iniciar o app.
     */
    onRun(terminalOutputCallback = null, appParams = {}) {
        if (appParams.help) {
            const helpText = this.getHelpText();
            if (typeof terminalOutputCallback === 'function') {
                terminalOutputCallback(helpText);
            } else {
                alert(helpText);
            }
            return;
        }
        console.warn(`[${this.appName} - ${this.instanceId}] Método onRun() não implementado na classe base. Por favor, implemente-o em sua classe de aplicativo.`);
    }

    /**
     * Método a ser sobrescrito pelos aplicativos para limpeza de recursos.
     * É chamado quando o aplicativo é encerrado.
     */
    async onCleanup() {
        // Remove automaticamente todos os listeners de teclado registrados
        try {
            let keyboardManager = null;
            
            // Primeiro tenta usar o SystemManager se disponível
            if (window.systemManager && window.systemManager.isInitialized) {
                keyboardManager = window.systemManager.getSystem('keyboardManager');
            }
            
            // Fallback para window global
            if (!keyboardManager && window.keyboardManager) {
                keyboardManager = window.keyboardManager;
            }
            
            // Fallback para importação dinâmica
            if (!keyboardManager) {
                const imported = await import('./KeyboardManager.js');
                keyboardManager = imported.keyboardManager;
            }
            
            if (keyboardManager) {
                keyboardManager.removeAppListeners(this.instanceId);
            }
        } catch (error) {
            console.warn(`[${this.appName}] Erro ao limpar listeners de teclado:`, error);
        }

        // Remove provedores de menu de contexto registrados pela instância
        try {
            let contextMenuManager = null;
            if (window.systemManager && window.systemManager.isInitialized) {
                contextMenuManager = window.systemManager.getSystem('contextMenuManager');
            }
            if (!contextMenuManager && window.contextMenuManager) {
                contextMenuManager = window.contextMenuManager;
            }
            if (!contextMenuManager) {
                const imported = await import('./ContextMenuManager.js');
                contextMenuManager = imported.contextMenuManager;
            }
            if (contextMenuManager) {
                contextMenuManager.removeAppProviders(this.instanceId);
            }
        } catch (error) {
            console.warn(`[${this.appName}] Erro ao limpar menus de contexto:`, error);
        }

        // Limpa listeners fallback se existirem
        if (this._fallbackListeners) {
            this._fallbackListeners.forEach(({ listener, element, event }) => {
                element.removeEventListener(event, listener);
            });
            this._fallbackListeners = [];
        }

        console.warn(`[${this.appName} - ${this.instanceId}] Método onCleanup() não implementado na classe base. Considere limpar listeners e recursos aqui.`);
    }

    /**
     * Registra um provedor de menu de contexto (botão direito) escopado a esta instância do aplicativo.
     * @param {string|function} selectorOrBuilder - Seletor CSS local (ex: '.file-item') ou função builder (para toda a área do app).
     * @param {function} [builder=null] - Função `(context) => Array<MenuItem>` quando o primeiro argumento é um seletor.
     * @returns {Promise<function>} Função de desregistro.
     */
    async registerContextMenu(selectorOrBuilder, builder = null) {
        try {
            let contextMenuManager = null;
            if (window.systemManager && window.systemManager.isInitialized) {
                contextMenuManager = window.systemManager.getSystem('contextMenuManager');
            }
            if (!contextMenuManager && window.contextMenuManager) {
                contextMenuManager = window.contextMenuManager;
            }
            if (!contextMenuManager) {
                const imported = await import('./ContextMenuManager.js');
                contextMenuManager = imported.contextMenuManager;
            }
            if (contextMenuManager) {
                return contextMenuManager.registerAppProvider(this.instanceId, selectorOrBuilder, builder);
            }
        } catch (error) {
            console.warn(`[${this.appName}] Erro ao registrar menu de contexto:`, error);
        }
        return () => {};
    }

    /**
     * Registra um atalho de teclado seguro para esta instância do app.
     * O atalho só será executado quando esta janela estiver ativa.
     * 
     * @param {string|string[]} keys - Combinação de teclas (ex: 'ctrl+s', ['ctrl+s', 'ctrl+shift+s'])
     * @param {function} callback - Função a ser chamada quando o atalho for pressionado
     * @param {object} options - Opções adicionais
     */
    async registerKeyboardShortcut(keys, callback, options = {}) {
        try {
            let keyboardManager = null;
            
            // Primeiro tenta usar o SystemManager se disponível
            if (window.systemManager && window.systemManager.isInitialized) {
                keyboardManager = window.systemManager.getSystem('keyboardManager');
            }
            
            // Fallback para window global
            if (!keyboardManager && window.keyboardManager) {
                keyboardManager = window.keyboardManager;
            }
            
            // Fallback para importação dinâmica
            if (!keyboardManager) {
                const imported = await import('./KeyboardManager.js');
                keyboardManager = imported.keyboardManager;
            }
            
            if (keyboardManager) {
                keyboardManager.registerShortcut(this.instanceId, keys, callback, options);
                return;
            }
            
            // Fallback para listener tradicional
            console.warn(`[${this.appName}] KeyboardManager não disponível, usando listener tradicional`);
            this.registerFallbackKeyboardListener(keys, callback, options);
        } catch (error) {
            console.warn(`[${this.appName}] Erro ao registrar atalho de teclado:`, error);
            this.registerFallbackKeyboardListener(keys, callback, options);
        }
    }

    /**
     * Fallback para apps que precisam de atalhos quando o KeyboardManager não está disponível
     */
    registerFallbackKeyboardListener(keys, callback, options = {}) {
        const listener = (event) => {
            if (!this.appContentRoot || !this.appContentRoot.contains(event.target)) return;
            
            const keyArray = Array.isArray(keys) ? keys : [keys];
            const matched = keyArray.some(keyCombo => {
                const parts = keyCombo.toLowerCase().split('+');
                const key = parts.pop();
                
                const needsCtrl = parts.includes('ctrl');
                const needsShift = parts.includes('shift');
                const needsAlt = parts.includes('alt');
                const needsMeta = parts.includes('meta');

                return event.key.toLowerCase() === key &&
                       event.ctrlKey === needsCtrl &&
                       event.shiftKey === needsShift &&
                       event.altKey === needsAlt &&
                       event.metaKey === needsMeta;
            });

            if (matched) {
                if (options.preventDefault !== false) event.preventDefault();
                if (options.stopPropagation !== false) event.stopPropagation();
                callback(event);
            }
        };

        document.addEventListener('keydown', listener);
        
        // Armazena para limpeza posterior
        if (!this._fallbackListeners) this._fallbackListeners = [];
        this._fallbackListeners.push({ listener, element: document, event: 'keydown' });
    }

    /**
     * Registra um listener de teclado customizado para esta instância.
     * O listener só será executado quando esta janela estiver ativa.
     * 
     * @param {string} eventType - Tipo do evento ('keydown' ou 'keyup')
     * @param {function} listener - Função listener
     * @param {object} options - Opções adicionais
     */
    async registerKeyboardListener(eventType, listener, options = {}) {
        try {
            let keyboardManager = null;
            
            // Primeiro tenta usar o SystemManager se disponível
            if (window.systemManager && window.systemManager.isInitialized) {
                keyboardManager = window.systemManager.getSystem('keyboardManager');
            }
            
            // Fallback para window global
            if (!keyboardManager && window.keyboardManager) {
                keyboardManager = window.keyboardManager;
            }
            
            // Fallback para importação dinâmica
            if (!keyboardManager) {
                const imported = await import('./KeyboardManager.js');
                keyboardManager = imported.keyboardManager;
            }
            
            if (keyboardManager) {
                keyboardManager.registerKeyboardListener(this.instanceId, eventType, listener, options);
            } else {
                console.warn(`[${this.appName}] KeyboardManager não disponível, listener não registrado`);
            }
        } catch (error) {
            console.warn(`[${this.appName}] Erro ao registrar listener de teclado:`, error);
        }
    }

    /**
     * Verifica se esta instância está atualmente ativa (com foco)
     * @returns {boolean}
     */
    async isActive() {
        try {
            let keyboardManager = null;
            
            // Primeiro tenta usar o SystemManager se disponível
            if (window.systemManager && window.systemManager.isInitialized) {
                keyboardManager = window.systemManager.getSystem('keyboardManager');
            }
            
            // Fallback para window global
            if (!keyboardManager && window.keyboardManager) {
                keyboardManager = window.keyboardManager;
            }
            
            // Fallback para importação dinâmica
            if (!keyboardManager) {
                const imported = await import('./KeyboardManager.js');
                keyboardManager = imported.keyboardManager;
            }
            
            if (keyboardManager) {
                return keyboardManager.isInstanceActive(this.instanceId);
            }
            
            // Fallback básico - verifica se a janela tem foco
            return this.element && this.element.contains(document.activeElement);
        } catch (error) {
            console.warn(`[${this.appName}] Erro ao verificar se app está ativo:`, error);
            return false;
        }
    }

    /**
     * Retorna o texto de ajuda formatado com base no schema de parâmetros.
     */
    getHelpText() {
        const schema = this.constructor.parameters || {};
        let help = `Parâmetros aceitos por ${this.appName}:\n`;
        for (const [key, def] of Object.entries(schema)) {
            help += `- ${key} (${def.type})${def.required ? ' [obrigatório]' : ''}: ${def.description || ''}\n`;
        }
        return help;
    }
}
