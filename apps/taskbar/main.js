// apps/taskbar/main.js - v2.0.1 (Com WindowLayerManager)

import { BaseApp } from '../../core/BaseApp.js';
import eventBus from '../../core/eventBus.js';
import { windowLayerManager } from '../../core/WindowLayerManager.js';

/**
 * Aplicativo de Barra de Tarefas que gerencia o menu iniciar e ícones de aplicativos ativos.
 * Este é um aplicativo desktop_ui que é parte fundamental do ambiente.
 * 
 * NOVA ESTRATÉGIA: Sem Shadow DOM - injeção direta no DOM principal
 */
export default class TaskbarApp extends BaseApp {
    constructor(CORE, standardAPIs) {
        super(CORE, standardAPIs);

        // Referências aos elementos DOM
        this.taskbarElement = null;
        this.startMenuElement = null;
        this.appsOnToolbarElement = null;
        this.systemTrayElement = null;
        this.desktopElement = null; // Referência ao desktop principal
        
        // Bind methods
        this.handleStartMenuClick = this.handleStartMenuClick.bind(this);
        this.handleDesktopClick = this.handleDesktopClick.bind(this);
        this.createAppIcon = this.createAppIcon.bind(this);
        this.updateAppIcon = this.updateAppIcon.bind(this);
        this.removeAppIcon = this.removeAppIcon.bind(this);

        // Listeners do eventBus para ciclo de vida dos apps
        eventBus.on('app:started', ({ appId, instanceId }) => {
            this.createAppIcon(instanceId);
        });
        eventBus.on('app:stopped', ({ instanceId }) => {
            this.removeAppIcon(instanceId);
        });
        eventBus.on('app:icon:update', ({ instanceId, state, isMinimized, isMaximized, isActive }) => {
            this.updateAppIcon(instanceId, { state, isMinimized, isMaximized, isActive });
        });
    }

    /**
     * Manipula o clique no botão do menu iniciar.
     */
    handleStartMenuClick() {
        // Usa event bus para comunicação desacoplada
        eventBus.emit('menu:apps:toggle');
    }

    /**
     * Manipula cliques no desktop para fechar o menu.
     */
    handleDesktopClick(event) {
        // Verifica se o clique foi fora da taskbar
        if (!this.taskbarElement.contains(event.target)) {
            // Usa event bus para fechar menu
            eventBus.emit('menu:apps:close');
        }
    }

    /**
     * Cria um ícone de aplicativo na barra de tarefas.
     * @param {string} instanceId - ID da instância do aplicativo.
     * @param {string} iconUrl - URL do ícone.
     * @param {string} appName - Nome do aplicativo.
     */
    createAppIcon(instanceId) {
        if (!this.appsOnToolbarElement) return;
        // Busca instância do AppManager para acessar runningApps
        const appManager = window.appManager;
        if (!appManager || !appManager.runningApps) return;
        const appInfo = appManager.runningApps.get(instanceId);
        if (!appInfo || !appInfo.CORE) return;
        const appCore = appInfo.CORE;
        // Só cria ícone para apps 'system_window'
        if (appCore.mode !== 'system_window') return;

        const iconUrl = appCore.icon_url || '/assets/icons/apps/generic_app_icon.svg';
        const appName = appCore.app_name || 'App';

        const appIconDiv = document.createElement('div');
        appIconDiv.classList.add('taskbar__apps_on__app_icon');
        appIconDiv.dataset.instanceId = instanceId;
        appIconDiv.title = appName;

        const appIconImg = document.createElement('img');
        appIconImg.classList.add('taskbar__apps_on__app_icon__img');
        appIconImg.src = iconUrl;
        appIconImg.alt = appName;

        appIconDiv.appendChild(appIconImg);
        this.appsOnToolbarElement.appendChild(appIconDiv);

        // Adiciona evento de clique
        appIconDiv.addEventListener('click', () => {
            this.handleAppIconClick(instanceId);
        });

        console.log(`[${this.appName}] Ícone criado para app: ${appName} (${instanceId})`);
        
        // Garante que o ícone recém-criado reflita o estado inicial correto
        const runningAppInfo = appManager.runningApps.get(instanceId);
        if (runningAppInfo && runningAppInfo.UI) {
            // Determina o estado inicial baseado no UI
            let initialState = 'normal';
            let isActive = appManager.activeAppInstanceId === instanceId;
            let isMinimized = runningAppInfo.UI.isMinimized || false;
            let isMaximized = runningAppInfo.UI.isMaximized || false;
            
            if (isMinimized) {
                initialState = 'minimized';
            } else if (isMaximized) {
                initialState = 'maximized';
            } else if (isActive) {
                initialState = 'active';
            }
            
            this.updateAppIcon(instanceId, { 
                state: initialState, 
                isMinimized, 
                isMaximized, 
                isActive 
            });
        }
    }

    /**
     * Atualiza o estado de um ícone de aplicativo.
     * @param {string} instanceId - ID da instância do aplicativo.
     * @param {object} stateInfo - Informações do estado { state, isMinimized, isMaximized, isActive }.
     */
    updateAppIcon(instanceId, stateInfo) {
        const icon = this.appsOnToolbarElement.querySelector(`.taskbar__apps_on__app_icon[data-instance-id='${instanceId}']`);
        if (!icon) return;
        
        // Remove todas as classes de estado
        icon.classList.remove('active', 'minimized', 'normal', 'maximized');
        
        // Se o parâmetro é uma string (compatibilidade com o formato antigo)
        if (typeof stateInfo === 'string') {
            icon.classList.add(stateInfo);
            return;
        }
        
        // Novo formato com objeto de estado detalhado
        const { state, isMinimized, isMaximized, isActive } = stateInfo;
        
        // Aplica classes baseadas no estado detalhado
        if (isMinimized) {
            icon.classList.add('minimized');
        } else if (isActive) {
            if (isMaximized) {
                icon.classList.add('active', 'maximized');
            } else {
                icon.classList.add('active');
            }
        } else {
            if (isMaximized) {
                icon.classList.add('maximized');
            } else {
                icon.classList.add('normal');
            }
        }
        
        console.log(`[${this.appName}] Ícone ${instanceId} atualizado: ${state} (min:${isMinimized}, max:${isMaximized}, active:${isActive})`);
    }

    /**
     * Remove um ícone de aplicativo da barra de tarefas.
     * @param {string} instanceId - ID da instância do aplicativo.
     */
    removeAppIcon(instanceId) {
        const appIcon = this.appsOnToolbarElement?.querySelector(`[data-instance-id="${instanceId}"]`);
        if (appIcon) {
            appIcon.remove();
            console.log(`[${this.appName}] Ícone removido para app: ${instanceId}`);
        }
    }

    /**
     * Manipula o clique em um ícone de aplicativo.
     * @param {string} instanceId - ID da instância do aplicativo.
     */
    handleAppIconClick(instanceId) {
        // Emite evento de intenção de ação na janela
        eventBus.emit('window:toggle', { instanceId });
    }

    /**
     * Inicializa o menu de aplicativos.
     */
    /**
     * Inicializa o menu de aplicativos.
     */
    initializeMenuApps() {
        // Importa e cria o menu de aplicativos
        import('../../core/MenuApps.js').then(module => {
            const { menuApps } = module;
            
            // O menu é criado no desktop principal e se auto-gerencia
            const menuInstance = new menuApps(this.desktopElement);
            menuInstance.init();
        }).catch(error => {
            console.error(`[${this.appName}] Erro ao inicializar menu de aplicativos:`, error);
        });
    }
    

    /**
     * Inicializa o aplicativo quando é executado.
     */
    onRun() {
        console.log(`[${this.appName}] Inicializando taskbar...`);

        // Obtém referências aos elementos DOM usando utilitários padronizados
        this.taskbarElement = this.$('.taskbar');
        this.startMenuElement = this.$('.taskbar__start_menu');
        this.appsOnToolbarElement = this.$('.taskbar__apps_on');
        this.systemTrayElement = this.$('.taskbar__system_tray');

        // Define z-index correto para a taskbar usando WindowLayerManager
        if (this.taskbarElement) {
            windowLayerManager.setSystemLayer(this.taskbarElement, 'TASKBAR');
        }

        // Obtém referência ao desktop principal
        this.desktopElement = document.querySelector('#desktop');
        if (!this.desktopElement) {
            console.error(`[${this.appName}] Elemento desktop não encontrado`);
            return;
        }

        // Adiciona listener para o botão do menu iniciar
        if (this.startMenuElement) {
            this.startMenuElement.addEventListener('click', this.handleStartMenuClick);
            console.log(`[${this.appName}] Listener do menu iniciar configurado`);
        } else {
            console.error(`[${this.appName}] Elemento do menu iniciar não encontrado`);
        }

        // Adiciona listener para cliques no desktop
        this.desktopElement.addEventListener('click', this.handleDesktopClick);

        // Inicializa o menu de aplicativos
        this.initializeMenuApps();
        this.initSystemTray();

        // Toda comunicação com apps e ciclo de vida é feita via eventBus (sem dependência do AppManager)

        // Limpa ícones antigos e recria apenas os válidos
        if (this.appsOnToolbarElement) {
            this.appsOnToolbarElement.innerHTML = '';
            const appManager = window.appManager;
            if (appManager && appManager.runningApps) {
                for (const [instanceId, appInfo] of appManager.runningApps.entries()) {
                    if (appInfo && appInfo.CORE && appInfo.CORE.mode === 'system_window') {
                        this.createAppIcon(instanceId);
                    }
                }
                
                // Força atualização dos estados após todos os ícones serem criados
                setTimeout(() => {
                    for (const [instanceId, appInfo] of appManager.runningApps.entries()) {
                        if (appInfo && appInfo.CORE && appInfo.CORE.mode === 'system_window' && appInfo.UI) {
                            const isActive = appManager.activeAppInstanceId === instanceId;
                            const isMinimized = appInfo.UI.isMinimized || false;
                            const isMaximized = appInfo.UI.isMaximized || false;
                            
                            let state = 'normal';
                            if (isMinimized) {
                                state = 'minimized';
                            } else if (isMaximized) {
                                state = 'maximized';
                            } else if (isActive) {
                                state = 'active';
                            }
                            
                            this.updateAppIcon(instanceId, {
                                state,
                                isMinimized,
                                isMaximized,
                                isActive
                            });
                        }
                    }
                }, 100);
            }
        }
        console.log(`[${this.appName}] Taskbar inicializada com sucesso`);
    }

    /**
     * Limpa recursos quando o aplicativo é encerrado.
     */
    onCleanup() {
        console.log(`[${this.appName}] Limpando recursos da taskbar...`);

        // Remove listeners
        if (this.startMenuElement) {
            this.startMenuElement.removeEventListener('click', this.handleStartMenuClick);
        }

        if (this.desktopElement) {
            this.desktopElement.removeEventListener('click', this.handleDesktopClick);
        }

        // O menu de aplicativos agora é auto-gerenciado via EventBus
        // Emite evento para que o menu se limpe sozinho
        eventBus.emit('menu:apps:cleanup');

        console.log(`[${this.appName}] Recursos da taskbar limpos`);
    }

    static runCli(args, writeLine) {
        if (args.includes('--help') || args.includes('-h')) {
            writeLine('Uso: taskbar [--help]\nExibe a barra de tarefas do sistema.');
            return;
        }
        window.appManager?.runApp('taskbar');
        writeLine('Barra de tarefas iniciada.');
    }
} 