/**
 * WindowLayerManager - Gerenciador dinâmico de z-index para janelas
 * 
 * Este sistema garante que as janelas sejam organizadas em camadas corretas
 * baseadas na ordem de foco, eliminando conflitos de sobreposição.
 */

export class WindowLayerManager {
    constructor() {
        // Configuração das camadas do sistema
        this.layers = {
            DESKTOP_BACKGROUND: 0,      // Fundo do desktop
            DESKTOP_APPS: 5,            // Widgets e apps de desktop (sempre abaixo das janelas)
            WINDOWS_BASE: 100,          // Base para janelas normais
            WINDOWS_MAX: 8999,          // Máximo para janelas normais
            DRAGGING: 9000,             // Janelas em arrasto
            TASKBAR: 10000,             // Taskbar do sistema
            APPS_MENU: 10001,           // Menu de aplicativos
            MODAL: 20000,               // Modais e overlays
            CONTEXT_MENU: 25000,        // Menus de contexto do sistema
            NOTIFICATION: 30000         // Notificações
        };

        // Estado do gerenciador
        this.windowStack = new Map(); // instanceId -> { zIndex, element }
        this.currentTopZIndex = this.layers.WINDOWS_BASE;
        this.isReorganizing = false;
        
        console.log('[WindowLayerManager] Inicializado com hierarquia de camadas:', this.layers);
    }

    /**
     * Traz uma janela para frente baseada no foco
     * @param {string} instanceId - ID da instância da janela
     * @param {HTMLElement} element - Elemento DOM da janela
     */
    bringToFront(instanceId, element) {
        if (!instanceId || !element) {
            console.warn('[WindowLayerManager] bringToFront: parâmetros inválidos');
            return;
        }

        // Verifica se precisa reorganizar o stack
        if (this.currentTopZIndex >= this.layers.WINDOWS_MAX) {
            console.log('[WindowLayerManager] Stack cheio, reorganizando...');
            this.reorderStack();
        }

        // Incrementa e atribui novo z-index
        this.currentTopZIndex += 1;
        const newZIndex = this.currentTopZIndex;

        // Atualiza registros internos
        this.windowStack.set(instanceId, {
            zIndex: newZIndex,
            element: element,
            timestamp: Date.now()
        });

        // Aplica z-index ao elemento
        element.style.zIndex = newZIndex;

        // Configura z-index das bordas de redimensionamento
        this.setResizeBordersLayer(element);
        
        // Configura z-index dos botões da barra superior
        this.setTopBarButtonsLayer(element);

        console.log(`[WindowLayerManager] Janela ${instanceId} movida para frente com z-index: ${newZIndex}`);
    }

    /**
     * Remove uma janela do controle de camadas
     * @param {string} instanceId - ID da instância da janela
     */
    removeWindow(instanceId) {
        if (this.windowStack.has(instanceId)) {
            this.windowStack.delete(instanceId);
            console.log(`[WindowLayerManager] Janela ${instanceId} removida do stack`);
        }
    }

    /**
     * Reorganiza o stack quando atingir o limite
     * Reordena todas as janelas a partir do z-index base
     */
    reorderStack() {
        if (this.isReorganizing) return;
        this.isReorganizing = true;

        console.log('[WindowLayerManager] Iniciando reorganização do stack...');

        // Obtém todas as janelas ordenadas por z-index atual
        const sortedWindows = Array.from(this.windowStack.entries())
            .sort((a, b) => a[1].zIndex - b[1].zIndex);

        // Redistribui z-index a partir da base
        let newZIndex = this.layers.WINDOWS_BASE;
        
        sortedWindows.forEach(([instanceId, windowData]) => {
            // Atualiza registros internos
            this.windowStack.set(instanceId, {
                ...windowData,
                zIndex: newZIndex
            });

            // Aplica novo z-index ao elemento se ainda existir
            if (windowData.element && document.contains(windowData.element)) {
                windowData.element.style.zIndex = newZIndex;
                // Configura z-index das bordas de redimensionamento
                this.setResizeBordersLayer(windowData.element);
                
                // Configura z-index dos botões da barra superior
                this.setTopBarButtonsLayer(windowData.element);
            } else {
                // Remove janela se elemento não existe mais
                this.windowStack.delete(instanceId);
                return;
            }

            newZIndex += 1;
        });

        this.currentTopZIndex = newZIndex - 1;
        this.isReorganizing = false;

        console.log(`[WindowLayerManager] Stack reorganizado. Novo topo: ${this.currentTopZIndex}`);
    }

    /**
     * Define z-index para arrasto (temporário)
     * @param {HTMLElement} element - Elemento sendo arrastado
     */
    setDraggingLayer(element) {
        if (element) {
            element.style.zIndex = this.layers.DRAGGING;
        }
    }

    /**
     * Restaura z-index após arrasto
     * @param {string} instanceId - ID da instância
     * @param {HTMLElement} element - Elemento arrastado
     */
    restoreFromDragging(instanceId, element) {
        const windowData = this.windowStack.get(instanceId);
        if (windowData && element) {
            element.style.zIndex = windowData.zIndex;
        } else if (element) {
            // Se por algum motivo a janela não está no stack, registra ela agora
            console.warn(`[WindowLayerManager] Janela ${instanceId} não encontrada no stack, registrando...`);
            this.bringToFront(instanceId, element);
        }
    }

    /**
     * Define z-index para arrasto de widgets (temporário, mas menor que janelas)
     * @param {HTMLElement} element - Widget sendo arrastado
     */
    setWidgetDraggingLayer(element) {
        if (element) {
            // Widgets em arrasto ficam em nível intermediário
            element.style.zIndex = this.layers.WINDOWS_BASE - 10; // 90
        }
    }

    /**
     * Restaura z-index de widget após arrasto
     * @param {HTMLElement} element - Widget arrastado
     */
    restoreWidgetFromDragging(element) {
        if (element) {
            element.style.zIndex = this.layers.DESKTOP_APPS;
        }
    }

    /**
     * Define z-index para elementos de sistema
     * @param {HTMLElement} element - Elemento do sistema
     * @param {string} layerType - Tipo de camada (TASKBAR, DESKTOP_APPS, etc.)
     */
    setSystemLayer(element, layerType) {
        if (element && this.layers[layerType] !== undefined) {
            element.style.zIndex = this.layers[layerType];
            console.log(`[WindowLayerManager] Elemento do sistema definido para camada ${layerType}: ${this.layers[layerType]}`);
        }
    }

    /**
     * Obtém informações de debug sobre o stack atual
     */
    getStackInfo() {
        const info = {
            currentTop: this.currentTopZIndex,
            windowCount: this.windowStack.size,
            layers: this.layers,
            windows: Array.from(this.windowStack.entries()).map(([id, data]) => ({
                instanceId: id,
                zIndex: data.zIndex,
                timestamp: data.timestamp
            })).sort((a, b) => b.zIndex - a.zIndex)
        };

        return info;
    }

    /**
     * Força reorganização manual (para debugging)
     */
    forceReorganize() {
        console.log('[WindowLayerManager] Reorganização forçada iniciada');
        this.reorderStack();
    }

    /**
     * Configura z-index para bordas de redimensionamento
     * As bordas precisam estar sempre visíveis e interativas
     * @param {HTMLElement} windowElement - Elemento da janela pai
     */
    setResizeBordersLayer(windowElement) {
        if (!windowElement) return;

        const windowData = this.windowStack.get(windowElement.id);
        if (!windowData) {
            console.warn(`[WindowLayerManager] Janela ${windowElement.id} não encontrada no stack para configurar bordas`);
            return;
        }

        // Encontra todas as bordas de redimensionamento
        const resizeBorders = windowElement.querySelectorAll(
            '.app__board_right, .app__board_left, .app__board_top, .app__board_bottom, ' +
            '.app__board_top-left, .app__board_top-right, .app__board_bottom-left, .app__board_bottom-right'
        );

        // Define z-index das bordas para 1 nível acima do conteúdo da janela
        const borderZIndex = windowData.zIndex + 1;
        
        resizeBorders.forEach(border => {
            border.style.zIndex = borderZIndex;
        });

        console.log(`[WindowLayerManager] ${resizeBorders.length} bordas de redimensionamento configuradas com z-index: ${borderZIndex}`);
    }

    /**
     * Configura z-index dos botões da barra superior
     * Os botões precisam estar sempre visíveis e clicáveis acima do conteúdo
     * @param {HTMLElement} windowElement - Elemento da janela pai
     */
    setTopBarButtonsLayer(windowElement) {
        if (!windowElement) {
            return;
        }

        const windowData = this.windowStack.get(windowElement.id);
        if (!windowData) {
            console.warn(`[WindowLayerManager] Janela ${windowElement.id} não encontrada no stack para configurar botões`);
            return;
        }

        // Encontra todos os botões da barra superior
        const topBarButtons = windowElement.querySelectorAll(
            '.app__top_bar__close_button, .app__top_bar__min_button, .app__top_bar__max_button'
        );

        // Define z-index dos botões para 2 níveis acima do conteúdo da janela
        // (1 nível acima das bordas de redimensionamento)
        const buttonZIndex = windowData.zIndex + 2;
        
        topBarButtons.forEach(button => {
            button.style.zIndex = buttonZIndex;
        });

        console.log(`[WindowLayerManager] ${topBarButtons.length} botões da barra superior configurados com z-index: ${buttonZIndex}`);
    }

    /**
     * Função de debug para identificar problemas com elementos
     */
    debugElement(element) {
        if (!element) {
            console.log('[WindowLayerManager Debug] Elemento não fornecido');
            return;
        }

        const computedStyle = getComputedStyle(element);
        const debugInfo = {
            id: element.id,
            classes: Array.from(element.classList),
            zIndex: element.style.zIndex,
            computedZIndex: computedStyle.zIndex,
            position: computedStyle.position,
            pointerEvents: computedStyle.pointerEvents,
            display: computedStyle.display,
            visibility: computedStyle.visibility,
            opacity: computedStyle.opacity
        };

        console.log('[WindowLayerManager Debug] Informações do elemento:', debugInfo);
        return debugInfo;
    }

    /**
     * Verifica e corrige janelas "perdidas" (sem z-index apropriado)
     */
    checkAndFixLostWindows() {
        const allWindows = document.querySelectorAll('.app[data-app-type="system_window"]');
        let fixedCount = 0;

        allWindows.forEach(window => {
            const instanceId = window.id;
            const hasZIndex = window.style.zIndex && parseInt(window.style.zIndex) >= this.layers.WINDOWS_BASE;
            const isInStack = this.windowStack.has(instanceId);

            if (!hasZIndex || !isInStack) {
                console.log(`[WindowLayerManager] Corrigindo janela perdida: ${instanceId}`);
                this.bringToFront(instanceId, window);
                fixedCount++;
            }
        });

        if (fixedCount > 0) {
            console.log(`[WindowLayerManager] ${fixedCount} janelas perdidas foram corrigidas`);
        }

        return fixedCount;
    }
}

// Instância global do gerenciador
export const windowLayerManager = new WindowLayerManager();

// Debug global (apenas em desenvolvimento)
if (typeof window !== 'undefined') {
    window.windowLayerManager = windowLayerManager;
}
