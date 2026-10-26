import { scopeAppCss } from './ui/scopeAppCss.js';
// /core/AppCustomUI.js - v2.1.1

import { positionManager } from './PositionManager.js';
import { windowLayerManager } from './WindowLayerManager.js';

/**
 * Gerencia aplicativos com UI personalizada que são parte fundamental do ambiente desktop.
 * Estes aplicativos iniciam automaticamente, não podem ser fechados e têm UI integrada.
 * 
 * NOVA ESTRATÉGIA: Injeção direta com PositionManager para posicionamento correto
 */
export class AppCustomUI {
    constructor(core, desktopElement) {
        this.core = core;
        this.desktopElement = desktopElement;
        this.appElement = null;
        this.namespace = `app-${core.id}-${core.instanceId}`;
        this.isInitialized = false;
        
        // Bind methods
        this.init = this.init.bind(this);
        this.loadContent = this.loadContent.bind(this);
        this.createAppElement = this.createAppElement.bind(this);
        this.namespaceCSS = this.namespaceCSS.bind(this);

    }

    /**
     * Inicializa o aplicativo de desktop.
     */
    async init() {
        try {
            console.log(`[AppCustomUI] Inicializando app de desktop: ${this.core.app_name}`);
            
            // Cria o elemento do aplicativo
            this.createAppElement();
            
            // Carrega o conteúdo HTML e CSS
            await this.loadContent();
            
            // Adiciona ao desktop
            this.desktopElement.appendChild(this.appElement);
            console.log(`[AppCustomUI] Elemento de ${this.core.app_name} adicionado ao desktop:`, this.appElement);
            
            // Inicializa a instância do aplicativo
            if (this.core.appInstance && typeof this.core.appInstance.onRun === "function") {
                console.log(`[AppCustomUI] Inicializando instância do app: ${this.core.app_name}`);
                // Define o appContentRoot (contentDiv) e desktopElement para que o app possa acessar seu DOM
                const contentDiv = this.appElement.querySelector('.desktop-app-content');
                this.core.appInstance.appContentRoot = contentDiv || this.appElement;
                this.core.appInstance.desktopElement = this.desktopElement;
                await this.core.appInstance.onRun(null, this.core.lastAppParams);
            } else {
                console.warn(`[AppCustomUI] App ${this.core.app_name} não tem instância ou método onRun`);
            }
            
            this.isInitialized = true;
            console.log(`[AppCustomUI] App de desktop '${this.core.app_name}' inicializado com sucesso`);
            
        } catch (error) {
            console.error(`[AppCustomUI] Erro ao inicializar app de desktop '${this.core.app_name}':`, error);
            throw error;
        }
    }

    /**
     * Cria o elemento principal do aplicativo.
     */
    createAppElement() {
        this.appElement = document.createElement('div');
        this.appElement.classList.add('desktop-app', this.namespace);
        this.appElement.id = this.core.instanceId;
        this.appElement.dataset.instanceId = this.core.instanceId; // Para o KeyboardManager
        this.appElement.dataset.appId = this.core.id;
        this.appElement.dataset.appName = this.core.app_name;
        this.appElement.dataset.appType = 'desktop_ui';
        
        // Aplica posicionamento usando o PositionManager
        positionManager.applyPosition(this.appElement, this.core.rawData);
        
        console.log(`[AppCustomUI] Elemento criado para ${this.core.app_name}:`, {
            id: this.appElement.id,
            namespace: this.namespace,
            classes: this.appElement.className,
            mode: this.core.mode,
            position: this.appElement.style.position,
            top: this.appElement.style.top,
            left: this.appElement.style.left,
            right: this.appElement.style.right,
            bottom: this.appElement.style.bottom
        });
        
        // Estilos base inline para garantir funcionamento
        // Para apps de desktop_ui, não aplica estilos que possam interferir com o posicionamento
        if (this.core.mode === 'desktop_ui') {
            this.appElement.style.pointerEvents = 'auto';
            // Define z-index para widgets de desktop usando WindowLayerManager
            windowLayerManager.setSystemLayer(this.appElement, 'DESKTOP_APPS');
        } else {
            this.appElement.style.cssText += `
                position: relative;
                width: 100%;
                height: 100%;
                pointer-events: auto;
            `;
            // Para custom_ui também usa sistema de camadas
            windowLayerManager.setSystemLayer(this.appElement, 'DESKTOP_APPS');
        }
    }

    /**
     * Aplica namespace CSS ao conteúdo para evitar conflitos.
     * @param {string} css - CSS original
     * @returns {string} CSS com namespace aplicado
     */
    namespaceCSS(css) { return scopeAppCss(css, this.namespace); }



    /**
     * Carrega o conteúdo HTML e CSS do aplicativo.
     */
    async loadContent() {
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('desktop-app-content');
        
        // Carrega o HTML do aplicativo
        if (this.core.dirApp) {
            try {
                const htmlResponse = await fetch(this.core.dirApp);
                if (!htmlResponse.ok) {
                    throw new Error(`HTTP error! status: ${htmlResponse.status} for ${this.core.dirApp}`);
                }
                const html = await htmlResponse.text();
                contentDiv.innerHTML = html;
            } catch (error) {
                console.error(`[AppCustomUI] Erro ao carregar HTML do app ${this.core.app_name}:`, error);
                contentDiv.innerHTML = `
                    <div style="color: red; text-align: center; padding: 20px;">
                        Erro ao carregar conteúdo: ${error.message}
                    </div>
                `;
            }
        } else {
            contentDiv.innerHTML = `
                <div style="color: white; text-align: center; padding: 20px;">
                    Nenhum conteúdo HTML definido para este aplicativo de desktop.
                </div>
            `;
        }
        
        this.appElement.appendChild(contentDiv);
        
        // Carrega o CSS do aplicativo
        if (this.core.styleFile) {
            try {
                const styleResponse = await fetch(this.core.styleFile);
                if (!styleResponse.ok) {
                    throw new Error(`HTTP error! status: ${styleResponse.status} for ${this.core.styleFile}`);
                }
                const styleText = await styleResponse.text();
                
                // Aplica namespace ao CSS
                const namespacedCSS = this.namespaceCSS(styleText);
                
                // Cria elemento de estilo no head do documento
                const styleElement = document.createElement('style');
                styleElement.id = `style-${this.namespace}`;
                styleElement.textContent = namespacedCSS;
                document.head.appendChild(styleElement);
                
                console.log(`[AppCustomUI] CSS carregado para ${this.core.app_name}:`, {
                    styleId: styleElement.id,
                    cssLength: namespacedCSS.length,
                    hasSystemInfoWidget: namespacedCSS.includes('.system-info-widget')
                });
                
            } catch (error) {
                console.error(`[AppCustomUI] Erro ao carregar CSS do app ${this.core.app_name}:`, error);
            }
        }
    }

    /**
     * Remove o aplicativo do DOM (apenas para limpeza interna).
     * Apps de desktop não podem ser fechados pelo usuário.
     */
    remove() {
        // Remove o elemento do app
        if (this.appElement && this.appElement.parentNode) {
            this.appElement.remove();
        }
        
        // Remove o CSS namespaced
        const styleElement = document.getElementById(`style-${this.namespace}`);
        if (styleElement) {
            styleElement.remove();
        }
        
        this.isInitialized = false;
    }

    /**
     * Verifica se o aplicativo está inicializado.
     */
    isReady() {
        return this.isInitialized;
    }

    /**
     * Obtém o elemento raiz do aplicativo.
     */
    getAppElement() {
        return this.appElement;
    }

    /**
     * Obtém o namespace do aplicativo.
     */
    getNamespace() {
        return this.namespace;
    }
}