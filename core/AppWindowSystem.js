import { describeAppFailure, renderAppLoadError } from './ui/appLoadError.js';
import { scopeAppCss } from './ui/scopeAppCss.js';
// /core/AppWindowSystem.js - v2.1.2 (Com Sistema de Loading Integrado)

import { positionManager } from './PositionManager.js';
import { dragManager } from './DragManager.js';
import eventBus from './eventBus.js';
import { windowLayerManager } from './WindowLayerManager.js';
import { loadingUI } from './LoadingUI.js';
import { loadingManager } from './LoadingManager.js';
import { lazyResourceLoader } from './LazyResourceLoader.js';
import { aeroSnapManager } from './AeroSnapManager.js';
import { iconMarkup } from './ui/designSystem.js';

export class AppWindowSystem {
    constructor(core, desktopElement) { // Renomeado 'desktop' para 'desktopElement' para clareza
        this.core = core;
        this.desktopElement = desktopElement; // O elemento principal (div#desktop)
        this.instanceId = core.instanceId;
        this.appName = core.app_name;
        this.namespace = `app-${core.id}-${core.instanceId}`;

        const appData = core.rawData; // Usa appData completo do AppCore

        // Propriedades iniciais da janela
        this.initialWidth = appData.width || "35vw";
        this.initialHeight = appData.height || "35vh";
        this.initialX = appData.x_position || "10vw";
        this.initialY = appData.y_position || "10vh";

        this.minWidth = appData.minWidth || 200; // Valor padrão para minWidth
        this.minHeight = appData.minHeight || 100; // Valor padrão para minHeight

        // Variáveis para armazenar a posição e tamanho atuais (em string, como no original)
        this.currentWidth = null;
        this.currentHeight = null;
        this.currentX = null;
        this.currentY = null;

        // Armazenar a posição e tamanho antes de maximizar/minimizar (em pixels)
        // Usa o PositionManager para obter posições em pixels
        const pixelPositions = positionManager.getPixelPositions(appData);
        this.restoreWidth = pixelPositions.width;
        this.restoreHeight = pixelPositions.height;
        this.restoreX = pixelPositions.x;
        this.restoreY = pixelPositions.y;
        if (document.documentElement.dataset.centerWindows === 'true') {
            this.restoreX = Math.max(0, (desktopElement.clientWidth - this.restoreWidth) / 2);
            this.restoreY = Math.max(0, (desktopElement.clientHeight - this.restoreHeight - 50) / 2);
        }

        this.isMaximized = false;
        this.isMinimized = false;
        this.snapState = 'none';

        this.namespaceCSS = this.namespaceCSS.bind(this);

        this.ready = this.createWindow();
    }

    namespaceCSS(css) { return scopeAppCss(css, this.namespace); }

    async createWindow() {
        this.appWindowElement = document.createElement('div');
        this.appWindowElement.classList.add('app', this.namespace);
        this.appWindowElement.id = this.instanceId; // Define o ID da instância na janela
        this.appWindowElement.dataset.instanceId = this.instanceId; // Para o KeyboardManager
        this.appWindowElement.dataset.appId = this.core.id;
        this.appWindowElement.dataset.appType = 'system_window';

        const desktopWidth = this.desktopElement.clientWidth || window.innerWidth;
        const desktopHeight = this.desktopElement.clientHeight || window.innerHeight;
        const rootStyle = getComputedStyle(document.documentElement);
        const reserved = document.documentElement.dataset.taskbarAutohide === 'true' ? 6 : (parseFloat(rootStyle.getPropertyValue('--workspace-bar-height')) || 64) + (parseFloat(rootStyle.getPropertyValue('--workspace-bar-gap')) || 0) * 2;
        const topInset = document.documentElement.dataset.taskbarPosition === 'top' ? reserved : 0;
        this.restoreWidth = Math.min(this.restoreWidth, desktopWidth - 16);
        this.restoreHeight = Math.min(this.restoreHeight, desktopHeight - reserved - 16);
        if (desktopWidth < 760) { this.restoreWidth = desktopWidth - 16; this.restoreHeight = desktopHeight - reserved - 16; }
        this.minWidth = Math.min(this.minWidth, this.restoreWidth);
        this.minHeight = Math.min(this.minHeight, this.restoreHeight);
        this.restoreX = Math.max(8, Math.min(this.restoreX, desktopWidth - this.restoreWidth - 8));
        this.restoreY = Math.max(topInset + 8, Math.min(this.restoreY, desktopHeight - (reserved - topInset) - this.restoreHeight - 8));

        // Aplica dimensões e posição iniciais em pixels
        this.appWindowElement.style.width = `${this.restoreWidth}px`;
        this.appWindowElement.style.height = `${this.restoreHeight}px`;
        this.appWindowElement.style.left = `${this.restoreX}px`;
        this.appWindowElement.style.top = `${this.restoreY}px`;

        // Barra de título
        const topBar = document.createElement('div');
        topBar.classList.add('app__top_bar');

        const appNameSpan = document.createElement('span');
        appNameSpan.classList.add('app__top_bar__app_name');
        appNameSpan.innerHTML = iconMarkup(this.core.rawData.icon_name || 'package', { size: 16 });
        appNameSpan.appendChild(document.createTextNode(this.appName));
        topBar.appendChild(appNameSpan);

        // Duplo clique na barra de título alterna maximização (padrão Linux DE / Desktop OS)
        topBar.addEventListener('dblclick', (e) => {
            if (e.target instanceof Element && e.target.closest('button')) return;
            e.stopPropagation();
            if (this.isMaximized) {
                eventBus.emit('window:unmaximize', { instanceId: this.instanceId });
            } else {
                eventBus.emit('window:maximize', { instanceId: this.instanceId });
            }
        });

        // Habilita o arrastar na barra de título usando DragManager
        this.dragCleanup = dragManager.enableWindowDrag(this.appWindowElement, topBar, {
            onDragStart: (_e) => {
                if (this.isMaximized) {
                    return false;
                }
                if (this.snapState && this.snapState !== 'none') {
                    aeroSnapManager.unsnap(this.appWindowElement, this);
                }
                eventBus.emit("window:focus", { instanceId: this.instanceId });
                windowLayerManager.setDraggingLayer(this.appWindowElement);
            },
            onDragMove: (moveEvent) => {
                const snapZone = aeroSnapManager.checkSnapZone(moveEvent.clientX, moveEvent.clientY);
                if (snapZone !== 'none') {
                    aeroSnapManager.showPreview(snapZone);
                } else {
                    aeroSnapManager.hidePreview();
                }
            },
            onDragEnd: () => {
                if (!this.isMaximized) {
                    let snapped = false;
                    const snapZone = aeroSnapManager.currentPreview;
                    aeroSnapManager.hidePreview();
                    if (snapZone && snapZone !== 'none') {
                        aeroSnapManager.applySnap(this.appWindowElement, this, snapZone);
                        snapped = true;
                    }

                    if (!snapped) {
                        const rect = this.appWindowElement.getBoundingClientRect();
                        this.restoreX = rect.left;
                        this.restoreY = rect.top;
                        this.snapState = 'none';
                    }
                    
                    windowLayerManager.restoreFromDragging(this.instanceId, this.appWindowElement);
                }
            }
        });

        // Botões de controle (minimizar, maximizar, fechar)
        const minButton = document.createElement('button');
        minButton.type = 'button';
        minButton.setAttribute('aria-label', 'Minimizar');
        minButton.innerHTML = iconMarkup('minus', { size: 12 });
        minButton.classList.add('app__top_bar__min_button');
        minButton.title = 'Minimizar';
        minButton.addEventListener('click', (e) => {
            e.stopPropagation();
            import('./eventBus.js').then(({ default: eventBus }) => {
                eventBus.emit('window:minimize', { instanceId: this.instanceId });
            });
        });
        topBar.appendChild(minButton);

        const maxButton = document.createElement('button');
        maxButton.type = 'button';
        maxButton.setAttribute('aria-label', 'Maximizar/Restaurar');
        maxButton.innerHTML = iconMarkup('maximize-2', { size: 12 });
        maxButton.classList.add('app__top_bar__max_button');
        maxButton.title = 'Maximizar/Restaurar';
        maxButton.addEventListener('click', (e) => {
            e.stopPropagation();
            import('./eventBus.js').then(({ default: eventBus }) => {
                if (this.isMaximized) {
                    eventBus.emit('window:unmaximize', { instanceId: this.instanceId });
                } else {
                    eventBus.emit('window:maximize', { instanceId: this.instanceId });
                }
            });
        });
        topBar.appendChild(maxButton);

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.setAttribute('aria-label', 'Fechar');
        closeButton.innerHTML = iconMarkup('x', { size: 12 });
        closeButton.classList.add('app__top_bar__close_button');
        closeButton.title = 'Fechar';
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            import('./eventBus.js').then(({ default: eventBus }) => {
                eventBus.emit('window:close', { instanceId: this.instanceId });
            });
        });
        topBar.appendChild(closeButton);

        this.appWindowElement.appendChild(topBar);

        // CORREÇÃO: Criar bordas ANTES do conteúdo para evitar sobreposição
        this.createResizeHandles();

        // Área de conteúdo (onde o HTML do app será carregado)
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('app__content');
        this.appWindowElement.appendChild(contentDiv);

        // *** NOVA ESTRATÉGIA: Sem Shadow DOM - injeção direta ***
        loadingUI.attach(this.instanceId, this.appWindowElement, contentDiv, this.appName);
        this.appContentRoot = contentDiv; // O elemento de conteúdo direto

        // Anexa a janela ao div#desktop
        this.desktopElement.appendChild(this.appWindowElement);

        // CORREÇÃO: Registra a janela no WindowLayerManager imediatamente
        // Isso garante que ela tenha um z-index apropriado desde o início
        windowLayerManager.bringToFront(this.instanceId, this.appWindowElement);
        
        // Configura z-index das bordas de redimensionamento
        windowLayerManager.setResizeBordersLayer(this.appWindowElement);

        // Carrega o conteúdo HTML e CSS do aplicativo DENTRO do elemento de conteúdo
        await Promise.all([this.loadAppContent(), this.core.moduleReady]);
        if (this.core.stopped) return;
        if (this.loadError || this.core.moduleError) { await this.core.cleanup(); this.showLoadError(); return; }
        
        // IMPORTANTE: Configura z-index dos botões APÓS tudo estar carregado
        windowLayerManager.setTopBarButtonsLayer(this.appWindowElement);

        // Chama onRun() na instância do aplicativo APÓS o elemento da janela ser anexado ao DOM
        // e o conteúdo HTML/CSS carregado.
        if (this.core.appInstance && typeof this.core.appInstance.onRun === "function") {
            this.core.appInstance.appContentRoot = this.appContentRoot;
            try { await this.core.appInstance.onRun(null, this.core.lastAppParams); }
            catch (error) {
                if (this.core.stopped) return;
                this.startError = error;
                console.error(`[AppWindowSystem] Falha ao iniciar ${this.core.id}:`, error);
                eventBus.emit('app:loading:error', { instanceId: this.instanceId, resourceType: 'boot', error });
                await this.core.cleanup();
                this.showLoadError();
            }
        } else {
            console.warn(`[${this.appName} - ${this.instanceId}] Nenhuma instância de app ou método onRun encontrado para chamar após renderização.`);
        }
    }


    createResizeHandles() {
        const borders = [
            ["app__board_right", this.enableResizeRight.bind(this)],
            ["app__board_left", this.enableResizeLeft.bind(this)],
            ["app__board_top", this.enableResizeTop.bind(this)],
            ["app__board_bottom", this.enableResizeBottom.bind(this)]
        ];

        borders.forEach(([cls, fn]) => {
            const el = document.createElement("div");
            el.classList.add(cls);
            this.appWindowElement.appendChild(el);
            // Chama a função que configura o event listener
            fn(el);
        });

        // Adicionar alças de canto para redimensionamento diagonal
        const corners = [
            ["app__board_top-left", this.enableResizeCorner.bind(this, 'nw')],
            ["app__board_top-right", this.enableResizeCorner.bind(this, 'ne')],
            ["app__board_bottom-left", this.enableResizeCorner.bind(this, 'sw')],
            ["app__board_bottom-right", this.enableResizeCorner.bind(this, 'se')]
        ];
        corners.forEach(([cls, fn]) => {
            const el = document.createElement("div");
            el.classList.add(cls);
            this.appWindowElement.appendChild(el);
            // Para cantos, o enableResizeCorner recebe o elemento como segundo parâmetro
            fn(el);
        });
    }

    async loadAppContent() {
        try {
            // Commit styled content together; a slow stylesheet must not expose raw controls.
            const resource = (stage, url, load) => !url ? '' : load.call(lazyResourceLoader, url, this.instanceId).catch(cause => {
                throw Object.assign(new Error(cause?.message || String(cause)), { stage, resource: url });
            });
            const [html, styleText] = await Promise.all([
                resource('html', this.core.dirApp, lazyResourceLoader.loadHTMLProgressively),
                resource('css', this.core.styleFile, lazyResourceLoader.loadCSSProgressively)
            ]);
            if (this.core.stopped) return;
            if (styleText) {
                const styleElement = document.createElement('style');
                styleElement.id = `style-${this.namespace}`;
                styleElement.textContent = this.namespaceCSS(styleText);
                document.head.appendChild(styleElement);
            }
            this.appContentRoot.innerHTML = html;
            lazyResourceLoader.setupLazyImages(this.appContentRoot);
            lazyResourceLoader.setupLazyIcons(this.appContentRoot);

            // Verifica se há fontes para carregar
            const fontElements = this.appContentRoot.querySelectorAll('[data-font-family]');
            if (fontElements.length > 0) {
                eventBus.emit('app:loading:start', { 
                    instanceId: this.instanceId, 
                    resourceType: 'fonts' 
                });

                const fontPromises = Array.from(fontElements).map(async (element) => {
                    const fontFamily = element.getAttribute('data-font-family');
                    const fontUrl = element.getAttribute('data-font-url');
                    
                    if (fontFamily && fontUrl) {
                        return lazyResourceLoader.setupLazyFonts([{
                            family: fontFamily,
                            url: fontUrl
                        }]);
                    }
                });

                await Promise.all(fontPromises);
                
                eventBus.emit('app:loading:complete', { 
                    instanceId: this.instanceId, 
                    resourceType: 'fonts' 
                });
            } else {
                eventBus.emit('app:loading:complete', { 
                    instanceId: this.instanceId, 
                    resourceType: 'fonts' 
                });
            }

        } catch (error) {
            this.loadError = error;
            console.error(`Erro carregando recursos do app ${this.appName}:`, error);
            if (!this.core.stopped) this.showLoadError();
            
            eventBus.emit('app:loading:error', { 
                instanceId: this.instanceId, 
                error, 
                resourceType: 'general' 
            });
        }
    }

    focusLoadError() { this.appContentRoot.querySelector('h2')?.focus({ preventScroll: true }); }

    showLoadError() {
        this.core.launchFailed = true;
        loadingUI.remove(this.instanceId);
        const error = this.core.moduleError || this.startError || this.loadError;
        this.failure = describeAppFailure({
            appId: this.core.id, appName: this.appName, error,
            stage: this.core.moduleError ? 'module' : this.startError ? 'start' : this.loadError?.stage || 'resource',
            resource: this.core.moduleError || this.startError ? this.core.jsFile : this.loadError?.resource
        });
        renderAppLoadError(this.appContentRoot, this.failure, {
            onRetry: () => window.appManager.restartApp(this.instanceId),
            onClose: () => window.appManager.stopApp(this.instanceId)
        });
    }

    enableResizeRight(bord) {
        bord.addEventListener('mousedown', e => {
            if (this.isMaximized) return;
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = this.appWindowElement.offsetWidth;

            const onMouseMove = e => {
                const newWidth = startWidth + (e.clientX - startX);
                if (newWidth > this.minWidth) {
                    this.appWindowElement.style.width = newWidth + "px";
                    this.currentWidth = this.appWindowElement.style.width;
                }
            };

            const onMouseUp = () => {
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
            };

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        });
    }

    enableResizeLeft(bord) {
        bord.addEventListener('mousedown', e => {
            if (this.isMaximized) return;
            e.preventDefault();
            const startX = e.clientX;
            const startLeft = this.appWindowElement.offsetLeft;
            const startWidth = this.appWindowElement.offsetWidth;

            const onMouseMove = e => {
                const dx = startX - e.clientX;
                const newWidth = startWidth + dx;
                if (newWidth > this.minWidth) {
                    this.appWindowElement.style.width = newWidth + "px";
                    this.appWindowElement.style.left = (startLeft - dx) + "px";
                    this.currentWidth = this.appWindowElement.style.width;
                    this.currentX = this.appWindowElement.style.left;
                }
            };

            const onMouseUp = () => {
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
            };

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        });
    }

    enableResizeTop(bord) {
        bord.addEventListener('mousedown', e => {
            if (this.isMaximized) return;
            e.preventDefault();
            const startY = e.clientY;
            const startTop = this.appWindowElement.offsetTop;
            const startHeight = this.appWindowElement.offsetHeight;

            const onMouseMove = e => {
                const dy = startY - e.clientY;
                const newHeight = startHeight + dy;
                if (newHeight > this.minHeight) {
                    this.appWindowElement.style.height = newHeight + "px";
                    this.appWindowElement.style.top = (startTop - dy) + "px";
                    this.currentHeight = this.appWindowElement.style.height;
                    this.currentY = this.appWindowElement.style.top;
                }
            };

            const onMouseUp = () => {
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
            };

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        });
    }

    enableResizeBottom(bord) {
        bord.addEventListener('mousedown', e => {
            if (this.isMaximized) return;
            e.preventDefault();
            const startY = e.clientY;
            const startHeight = this.appWindowElement.offsetHeight;

            const onMouseMove = e => {
                const newHeight = startHeight + (e.clientY - startY);
                if (newHeight > this.minHeight) {
                    this.appWindowElement.style.height = newHeight + "px";
                    this.currentHeight = this.appWindowElement.style.height;
                }
            };

            const onMouseUp = () => {
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
            };

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        });
    }

    enableResizeCorner(direction, bord) {
        bord.addEventListener('mousedown', e => {
            if (this.isMaximized) return;
            e.preventDefault();

            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = this.appWindowElement.offsetWidth;
            const startHeight = this.appWindowElement.offsetHeight;
            const startLeft = this.appWindowElement.offsetLeft;
            const startTop = this.appWindowElement.offsetTop;

            const onMouseMove = (moveEvent) => {
                let newWidth = startWidth;
                let newHeight = startHeight;
                let newLeft = startLeft;
                let newTop = startTop;

                if (direction.includes('e')) { // Right
                    newWidth = startWidth + (moveEvent.clientX - startX);
                }
                if (direction.includes('w')) { // Left
                    const dx = startX - moveEvent.clientX;
                    newWidth = startWidth + dx;
                    newLeft = startLeft - dx;
                }
                if (direction.includes('s')) { // Bottom
                    newHeight = startHeight + (moveEvent.clientY - startY);
                }
                if (direction.includes('n')) { // Top
                    const dy = startY - moveEvent.clientY;
                    newHeight = startHeight + dy;
                    newTop = startTop - dy;
                }

                if (newWidth > this.minWidth) {
                    this.appWindowElement.style.width = newWidth + "px";
                    if (direction.includes('w')) this.appWindowElement.style.left = newLeft + "px";
                    this.currentWidth = this.appWindowElement.style.width;
                    this.currentX = this.appWindowElement.style.left;
                }
                if (newHeight > this.minHeight) {
                    this.appWindowElement.style.height = newHeight + "px";
                    if (direction.includes('n')) this.appWindowElement.style.top = newTop + "px";
                    this.currentHeight = this.appWindowElement.style.height;
                    this.currentY = this.appWindowElement.style.top;
                }
            };

            const onMouseUp = () => {
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
            };

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        });
    }

    remove() {
        this.core.stopped = true;
        loadingUI.remove(this.instanceId);
        loadingManager.clearInstance(this.instanceId);
        // Limpa o drag se existir
        if (this.dragCleanup) {
            this.dragCleanup();
        }

        // Remove o elemento da janela
        if (this.appWindowElement && this.appWindowElement.parentNode) {
            this.appWindowElement.remove();
        }

        // Remove o CSS namespaced
        const styleElement = document.getElementById(`style-${this.namespace}`);
        if (styleElement) {
            styleElement.remove();
        }

        console.log(`[AppWindowSystem] Janela '${this.appName}' removida e recursos limpos`);
    }

    minimize() {
        this.isMinimized = true;
        this.appWindowElement.style.display = 'none';
        this.appWindowElement.classList.add('minimized');
        console.log(`[AppWindowSystem] Janela '${this.appName}' minimizada`);
        
        // Emite evento para notificar mudança de estado
        eventBus.emit('window:state:changed', { 
            instanceId: this.instanceId, 
            state: 'minimized',
            isMinimized: true,
            isMaximized: this.isMaximized,
            isActive: false
        });
    }

    restore() {
        this.isMinimized = false;
        this.appWindowElement.style.display = '';
        this.appWindowElement.classList.remove('minimized');
        console.log(`[AppWindowSystem] Janela '${this.appName}' restaurada`);
        
        // Emite evento para notificar mudança de estado
        eventBus.emit('window:state:changed', { 
            instanceId: this.instanceId, 
            state: this.isMaximized ? 'maximized' : 'normal',
            isMinimized: false,
            isMaximized: this.isMaximized,
            isActive: true
        });
    }

    maximize() {
        this.isMaximized = true;
        this.appWindowElement.classList.remove('snapped-left', 'snapped-right');

        // Salva posição/tamanho atuais para restauração
        this._restoreWin = {
            width: this.appWindowElement.style.width,
            height: this.appWindowElement.style.height,
            left: this.appWindowElement.style.left,
            top: this.appWindowElement.style.top
        };

        // Aplica maximização
        this.appWindowElement.style.left = '0px';
        this.appWindowElement.style.top = 'var(--workspace-window-top, 0px)';
        this.appWindowElement.style.width = '100%';
        this.appWindowElement.style.height = 'calc(100% - var(--workspace-reserved, 50px))';
        this.appWindowElement.classList.add('maximized');

        console.log(`[AppWindowSystem] Janela '${this.appName}' maximizada`);
        
        // Emite evento para notificar mudança de estado
        eventBus.emit('window:state:changed', { 
            instanceId: this.instanceId, 
            state: 'maximized',
            isMinimized: this.isMinimized,
            isMaximized: true,
            isActive: true
        });
    }

    /**
     * Remove maximização da janela
     */
    unmaximize() {
        this.isMaximized = false;
        this.snapState = 'none';
        this.appWindowElement.classList.remove('snapped-left', 'snapped-right');

        // Restaura posição/tamanho salvos
        if (this._restoreWin) {
            this.appWindowElement.style.width = this._restoreWin.width;
            this.appWindowElement.style.height = this._restoreWin.height;
            this.appWindowElement.style.left = this._restoreWin.left;
            this.appWindowElement.style.top = this._restoreWin.top;
        }

        this.appWindowElement.classList.remove('maximized');

        console.log(`[AppWindowSystem] Janela '${this.appName}' desmaximizada`);
        
        // Emite evento para notificar mudança de estado
        eventBus.emit('window:state:changed', { 
            instanceId: this.instanceId, 
            state: 'normal',
            isMinimized: this.isMinimized,
            isMaximized: false,
            isActive: true
        });
    }

    /**
     * Ajusta a janela via Aero Snap ('left' | 'right' | 'top' | 'none')
     * @param {'left'|'right'|'top'|'none'} zone
     */
    snapTo(zone) {
        if (this.isMinimized) {
            this.restore();
        }
        if (zone === 'none') {
            if (this.isMaximized) {
                this.unmaximize();
            } else {
                aeroSnapManager.unsnap(this.appWindowElement, this);
            }
            return;
        }
        if (this.isMaximized && zone !== 'top') {
            this.unmaximize();
        }
        aeroSnapManager.applySnap(this.appWindowElement, this, zone);
    }

    /**
     * Centraliza a janela na área de trabalho
     */
    centerWindow() {
        if (this.isMinimized) {
            this.restore();
        }
        if (this.isMaximized) {
            this.unmaximize();
        } else if (this.snapState && this.snapState !== 'none') {
            aeroSnapManager.unsnap(this.appWindowElement, this);
        }

        const desktopWidth = this.desktopElement?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1280);
        const desktopHeight = this.desktopElement?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 720);
        const winWidth = this.appWindowElement.offsetWidth || parseFloat(this.appWindowElement.style.width) || 640;
        const winHeight = this.appWindowElement.offsetHeight || parseFloat(this.appWindowElement.style.height) || 480;

        const left = Math.max(8, Math.round((desktopWidth - winWidth) / 2));
        const top = Math.max(8, Math.round((desktopHeight - winHeight - 50) / 2));

        this.appWindowElement.style.left = `${left}px`;
        this.appWindowElement.style.top = `${top}px`;
        this.restoreX = left;
        this.restoreY = top;
    }

    /**
     * Foca a janela (traz para primeiro plano)
     */
    focus() {
        this.appWindowElement.classList.add('active-app');
        
        // Se a janela estava minimizada, restaura ela
        if (this.isMinimized) {
            this.restore();
        }
        
        // Atualiza z-index dos botões quando a janela ganha foco
        windowLayerManager.setTopBarButtonsLayer(this.appWindowElement);
        
        // Emite evento para notificar mudança de estado apenas se não estava minimizada
        if (!this.isMinimized) {
            eventBus.emit('window:state:changed', { 
                instanceId: this.instanceId, 
                state: this.isMaximized ? 'maximized' : 'normal',
                isMinimized: this.isMinimized,
                isMaximized: this.isMaximized,
                isActive: true
            });
        }
        
        console.log(`[AppWindowSystem] Janela '${this.appName}' focada`);
    }

    unfocus() {
        this.appWindowElement.classList.remove('active-app');
        
        // Emite evento para notificar mudança de estado
        eventBus.emit('window:state:changed', { 
            instanceId: this.instanceId, 
            state: this.isMinimized ? 'minimized' : (this.isMaximized ? 'maximized' : 'normal'),
            isMinimized: this.isMinimized,
            isMaximized: this.isMaximized,
            isActive: false
        });
        
        console.log(`[AppWindowSystem] Janela '${this.appName}' desfocada`);
    }

    isMinimized() {
        return this.isMinimized;
    }

    isMaximized() {
        return this.isMaximized;
    }

}
