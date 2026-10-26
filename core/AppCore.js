// /core/AppCore.js - v1.0.26

import { BaseApp } from './BaseApp.js';
import { generateUniqueId } from './utils/generateUniqueId.js';
import eventBus from './eventBus.js';

export class AppCore {
    constructor(appData) { // Agora recebe appData já resolvido
        this.id = appData.id || generateUniqueId();
        this.instanceId = `${this.id}-${generateUniqueId()}`;
        this.app_name = appData.app_name || this.instanceId;

        this.icon_url = appData.icon_url || "/assets/icons/apps/generic_app_icon.svg";
        this.hidden = appData.hidden || false;
        this.autorun = appData.autorun || false;

        // Caminhos já absolutos, resolvidos pelo AppManager
        this.dirApp = appData.dirApp || "";
        this.jsFile = appData.jsFile || "";
        this.styleFile = appData.styleFile || ""; // Novo: caminho para o style.less do app
        this.mode = appData.mode || "system_window";

        this.rawData = appData; // Mantém os dados originais também
        this.appInstance = null; // Armazenará a instância do aplicativo (ex: TerminalApp)

        this.managedTimeouts = new Set();
        this.managedIntervals = new Set();
    }

    async run(desktopElement, terminalOutputCallback = null, appParams = {}) {
        // Garante que appParams seja objeto
        if (Array.isArray(appParams)) {
            appParams = { value: appParams };
        }
        this.lastAppParams = appParams; // <-- Salva os parâmetros para uso posterior
        // Prepara as APIs padrão que serão passadas para o construtor da BaseApp
        const standardAPIs = {
            setTimeout: (callback, delay, ...args) => {
                const id = setTimeout(() => {
                    this.managedTimeouts.delete(id);
                    callback(...args);
                }, delay);
                this.managedTimeouts.add(id);
                return id;
            },
            setInterval: (callback, delay, ...args) => {
                const id = setInterval(callback, delay, ...args);
                this.managedIntervals.add(id);
                return id;
            },
            clearTimeout: (id) => {
                clearTimeout(id);
                this.managedTimeouts.delete(id);
            },
            clearInterval: (id) => {
                clearInterval(id);
                this.managedIntervals.delete(id);
            },
            appManager: window.systemManager?.getSystem('appManager') || window.appManager,
            // Sistema de arquivos disponível para todos os apps
            fileSystem: window.systemManager?.getSystem('fileSystem') || window.unkayFileSystem?.fileSystem,
            fs: window.systemManager?.getSystem('fs') || window.unkayFileSystem?.fs,
            wasmFileSystem: window.systemManager?.getSystem('wasmFileSystem') || window.wasmFileSystem,
            wasmFs: window.systemManager?.getSystem('wasmFs') || window.wasmFs,
            unkaySDK: window.systemManager?.getSystem('unkaySDK') || window.unkay,
            auth: (window.systemManager?.getSystem('authSystem') || window.authSystem)?.getAPI()
        };
        this.standardAPIs = standardAPIs;

        // Carrega o módulo JS do aplicativo e instancia a classe BaseApp (ou sua extensão)
        // A referência ao appContentRoot será definida pelo AppWindowSystem
        // antes de chamar o onRun() do appInstance.
        this.moduleReady = (async () => {
        if (this.jsFile) {
            try {
                console.log(`[AppCore] Carregando módulo JS: ${this.jsFile}`);
                
                // Emite progresso do carregamento do JS
                eventBus.emit('app:loading:progress', { 
                    instanceId: this.instanceId, 
                    progress: 50, 
                    message: 'Carregando lógica do aplicativo...' 
                });

                const module = await import(this.jsFile);
                if (this.stopped) return;
                
                eventBus.emit('app:loading:progress', { 
                    instanceId: this.instanceId, 
                    progress: 75, 
                    message: 'Inicializando aplicativo...' 
                });

                if (typeof module.default === "function" && module.default.prototype instanceof BaseApp) {
                    this.appInstance = new module.default(this, standardAPIs);
                    // Lê o schema de parâmetros, se existir
                    if (module.default.parameters) {
                        this.parametersSchema = module.default.parameters;
                    } else if (typeof module.default.getParametersSchema === 'function') {
                        this.parametersSchema = module.default.getParametersSchema();
                    } else {
                        this.parametersSchema = {};
                    }
                    // Método para expor o schema
                    this.getParametersSchema = () => this.parametersSchema;
                    
                    eventBus.emit('app:loading:progress', { 
                        instanceId: this.instanceId, 
                        progress: 100, 
                        message: 'Aplicativo inicializado' 
                    });

                    eventBus.emit('app:loading:complete', { 
                        instanceId: this.instanceId, 
                        resourceType: 'js' 
                    });

                    console.log(`[AppCore] Instância do app ${this.app_name} criada com sucesso`);
                } else {
                    // Para apps que não estendem BaseApp, eles ainda podem ter seu HTML/CSS/JS injetado,
                    // mas não terão acesso às APIs ou ao ciclo de vida onRun/onCleanup.
                    console.warn(`Módulo JS de ${this.app_name} não exporta uma classe padrão que estende BaseApp. O app pode funcionar, mas não terá acesso às APIs do sistema ou ao ciclo de vida do app.`);
                    
                    eventBus.emit('app:loading:complete', { 
                        instanceId: this.instanceId, 
                        resourceType: 'js' 
                    });
                }
            } catch (e) {
                this.moduleError = e;
                console.error(`Erro ao carregar jsFile do app ${this.app_name}:`, e);
                
                eventBus.emit('app:loading:error', { 
                    instanceId: this.instanceId, 
                    error: e, 
                    resourceType: 'js' 
                });
            }
        } else {
            // Marca JS como concluído se não houver arquivo JS
            eventBus.emit('app:loading:complete', { 
                instanceId: this.instanceId, 
                resourceType: 'js' 
            });
        }

        })();
        if (this.mode !== 'system_window') await this.moduleReady;

        switch (this.mode) {
            case "system_window": {
                const { AppWindowSystem } = await import('./AppWindowSystem.js');
                // Passa a instância do AppCore (que contém this.appInstance e os caminhos resolvidos)
                // e o desktopElement para o AppWindowSystem.
                // O AppWindowSystem será responsável por criar a janela e chamar onRun().
                const windowApp = new AppWindowSystem(this, desktopElement);
                return windowApp;
            }

            case "desktop_ui": {
                const { AppCustomUI } = await import('./AppCustomUI.js');
                // Apps de desktop são parte fundamental do ambiente
                // Eles iniciam automaticamente e não podem ser fechados
                const desktopApp = new AppCustomUI(this, desktopElement);
                await desktopApp.init(); // Inicializa imediatamente
                return desktopApp;
            }

            case "custom_ui": {
                const { AppCustomUI } = await import('./AppCustomUI.js');
                const customUIApp = new AppCustomUI(this, desktopElement);
                // AppCustomUI define appContentRoot e chama onRun seguindo o padrão do AppWindowSystem.
                if (this.appInstance && typeof this.appInstance.onRun === "function") {
                    // Nota: AppCustomUI define this.appInstance.appContentRoot antes de chamar onRun.
                    this.appInstance.onRun(null, this.lastAppParams);
                }
                return customUIApp;
            }

            case "headless": {
                // Para apps headless, chamamos onRun diretamente aqui, passando os callbacks e params
                if (this.appInstance && typeof this.appInstance.onRun === "function") {
                    this.appInstance.onRun(terminalOutputCallback, this.lastAppParams);
                } else {
                    console.warn(`Aplicativo headless '${this.app_name}' não tem o método 'onRun()' implementado.`);
                }
                return null;
            }

            default:
                console.warn(`Modo desconhecido: ${this.mode}`);
                return null;
        }
    }

    async stop() {
        this.stopped = true;
        if (this.appInstance && typeof this.appInstance.onCleanup === "function") {
            // Suporta tanto onCleanup async quanto sync
            const result = this.appInstance.onCleanup();
            if (result && typeof result.then === 'function') {
                await result;
            }
        }

        this.managedTimeouts.forEach(id => {
            clearTimeout(id);
        });
        this.managedTimeouts.clear();

        this.managedIntervals.forEach(id => {
            clearInterval(id);
        });
        this.managedIntervals.clear();
    }
}
