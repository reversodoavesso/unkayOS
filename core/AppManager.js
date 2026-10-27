// /core/AppManager.js - v1.0.28

import { AppCore } from './AppCore.js';
import eventBus from './eventBus.js'; // Importa o eventBus para Pub/Sub
import { windowLayerManager } from './WindowLayerManager.js'; // Gerenciador de z-index dinâmico
import { loadingManager } from './LoadingManager.js'; // Sistema de loading


export class AppManager {

    constructor(desktopElement, appsOnToolBarElement, appConfigs) {
        this.focusHistory = [];
        this._showDesktopSavedIds = [];

        this.desktopElement = desktopElement;
        this.appsOnToolBarElement = appsOnToolBarElement;
        this.baseAppConfigs = appConfigs;
        this.loadedAppDetails = new Map();
        this.runningApps = new Map();
        this.activeAppInstanceId = null;

        this.registerEventBusListeners();

    }


    async loadAppConfigs() {
        const loadPromises = this.baseAppConfigs.map(async (baseConfig) => {
            try {
                const configUrl = `${baseConfig.path}config.json`;
                const response = await fetch(configUrl);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status} for ${configUrl}`);
                }
                const appConfig = await response.json();

                const fullAppData = {
                    ...appConfig,
                    id: baseConfig.id,
                    basePath: baseConfig.path,
                    dirApp: appConfig.dirApp ? `${baseConfig.path}${appConfig.dirApp}` : null,
                    jsFile: appConfig.jsFile ? `${baseConfig.path}${appConfig.jsFile}` : null,
                    styleFile: appConfig.styleFile ? `${baseConfig.path}${appConfig.styleFile}` : null,
                    // AGORA resolve icon_url também
                    icon_url: appConfig.icon_url ? `${baseConfig.path}${appConfig.icon_url}` : "/assets/icons/apps/generic_app_icon.svg",
                };
                this.loadedAppDetails.set(baseConfig.id, fullAppData);
                console.log(`[AppManager] Configuração do app '${baseConfig.id}' carregada e resolvida.`);
            } catch (error) {
                console.error(`[AppManager] Erro ao carregar config.json para app '${baseConfig.id}':`, error);
            }
        });
        await Promise.all(loadPromises);

        window.loadedAppDetails = this.loadedAppDetails;
    }

    registerEventBusListeners() {

        eventBus.on('app:start', ({ appId, params }) => {
            this.runApp(appId, params);
        });

        eventBus.on('app:stop', async ({ instanceId }) => {
            await this.stopApp(instanceId);
        });

        eventBus.on('window:focus', ({ instanceId }) => {
            this.defineFirstPlaneApp(instanceId);
        });

        eventBus.on('window:minimize', ({ instanceId }) => {
            const appInfo = this.runningApps.get(instanceId);
            if (appInfo && appInfo.UI) {
                appInfo.UI.minimize();
            }
        });

        eventBus.on('window:restore', ({ instanceId }) => {
            const appInfo = this.runningApps.get(instanceId);
            if (appInfo && appInfo.UI) {
                appInfo.UI.restore();
                this.defineFirstPlaneApp(instanceId);
            }
        });

        eventBus.on('window:maximize', ({ instanceId }) => {
            const appInfo = this.runningApps.get(instanceId);
            if (appInfo && appInfo.UI) {
                appInfo.UI.maximize();
                this.defineFirstPlaneApp(instanceId);
            }
        });

        eventBus.on('window:unmaximize', ({ instanceId }) => {
            const appInfo = this.runningApps.get(instanceId);
            if (appInfo && appInfo.UI) {
                appInfo.UI.unmaximize();
                this.defineFirstPlaneApp(instanceId);
            }
        });

        eventBus.on('window:snap', ({ instanceId, zone }) => {
            const appInfo = this.runningApps.get(instanceId);
            if (appInfo && appInfo.UI && typeof appInfo.UI.snapTo === 'function') {
                appInfo.UI.snapTo(zone);
                this.defineFirstPlaneApp(instanceId);
            }
        });

        eventBus.on('window:center', ({ instanceId }) => {
            const appInfo = this.runningApps.get(instanceId);
            if (appInfo && appInfo.UI && typeof appInfo.UI.centerWindow === 'function') {
                appInfo.UI.centerWindow();
                this.defineFirstPlaneApp(instanceId);
            }
        });

        eventBus.on('window:cycle', ({ direction = 1 } = {}) => {
            this.cycleWindows(direction);
        });

        eventBus.on('desktop:toggle-show', () => {
            this.toggleShowDesktop();
        });

        eventBus.on('window:toggle', ({ instanceId }) => {
            const appInfo = this.runningApps.get(instanceId);
            if (appInfo && appInfo.UI && appInfo.CORE.mode === 'system_window') {
                // Se a janela está minimizada, restaura e foca
                if (appInfo.UI.isMinimized) {
                    eventBus.emit('window:restore', { instanceId });
                } else if (this.activeAppInstanceId === instanceId) {
                    // Se é a janela ativa, minimiza
                    eventBus.emit('window:minimize', { instanceId });
                } else {
                    // Senão, apenas foca
                    this.defineFirstPlaneApp(instanceId);
                }
            }
        });


        eventBus.on('window:close', async ({ instanceId }) => {
            await this.stopApp(instanceId);
        });

        // Novo evento para escutar mudanças de estado das janelas
        eventBus.on('window:state:changed', ({ instanceId, state, isMinimized, isMaximized, isActive }) => {
            // Atualiza o activeAppInstanceId se necessário
            if (isActive && !isMinimized) {
                this.activeAppInstanceId = instanceId;
            } else if (this.activeAppInstanceId === instanceId && !isActive) {
                // Se a janela perdeu o foco, remove do activeApp
                this.activeAppInstanceId = null;
            }

            // Propaga evento para a taskbar atualizar o ícone
            eventBus.emit('app:icon:update', { instanceId, state, isMinimized, isMaximized, isActive });

            console.log(`[AppManager] Estado da janela ${instanceId} mudou para: ${state}`);
        });

        eventBus.on('app:killall', () => {
            const count = this.killAll();
            eventBus.emit('app:killall:done', { count });
        });

        eventBus.on('app:getParametersSchema', ({ appId }) => {
            let schema = null;
            // Procura instância rodando primeiro
            for (const { CORE } of this.runningApps.values()) {
                if (CORE.id === appId && typeof CORE.getParametersSchema === 'function') {
                    schema = CORE.getParametersSchema();
                    break;
                }
            }
            // Se não estiver rodando, tenta buscar nos loadedAppDetails
            if (!schema) {
                const appData = this.loadedAppDetails.get(appId);
                if (appData && appData.jsFile && appData._cachedParametersSchema) {
                    schema = appData._cachedParametersSchema;
                }
            }
            eventBus.emit('app:parametersSchema', { appId, schema });
        });
    }

    /**
     * Alterna o foco entre as janelas abertas (Alt + ` / Alt + Tab)
     * @param {number} [direction=1]
     */
    cycleWindows(direction = 1) {
        const systemWindows = [];
        for (const [instanceId, appInfo] of this.runningApps.entries()) {
            if (appInfo.CORE.mode === 'system_window' && appInfo.UI) {
                systemWindows.push(instanceId);
            }
        }
        if (systemWindows.length === 0) return null;

        const currentIndex = systemWindows.indexOf(this.activeAppInstanceId);
        const step = direction < 0 ? -1 : 1;
        const nextIndex =
            currentIndex === -1
                ? 0
                : (currentIndex + step + systemWindows.length) % systemWindows.length;
        const targetId = systemWindows[nextIndex];
        const targetApp = this.runningApps.get(targetId);
        if (targetApp?.UI?.isMinimized) {
            targetApp.UI.restore();
        }
        this.defineFirstPlaneApp(targetId);
        return targetId;
    }

    /**
     * Minimiza todas as janelas visíveis ou restaura as janelas minimizadas anteriormente (Ctrl + Alt + D)
     */
    toggleShowDesktop() {
        const visibleWindows = [];
        for (const [instanceId, appInfo] of this.runningApps.entries()) {
            if (appInfo.CORE.mode === 'system_window' && appInfo.UI && !appInfo.UI.isMinimized) {
                visibleWindows.push(instanceId);
            }
        }

        if (visibleWindows.length > 0) {
            this._showDesktopSavedIds = visibleWindows;
            for (const id of visibleWindows) {
                this.runningApps.get(id)?.UI?.minimize();
            }
            return { action: 'minimized', count: visibleWindows.length };
        }

        const toRestore = this._showDesktopSavedIds.filter((id) => this.runningApps.has(id));
        this._showDesktopSavedIds = [];
        let lastRestored = null;
        for (const id of toRestore) {
            const appInfo = this.runningApps.get(id);
            if (appInfo?.UI?.isMinimized) {
                appInfo.UI.restore();
                lastRestored = id;
            }
        }
        if (lastRestored) {
            this.defineFirstPlaneApp(lastRestored);
        }
        return { action: 'restored', count: toRestore.length };
    }

    async initAutorunApps() {
        console.log('[AppManager] Iniciando apps com autorun...');
        const starts = [];
        this.loadedAppDetails.forEach(appData => {
            if (appData.autorun && appData.widget !== true) {
                console.log(`[AppManager] Iniciando app com autorun: ${appData.app_name} (${appData.mode})`);
                starts.push(this.runApp(appData.id));
            }
        });
        await Promise.all(starts);
        console.log('[AppManager] Apps com autorun iniciados.');
    }


    async runApp(appId, appParams = {}, options = {}) {

        eventBus.emit('app:starting', { appId, params: appParams });

        console.log(`[AppManager] Tentando iniciar app: ${appId}`);
        const appData = this.loadedAppDetails.get(appId);
        if (!appData) {
            console.error(`[AppManager] App '${appId}' não encontrado nas configs carregadas.`);
            eventBus.emit('app:start:error', { appId, reason: 'not_found' });
            return;
        }
        console.log(`[AppManager] App encontrado: ${appData.app_name} (${appData.mode})`);

        // Para apps custom_ui, desktop_ui ou headless, verifica se já está rodando
        if ((appData.mode === 'custom_ui' || appData.mode === 'desktop_ui' || appData.mode === 'headless') && this.isAppRunning(appId)) {
            console.warn(`Aplicativo '${appId}' (${appData.mode}) já está em execução. Não iniciando nova instância.`);
            eventBus.emit('app:start:error', { appId, reason: 'already_running' });
            return;
        }
        console.log(`[AppManager] App ${appData.app_name} não está rodando, prosseguindo com inicialização...`);

        const CORE = new AppCore(appData);
        CORE.reloadModule = options.reloadModule === true;

        if (appData.mode === 'system_window') {
            eventBus.emit('app:loading:start', { instanceId: CORE.instanceId, resourceType: 'boot' });
        }

        try {

            const UI = await CORE.run(this.desktopElement, null, appParams);

            this.runningApps.set(CORE.instanceId, {
                CORE: CORE,
                UI: UI,
                ICON: null
            });

            if (UI && 'ready' in UI) await UI.ready;
            if (CORE.stopped) return null;
            CORE.initialized = !CORE.launchFailed;
            eventBus.emit('app:loading:complete', { instanceId: CORE.instanceId, resourceType: 'boot' });

            console.log(`[AppManager] ${appData.app_name}: ${CORE.launchFailed ? 'falha ao abrir' : 'inicialização concluída'} (${CORE.instanceId})`);
            if (CORE.launchFailed) eventBus.emit('app:start:error', { appId, instanceId: CORE.instanceId, reason: 'initialization' });
            else eventBus.emit('app:started', { appId, instanceId: CORE.instanceId });

            // Para apps system_window, dar foco automaticamente após a criação
            if (appData.mode === 'system_window') {
                // Aguarda um frame para garantir que o DOM está pronto
                requestAnimationFrame(() => {
                    this.defineFirstPlaneApp(CORE.instanceId);
                    if (CORE.launchFailed && UI && 'focusLoadError' in UI) UI.focusLoadError();
                });
            }

            return CORE.instanceId;

        }

        catch (error) {
            console.error(`Erro ao iniciar o aplicativo '${appData.app_name}' (ID: ${appId}):`, error);
            eventBus.emit('app:start:error', { appId, reason: 'error' });
            this.runningApps.get(CORE.instanceId)?.UI?.remove?.();
            await CORE.stop();
            loadingManager.clearInstance(CORE.instanceId);
            this.runningApps.delete(CORE.instanceId);
            return null;
        }
    }

    async restartApp(instanceId) {
        const app = this.runningApps.get(instanceId);
        if (!app || app.CORE.mode !== 'system_window') return null;
        const { id, lastAppParams } = app.CORE;
        await this.stopApp(instanceId);
        return this.runApp(id, lastAppParams, { reloadModule: true });
    }

    isAppRunning(appId) {
        for (const [instanceId, appInfo] of this.runningApps.entries()) {
            if (appInfo.CORE.id === appId) {
                console.log(`[AppManager] App ${appId} já está rodando (instanceId: ${instanceId})`);
                return true;
            }
        }
        console.log(`[AppManager] App ${appId} não está rodando`);
        return false;
    }

    defineFirstPlaneApp(instanceId) {
        console.log('[AppManager] Foco para:', instanceId);

        // Atualiza histórico de foco
        this.focusHistory = this.focusHistory.filter(id => id !== instanceId);
        this.focusHistory.unshift(instanceId);

        this.runningApps.forEach((value, _key) => {
            if (value.UI && value.CORE.mode == 'system_window') {

                if (value.CORE.instanceId === instanceId) {
                    this.activeAppInstanceId = value.CORE.instanceId;
                    value.UI.focus();

                    // NOVA FUNCIONALIDADE: Gerenciamento dinâmico de z-index
                    windowLayerManager.bringToFront(instanceId, value.UI.appWindowElement);
                } else {
                    value.UI.unfocus();
                }
            }
        });
    }

    //revisar
    async stopApp(instanceId) {
        // Emite evento de tentativa de stop
        eventBus.emit('app:stopping', { instanceId });
        console.log(`[AppManager] removeApp chamado para instanceId: ${instanceId}`);
        console.log(`[AppManager] runningApps:`, this.runningApps);

        const appInfo = this.runningApps.get(instanceId);
        if (!appInfo) {
            console.warn(`Aplicativo com instanceId '${instanceId}' não encontrado para remoção.`);
            eventBus.emit('app:stop:error', { instanceId, reason: 'not_found' });
            return;
        }

        // Apps custom_ui e desktop_ui (apps de sistema) não podem ser fechados pelo usuário
        if (appInfo.CORE.mode === "custom_ui" || (appInfo.CORE.mode === "desktop_ui" && appInfo.CORE.rawData.widget !== true)) {
            console.warn(`[AppManager] Tentativa de remover aplicativo de sistema (${appInfo.CORE.mode}) '${appInfo.CORE.app_name}' (ID: ${instanceId}). Não permitido.`);
            eventBus.emit('app:stop:error', { instanceId, reason: 'system_app' });
            return;
        }

        // Chama o método stop() do AppCore para limpeza (agora é async)
        await appInfo.CORE.stop();

        // Se o aplicativo tem uma UI, chama o método remove() para limpeza adequada
        if (appInfo.UI && typeof appInfo.UI.remove === 'function') {
            appInfo.UI.remove();
        } else {
            // Fallback para remoção manual se o método remove() não existir
            if (appInfo.UI && appInfo.UI.appWindowElement) { // Para system_window
                appInfo.UI.appWindowElement.remove();
            } else if (appInfo.UI && appInfo.UI.appElement) { // Para custom_ui
                appInfo.UI.appElement.remove();
            }
        }

        // Remove janela do gerenciador de camadas se for system_window
        if (appInfo.CORE.mode === 'system_window') {
            windowLayerManager.removeWindow(instanceId);
        }

        // Remove o ícone da barra de tarefas, se existir
        if (appInfo.ICON) {
            appInfo.ICON.remove();
        }

        // Remove o aplicativo do mapa de aplicativos em execução
        this.runningApps.delete(instanceId);

        // Se o app removido era o ativo, limpa o estado
        if (this.activeAppInstanceId === instanceId) {
            this.activeAppInstanceId = null;
        }

        eventBus.emit('app:stopped', { instanceId });
        console.log(`Aplicativo (instanceId: ${instanceId}) removido.`);
    }

    async killAll() {
        const instanceIdsToKill = [];

        for (const [instanceId, appInfo] of this.runningApps.entries()) {
            if (appInfo.CORE.mode !== 'custom_ui' && appInfo.CORE.mode !== 'desktop_ui') {
                instanceIdsToKill.push(instanceId);
            }
        }

        // Use Promise.all para aguardar todos os stops em paralelo
        await Promise.all(instanceIdsToKill.map(instanceId => this.stopApp(instanceId)));

        console.log(`Todos os aplicativos de janela e headless foram encerrados.`);

        return instanceIdsToKill.length;
    }

    /**
     * Retorna o schema de parâmetros aceitos por um app, se disponível.
     * @param {string} appId - O ID do app.
     * @returns {object|null} O schema de parâmetros ou null se não encontrado.
     */
    getAppParametersSchema(appId) {
        // Procura instância rodando primeiro
        for (const { CORE } of this.runningApps.values()) {
            if (CORE.id === appId && typeof CORE.getParametersSchema === 'function') {
                return CORE.getParametersSchema();
            }
        }
        // Se não estiver rodando, tenta buscar nos loadedAppDetails
        const appData = this.loadedAppDetails.get(appId);
        if (appData && appData.jsFile) {
            if (appData._cachedParametersSchema) return appData._cachedParametersSchema;
            try {
                return null;
            } catch (_e) {
                return null;
            }
        }
        return null;
    }
}
