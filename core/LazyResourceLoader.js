// /core/LazyResourceLoader.js - v1.0.0
// Sistema de carregamento lazy para recursos das aplicações

import { loadingManager } from './LoadingManager.js';
import eventBus from './eventBus.js';
import { iconMarkup } from './ui/designSystem.js';

export class LazyResourceLoader {
    constructor() {
        this.intersectionObserver = null;
        this.loadingQueue = new Set();
        this.loadedResources = new Set();
        this.setupIntersectionObserver();
    }

    setupIntersectionObserver() {
        if ('IntersectionObserver' in window) {
            this.intersectionObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.loadVisibleResource(entry.target);
                    }
                });
            }, {
                rootMargin: '50px' // Carrega recursos 50px antes de ficarem visíveis
            });
        }
    }

    // Lazy loading de imagens
    setupLazyImages(container) {
        const images = container.querySelectorAll('img[data-src]');
        images.forEach(img => {
            if (this.intersectionObserver) {
                this.intersectionObserver.observe(img);
            } else {
                // Fallback para navegadores sem IntersectionObserver
                this.loadImage(img);
            }
        });
    }

    // Lazy loading de ícones SVG
    setupLazyIcons(container) {
        const icons = container.querySelectorAll('[data-icon-src]');
        icons.forEach(icon => {
            if (this.intersectionObserver) {
                this.intersectionObserver.observe(icon);
            } else {
                this.loadIcon(icon);
            }
        });
    }

    // Lazy loading de fontes
    async setupLazyFonts(fontList) {
        if (!('fonts' in document)) return;

        for (const fontConfig of fontList) {
            try {
                const font = new FontFace(
                    fontConfig.family, 
                    `url(${fontConfig.url})`,
                    fontConfig.descriptors || {}
                );

                // Carrega a fonte apenas quando necessária
                await font.load();
                document.fonts.add(font);
                
                console.log(`[LazyResourceLoader] Fonte ${fontConfig.family} carregada`);
            } catch (error) {
                console.error(`[LazyResourceLoader] Erro ao carregar fonte ${fontConfig.family}:`, error);
            }
        }
    }

    // Carregamento progressivo de CSS
    async loadCSSProgressively(cssUrl, instanceId) {
        try {
            eventBus.emit('app:loading:start', { 
                instanceId, 
                resourceType: 'css', 
                resourceUrl: cssUrl 
            });

            // Simula progresso do carregamento
            eventBus.emit('app:loading:progress', { 
                instanceId, 
                progress: 25, 
                message: 'Baixando estilos...' 
            });

            const response = await fetch(cssUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            eventBus.emit('app:loading:progress', { 
                instanceId, 
                progress: 50, 
                message: 'Processando CSS...' 
            });

            const cssText = await response.text();

            eventBus.emit('app:loading:progress', { 
                instanceId, 
                progress: 75, 
                message: 'Aplicando estilos...' 
            });

            // Processa o CSS para otimizações
            const optimizedCSS = this.optimizeCSS(cssText);

            eventBus.emit('app:loading:progress', { 
                instanceId, 
                progress: 100, 
                message: 'Estilos aplicados' 
            });

            eventBus.emit('app:loading:complete', { 
                instanceId, 
                resourceType: 'css' 
            });

            return optimizedCSS;

        } catch (error) {
            eventBus.emit('app:loading:error', { 
                instanceId, 
                error, 
                resourceType: 'css' 
            });
            throw error;
        }
    }

    // Carregamento progressivo de HTML
    async loadHTMLProgressively(htmlUrl, instanceId) {
        try {
            eventBus.emit('app:loading:start', { 
                instanceId, 
                resourceType: 'html', 
                resourceUrl: htmlUrl 
            });

            eventBus.emit('app:loading:progress', { 
                instanceId, 
                progress: 30, 
                message: 'Baixando interface...' 
            });

            const response = await fetch(htmlUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            eventBus.emit('app:loading:progress', { 
                instanceId, 
                progress: 60, 
                message: 'Processando HTML...' 
            });

            const htmlText = await response.text();

            eventBus.emit('app:loading:progress', { 
                instanceId, 
                progress: 90, 
                message: 'Preparando interface...' 
            });

            // Pré-processa o HTML para lazy loading
            const processedHTML = this.preprocessHTML(htmlText);

            eventBus.emit('app:loading:progress', { 
                instanceId, 
                progress: 100, 
                message: 'Interface carregada' 
            });

            eventBus.emit('app:loading:complete', { 
                instanceId, 
                resourceType: 'html' 
            });

            return processedHTML;

        } catch (error) {
            eventBus.emit('app:loading:error', { 
                instanceId, 
                error, 
                resourceType: 'html' 
            });
            throw error;
        }
    }

    // Carregamento lazy de JavaScript
    async loadJSLazily(jsUrl, instanceId) {
        try {
            eventBus.emit('app:loading:start', { 
                instanceId, 
                resourceType: 'js', 
                resourceUrl: jsUrl 
            });

            eventBus.emit('app:loading:progress', { 
                instanceId, 
                progress: 20, 
                message: 'Carregando funcionalidades...' 
            });

            const module = await import(jsUrl);

            eventBus.emit('app:loading:progress', { 
                instanceId, 
                progress: 100, 
                message: 'Funcionalidades carregadas' 
            });

            eventBus.emit('app:loading:complete', { 
                instanceId, 
                resourceType: 'js' 
            });

            return module;

        } catch (error) {
            eventBus.emit('app:loading:error', { 
                instanceId, 
                error, 
                resourceType: 'js' 
            });
            throw error;
        }
    }

    loadVisibleResource(element) {
        if (element.hasAttribute('data-src')) {
            this.loadImage(element);
        } else if (element.hasAttribute('data-icon-src')) {
            this.loadIcon(element);
        }
    }

    async loadImage(img) {
        const src = img.getAttribute('data-src');
        if (!src || this.loadedResources.has(src)) return;

        this.loadedResources.add(src);

        try {
            // Cria uma nova imagem para pré-carregar
            const newImg = new Image();
            
            return new Promise((resolve, reject) => {
                newImg.onload = () => {
                    img.src = src;
                    img.removeAttribute('data-src');
                    img.classList.remove('lazy-loading');
                    img.classList.add('lazy-loaded');
                    resolve();
                };
                
                newImg.onerror = () => {
                    img.src = '/assets/icons/others/image_placeholder.svg';
                    img.classList.remove('lazy-loading');
                    img.classList.add('lazy-error');
                    reject(new Error(`Failed to load image: ${src}`));
                };
                
                newImg.src = src;
            });
        } catch (error) {
            console.error('[LazyResourceLoader] Erro ao carregar imagem:', error);
        }
    }

    async loadIcon(element) {
        const iconSrc = element.getAttribute('data-icon-src');
        if (!iconSrc || this.loadedResources.has(iconSrc)) return;

        this.loadedResources.add(iconSrc);

        try {
            const response = await fetch(iconSrc);
            const svgText = await response.text();
            
            if (element.tagName.toLowerCase() === 'img') {
                element.src = `data:image/svg+xml;base64,${btoa(svgText)}`;
            } else {
                element.innerHTML = svgText;
            }
            
            element.removeAttribute('data-icon-src');
            element.classList.add('icon-loaded');
            
        } catch (error) {
            console.error('[LazyResourceLoader] Erro ao carregar ícone:', error);
            if (element.tagName.toLowerCase() === 'img') element.src = '/design-system/rda/icons/help-circle.svg';
            else element.innerHTML = iconMarkup('help-circle');
        }
    }

    // Otimiza CSS removendo comentários e espaços desnecessários
    optimizeCSS(cssText) {
        return cssText
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comentários
            .replace(/\s+/g, ' ') // Normaliza espaços
            .replace(/;\s*}/g, '}') // Remove últimos pontos e vírgulas
            .trim();
    }

    // Pré-processa HTML para lazy loading
    preprocessHTML(htmlText) {
        // Converte imagens para lazy loading
        htmlText = htmlText.replace(
            /<img([^>]+)src="([^"]+)"([^>]*)>/gi,
            '<img$1data-src="$2"$3 class="lazy-loading">'
        );

        // Converte ícones para lazy loading
        htmlText = htmlText.replace(
            /<([^>]+)data-icon="([^"]+)"([^>]*)>/gi,
            '<$1data-icon-src="$2"$3>'
        );

        return htmlText;
    }

    // Carrega recursos críticos primeiro
    async loadCriticalResources(resourceList, instanceId) {
        const criticalResources = resourceList.filter(r => r.critical);
        const nonCriticalResources = resourceList.filter(r => !r.critical);

        // Carrega recursos críticos em paralelo
        const criticalPromises = criticalResources.map(resource => 
            this.loadResourceByType(resource, instanceId)
        );

        await Promise.all(criticalPromises);

        // Carrega recursos não críticos sequencialmente para não sobrecarregar
        for (const resource of nonCriticalResources) {
            await this.loadResourceByType(resource, instanceId);
        }
    }

    async loadResourceByType(resource, instanceId) {
        switch (resource.type) {
            case 'css':
                return this.loadCSSProgressively(resource.url, instanceId);
            case 'html':
                return this.loadHTMLProgressively(resource.url, instanceId);
            case 'js':
                return this.loadJSLazily(resource.url, instanceId);
            case 'font':
                return this.setupLazyFonts([resource]);
            default:
                return loadingManager.preloadResource(resource.url, resource.type);
        }
    }

    // Limpa observadores quando necessário
    cleanup() {
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }
        this.loadingQueue.clear();
    }

    // Obtém estatísticas de performance
    getPerformanceStats() {
        return {
            loadedResources: this.loadedResources.size,
            queueSize: this.loadingQueue.size,
            supportsIntersectionObserver: !!this.intersectionObserver
        };
    }
}

// Instância global
export const lazyResourceLoader = new LazyResourceLoader();
