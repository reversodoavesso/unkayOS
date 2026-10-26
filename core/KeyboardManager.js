/**
 * KeyboardManager - Gerencia eventos de teclado para garantir que apenas a janela ativa os receba
 * 
 * Este sistema intercepta todos os eventos de teclado e os direciona apenas para a aplicação
 * que está atualmente em primeiro plano (focada).
 */

import eventBus from './eventBus.js';

class KeyboardManager {
    constructor() {
        this.activeInstanceId = null;
        this.keyboardListeners = new Map(); // instanceId -> listeners array
        this.init();
    }

    init() {
        // Escuta mudanças de foco das janelas
        eventBus.on('window:focus', ({ instanceId }) => {
            this.setActiveInstance(instanceId);
        });

        eventBus.on('app:closed', ({ instanceId }) => {
            this.removeAppListeners(instanceId);
        });

        // Intercepta todos os eventos de teclado no documento
        document.addEventListener('keydown', (e) => this.handleGlobalKeydown(e), true);
        document.addEventListener('keyup', (e) => this.handleGlobalKeyup(e), true);
    }

    /**
     * Define qual instância de app está ativa
     */
    setActiveInstance(instanceId) {
        // Remove marcação da instância anterior
        if (this.activeInstanceId) {
            const prevElement = document.querySelector(`[data-instance-id="${this.activeInstanceId}"]`);
            if (prevElement) {
                prevElement.removeAttribute('data-keyboard-active');
            }
        }

        this.activeInstanceId = instanceId;
        
        // Marca a nova instância ativa
        if (instanceId) {
            const element = document.querySelector(`[data-instance-id="${instanceId}"]`);
            if (element) {
                element.setAttribute('data-keyboard-active', 'true');
            }
        }
        
        console.log(`[KeyboardManager] Foco ativo: ${instanceId}`);
    }

    /**
     * Registra listeners de teclado para uma instância específica
     */
    registerKeyboardListener(instanceId, eventType, listener, options = {}) {
        if (!this.keyboardListeners.has(instanceId)) {
            this.keyboardListeners.set(instanceId, []);
        }

        const listenerData = {
            eventType,
            listener,
            options
        };

        this.keyboardListeners.get(instanceId).push(listenerData);
        
        console.log(`[KeyboardManager] Registrado listener ${eventType} para ${instanceId}`);
    }

    /**
     * Remove todos os listeners de uma instância
     */
    removeAppListeners(instanceId) {
        if (this.keyboardListeners.has(instanceId)) {
            this.keyboardListeners.delete(instanceId);
            console.log(`[KeyboardManager] Removidos listeners para ${instanceId}`);
        }

        // Se a instância removida era a ativa, limpa o foco
        if (this.activeInstanceId === instanceId) {
            this.activeInstanceId = null;
        }
    }

    /**
     * Manipula eventos keydown globais
     */
    handleGlobalKeydown(event) {
        if (event.target instanceof Element && event.target.closest('dialog[open]')) return;
        if (event.ctrlKey && event.code === 'Space') return;
        // Permite que eventos dentro de inputs/textareas sempre passem
        if (this.isInputElement(event.target)) {
            return;
        }

        // Se não há instância ativa, bloqueia todos os eventos
        if (!this.activeInstanceId) {
            return;
        }

        // Verifica se o evento vem de uma janela que não é a ativa
        const eventInstanceId = this.getInstanceIdFromTarget(event.target);
        
        // Se o evento vem de uma instância diferente da ativa, bloqueia
        if (eventInstanceId && eventInstanceId !== this.activeInstanceId) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }

        // Direciona o evento para os listeners da instância ativa
        this.dispatchToActiveInstance('keydown', event);
    }

    /**
     * Manipula eventos keyup globais
     */
    handleGlobalKeyup(event) {
        if (event.target instanceof Element && event.target.closest('dialog[open]')) return;
        // Permite que eventos dentro de inputs/textareas sempre passem
        if (this.isInputElement(event.target)) {
            return;
        }

        if (!this.activeInstanceId) {
            return;
        }

        const eventInstanceId = this.getInstanceIdFromTarget(event.target);
        
        if (eventInstanceId && eventInstanceId !== this.activeInstanceId) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }

        this.dispatchToActiveInstance('keyup', event);
    }

    /**
     * Despacha evento para a instância ativa
     */
    dispatchToActiveInstance(eventType, event) {
        const listeners = this.keyboardListeners.get(this.activeInstanceId);
        
        if (!listeners) return;

        listeners.forEach(({ eventType: listenerType, listener, options }) => {
            if (listenerType === eventType) {
                try {
                    // Chama o listener com o contexto apropriado
                    listener(event);
                } catch (error) {
                    console.error(`[KeyboardManager] Erro no listener ${eventType}:`, error);
                }
            }
        });
    }

    /**
     * Verifica se o elemento é um input que deve sempre receber eventos
     */
    isInputElement(element) {
        const inputTags = ['INPUT', 'TEXTAREA', 'SELECT'];
        return inputTags.includes(element.tagName) || element.contentEditable === 'true';
    }

    /**
     * Obtém o instanceId a partir do elemento target
     */
    getInstanceIdFromTarget(element) {
        // Procura pelo elemento .app mais próximo
        let current = element;
        while (current && current !== document.body) {
            if (current.classList && current.classList.contains('app')) {
                return current.dataset.instanceId || current.id;
            }
            // Também verifica desktop-app
            if (current.classList && current.classList.contains('desktop-app')) {
                return current.dataset.instanceId || current.id;
            }
            current = current.parentElement;
        }
        return null;
    }

    /**
     * Método utilitário para apps registrarem atalhos facilmente
     */
    registerShortcut(instanceId, keys, callback, options = {}) {
        const listener = (event) => {
            if (this.matchesShortcut(event, keys)) {
                if (options.preventDefault !== false) {
                    event.preventDefault();
                }
                if (options.stopPropagation !== false) {
                    event.stopPropagation();
                }
                callback(event);
            }
        };

        this.registerKeyboardListener(instanceId, 'keydown', listener, options);
    }

    /**
     * Verifica se o evento corresponde ao atalho
     */
    matchesShortcut(event, keys) {
        if (typeof keys === 'string') {
            keys = [keys];
        }

        return keys.some(keyCombo => {
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
    }

    /**
     * Obtém a instância atualmente ativa
     */
    getActiveInstance() {
        return this.activeInstanceId;
    }

    /**
     * Verifica se uma instância específica está ativa
     */
    isInstanceActive(instanceId) {
        return this.activeInstanceId === instanceId;
    }
}

// Instância singleton
export const keyboardManager = new KeyboardManager();
