// /core/LoadingManager.js - v1.0.0
// Sistema de gerenciamento de loading para aplicações do UnkayOS

import eventBus from './eventBus.js';

export class LoadingManager {
    constructor() {
        this.loadingStates = new Map(); // instanceId -> loadingState
        this.resourceCache = new Map(); // url -> cached resource
        this.loadingQueue = new Map(); // url -> Promise (para evitar requisições duplicadas)
        
        this.registerEventListeners();
    }

    registerEventListeners() {
        // Escuta eventos de loading das aplicações
        eventBus.on('app:loading:start', ({ instanceId, resourceType, resourceUrl }) => {
            this.startLoading(instanceId, resourceType, resourceUrl);
        });

        eventBus.on('app:loading:progress', ({ instanceId, progress, message }) => {
            this.updateProgress(instanceId, progress, message);
        });

        eventBus.on('app:loading:complete', ({ instanceId, resourceType }) => {
            this.completeLoading(instanceId, resourceType);
        });

        eventBus.on('app:loading:error', ({ instanceId, error, resourceType }) => {
            this.errorLoading(instanceId, error, resourceType);
        });
    }

    startLoading(instanceId, resourceType, resourceUrl = null) {
        if (!this.loadingStates.has(instanceId)) {
            this.loadingStates.set(instanceId, {
                isLoading: true,
                resources: new Map(),
                startTime: performance.now(),
                progress: 0,
                errors: []
            });
        }

        const state = this.loadingStates.get(instanceId);
        state.isLoading = true;
        state.resources.set(resourceType, {
            status: 'loading',
            url: resourceUrl,
            startTime: performance.now()
        });

        // Emite evento para atualizar UI
        eventBus.emit('loading:state:changed', {
            instanceId,
            state: this.getLoadingState(instanceId)
        });

        console.log(`[LoadingManager] Iniciando loading de ${resourceType} para ${instanceId}`);
    }

    updateProgress(instanceId, progress, message = '') {
        const state = this.loadingStates.get(instanceId);
        if (state) {
            state.progress = Math.max(state.progress, progress);
            state.currentMessage = message;

            eventBus.emit('loading:state:changed', {
                instanceId,
                state: this.getLoadingState(instanceId)
            });
        }
    }

    completeLoading(instanceId, resourceType) {
        const state = this.loadingStates.get(instanceId);
        if (state && state.resources.has(resourceType)) {
            const resource = state.resources.get(resourceType);
            resource.status = 'completed';
            resource.loadTime = performance.now() - resource.startTime;

            // Verifica se todos os recursos foram carregados
            const allCompleted = Array.from(state.resources.values())
                .every(r => r.status === 'completed' || r.status === 'error');

            if (allCompleted) {
                state.isLoading = false;
                state.totalLoadTime = performance.now() - state.startTime;
                
                eventBus.emit('loading:complete', {
                    instanceId, loadTime: state.totalLoadTime, stats: this.getLoadingStats(instanceId)
                });
            }

            eventBus.emit('loading:state:changed', {
                instanceId,
                state: this.getLoadingState(instanceId)
            });
        }

        if (state && !state.isLoading) this.loadingStates.delete(instanceId);
    }

    errorLoading(instanceId, error, resourceType) {
        const state = this.loadingStates.get(instanceId);
        if (state) {
            if (state.resources.has(resourceType)) {
                state.resources.get(resourceType).status = 'error';
            }
            state.errors.push({ resourceType, error, timestamp: Date.now() });

            eventBus.emit('loading:state:changed', {
                instanceId,
                state: this.getLoadingState(instanceId)
            });

            eventBus.emit('loading:error', {
                instanceId,
                error,
                resourceType
            });
        }

        console.error(`[LoadingManager] Erro no loading de ${resourceType} para ${instanceId}:`, error);
    }

    getLoadingState(instanceId) {
        const state = this.loadingStates.get(instanceId);
        if (!state) return null;

        const resources = Array.from(state.resources.entries());
        const completed = resources.filter(([_, r]) => r.status === 'completed').length;
        const total = resources.length;
        const overallProgress = total > 0 ? Math.round((completed / total) * 100) : 0;

        return {
            isLoading: state.isLoading,
            progress: Math.max(state.progress, overallProgress),
            currentMessage: state.currentMessage || this.generateProgressMessage(resources),
            resources: Object.fromEntries(state.resources),
            errors: state.errors,
            startTime: state.startTime
        };
    }

    getLoadingStats(instanceId) {
        const state = this.loadingStates.get(instanceId);
        if (!state) return null;

        return {
            totalResources: state.resources.size,
            totalLoadTime: state.totalLoadTime,
            errors: state.errors.length,
            resourceBreakdown: Object.fromEntries(
                Array.from(state.resources.entries()).map(([type, resource]) => [
                    type,
                    {
                        loadTime: resource.loadTime || 0,
                        status: resource.status
                    }
                ])
            )
        };
    }

    generateProgressMessage(resources) {
        const loading = resources.find(([_, r]) => r.status === 'loading');
        if (loading) {
            const [type] = loading;
            switch (type) {
                case 'html': return 'Carregando interface...';
                case 'css': return 'Carregando estilos...';
                case 'js': return 'Carregando funcionalidades...';
                case 'fonts': return 'Carregando fontes...';
                case 'icons': return 'Carregando ícones...';
                case 'images': return 'Carregando imagens...';
                default: return `Carregando ${type}...`;
            }
        }
        return 'Finalizando...';
    }

    clearInstance(instanceId) { this.loadingStates.delete(instanceId); }

    // Método para pré-carregar recursos
    async preloadResource(url, type = 'generic') {
        if (this.resourceCache.has(url)) {
            return this.resourceCache.get(url);
        }

        if (this.loadingQueue.has(url)) {
            return this.loadingQueue.get(url);
        }

        const loadPromise = this._loadResource(url, type);
        this.loadingQueue.set(url, loadPromise);

        try {
            const resource = await loadPromise;
            this.resourceCache.set(url, resource);
            this.loadingQueue.delete(url);
            return resource;
        } catch (error) {
            this.loadingQueue.delete(url);
            throw error;
        }
    }

    async _loadResource(url, type) {
        switch (type) {
            case 'html':
            case 'css':
            case 'text':
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return await response.text();
            
            case 'json':
                const jsonResponse = await fetch(url);
                if (!jsonResponse.ok) {
                    throw new Error(`HTTP ${jsonResponse.status}: ${jsonResponse.statusText}`);
                }
                return await jsonResponse.json();
            
            case 'image':
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
                    img.src = url;
                });
            
            case 'font':
                if ('fonts' in document) {
                    const font = new FontFace('CustomFont', `url(${url})`);
                    await font.load();
                    document.fonts.add(font);
                    return font;
                }
                return null;
            
            default:
                const genericResponse = await fetch(url);
                if (!genericResponse.ok) {
                    throw new Error(`HTTP ${genericResponse.status}: ${genericResponse.statusText}`);
                }
                return await genericResponse.blob();
        }
    }

    // Limpa cache de recursos
    clearCache() {
        this.resourceCache.clear();
        this.loadingQueue.clear();
        console.log('[LoadingManager] Cache de recursos limpo');
    }

    // Obtém estatísticas do cache
    getCacheStats() {
        return {
            cachedResources: this.resourceCache.size,
            pendingLoads: this.loadingQueue.size,
            memoryEstimate: this._estimateCacheSize()
        };
    }

    _estimateCacheSize() {
        let totalSize = 0;
        for (const [url, resource] of this.resourceCache.entries()) {
            if (typeof resource === 'string') {
                totalSize += resource.length * 2; // UTF-16
            } else if (resource instanceof Blob) {
                totalSize += resource.size;
            }
        }
        return totalSize;
    }
}

// Instância global
export const loadingManager = new LoadingManager();
