/**
 * KeyboardManager - Gerencia atalhos globais do sistema (Compositor Layer) e eventos
 * de teclado por instância de aplicativo (App Layer).
 *
 * Inspirado no KGlobalAccel (KDE Plasma), Mutter Keybindings (GNOME) e daedalOS.
 * Camada 1: System Keybinds (funcionam globalmente no desktop, janelas e shell)
 * Camada 2: Active App Instance Listeners (isolados para a janela em foco)
 */

import eventBus from './eventBus.js';

const KEY_ALIASES = {
    space: [' ', 'space', 'spacebar'],
    ' ': [' ', 'space', 'spacebar'],
    escape: ['escape', 'esc'],
    esc: ['escape', 'esc'],
    enter: ['enter', 'return'],
    comma: [',', 'comma'],
    ',': [',', 'comma'],
    period: ['.', 'period'],
    '.': ['.', 'period'],
    backquote: ['`', 'backquote', 'dead'],
    '`': ['`', 'backquote'],
    arrowleft: ['arrowleft', 'left'],
    left: ['arrowleft', 'left'],
    arrowright: ['arrowright', 'right'],
    right: ['arrowright', 'right'],
    arrowup: ['arrowup', 'up'],
    up: ['arrowup', 'up'],
    arrowdown: ['arrowdown', 'down'],
    down: ['arrowdown', 'down'],
    delete: ['delete', 'del'],
    del: ['delete', 'del'],
    '[': ['[', 'bracketleft'],
    ']': [']', 'bracketright'],
    contextmenu: ['contextmenu']
};

export class KeyboardManager {
    constructor() {
        this.activeInstanceId = null;
        this.keyboardListeners = new Map(); // instanceId -> listeners array
        this.systemShortcuts = new Map(); // shortcutId -> config
        this.enabled = true;
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

        eventBus.on('app:stopped', ({ instanceId }) => {
            this.removeAppListeners(instanceId);
        });

        // Registra os keybinds padrão do sistema operacional
        this.registerDefaultSystemShortcuts();

        if (typeof document !== 'undefined') {
            // Intercepta todos os eventos de teclado no documento (capture phase)
            this._boundKeydown = (e) => this.handleGlobalKeydown(e);
            this._boundKeyup = (e) => this.handleGlobalKeyup(e);
            document.addEventListener('keydown', this._boundKeydown, true);
            document.addEventListener('keyup', this._boundKeyup, true);
        }
    }

    handleGlobalKeyEvent(event) {
        return this.handleGlobalKeydown(event);
    }

    /**
     * Registra os atalhos globais padrão do unkayOS (inspirados em distros Linux GNOME/KDE/COSMIC e Web OSes)
     */
    registerDefaultSystemShortcuts() {
        const launchOrFocus = (appId, params = {}) => {
            const session = typeof window !== 'undefined' ? window.workspaceSession : null;
            if (session && typeof session.launch === 'function') {
                session.launch(appId, params);
                return;
            }
            eventBus.emit('app:start', { appId, params });
        };

        const getFocusedWindowId = () => {
            return (
                this.activeInstanceId ||
                (typeof window !== 'undefined' ? window.appManager?.activeAppInstanceId : null)
            );
        };

        // 1. Shell & Sistema
        this.registerSystemShortcut('system.launcher', {
            keys: ['Ctrl+Space', 'Alt+F1'],
            displayKeys: 'Ctrl + Espaço',
            label: 'Abrir ou fechar Menu de Aplicativos',
            category: 'system',
            allowInInput: true,
            when: () =>
                typeof document === 'undefined' ||
                !document.querySelector('dialog[open]:not(.menu_apps)'),
            callback: () => {
                eventBus.emit('menu:apps:toggle');
            }
        });

        this.registerSystemShortcut('system.fullscreen', {
            keys: ['F11', 'Alt+Enter', 'Ctrl+Shift+F'],
            displayKeys: 'F11 / Alt + Enter',
            label: 'Alternar modo Tela Cheia do navegador',
            category: 'system',
            allowInInput: true,
            callback: () => {
                eventBus.emit('system:fullscreen:toggle');
            }
        });

        this.registerSystemShortcut('system.showDesktop', {
            keys: ['Ctrl+Alt+D'],
            displayKeys: 'Ctrl + Alt + D',
            label: 'Mostrar Área de Trabalho (minimizar / restaurar janelas)',
            category: 'system',
            allowInInput: true,
            callback: () => {
                eventBus.emit('desktop:toggle-show');
            }
        });

        this.registerSystemShortcut('system.contextMenu', {
            keys: ['Shift+F10', 'ContextMenu'],
            displayKeys: 'Shift + F10',
            label: 'Abrir menu de contexto para o elemento ou janela focada',
            category: 'system',
            allowInInput: true,
            callback: (event) => {
                eventBus.emit('contextmenu:open-from-keyboard', {
                    target: event?.target || (typeof document !== 'undefined' ? document.activeElement : null)
                });
            }
        });

        // 2. Gerenciamento de Janelas (Compositor / Window Manager)
        this.registerSystemShortcut('window.close', {
            keys: ['Alt+F4', 'Alt+Q'],
            displayKeys: 'Alt + F4',
            label: 'Fechar janela ativa',
            category: 'window',
            allowInInput: true,
            callback: () => {
                const instanceId = getFocusedWindowId();
                if (instanceId) {
                    eventBus.emit('window:close', { instanceId });
                }
            }
        });

        this.registerSystemShortcut('window.maximize', {
            keys: ['Alt+F10', 'Alt+ArrowUp'],
            displayKeys: 'Alt + F10 / Alt + ↑',
            label: 'Maximizar ou restaurar janela ativa',
            category: 'window',
            allowInInput: false,
            callback: () => {
                const instanceId = getFocusedWindowId();
                if (!instanceId) return;
                const appInfo =
                    typeof window !== 'undefined'
                        ? window.appManager?.runningApps?.get(instanceId)
                        : null;
                if (appInfo?.UI?.isMaximized) {
                    eventBus.emit('window:unmaximize', { instanceId });
                } else {
                    eventBus.emit('window:maximize', { instanceId });
                }
            }
        });

        this.registerSystemShortcut('window.minimize', {
            keys: ['Alt+F9', 'Alt+M', 'Alt+ArrowDown'],
            displayKeys: 'Alt + M / Alt + ↓',
            label: 'Restaurar ou minimizar janela ativa',
            category: 'window',
            allowInInput: false,
            callback: () => {
                const instanceId = getFocusedWindowId();
                if (!instanceId) return;
                const appInfo =
                    typeof window !== 'undefined'
                        ? window.appManager?.runningApps?.get(instanceId)
                        : null;
                if (appInfo?.UI?.isMaximized) {
                    eventBus.emit('window:unmaximize', { instanceId });
                } else if (appInfo?.UI?.snapState && appInfo.UI.snapState !== 'none') {
                    eventBus.emit('window:snap', { instanceId, zone: 'none' });
                } else {
                    eventBus.emit('window:minimize', { instanceId });
                }
            }
        });

        this.registerSystemShortcut('window.snapLeft', {
            keys: ['Alt+ArrowLeft', 'Ctrl+Alt+ArrowLeft'],
            displayKeys: 'Alt + ←',
            label: 'Ajustar janela ativa à metade esquerda (Aero Snap)',
            category: 'window',
            allowInInput: false,
            callback: () => {
                const instanceId = getFocusedWindowId();
                if (instanceId) {
                    eventBus.emit('window:snap', { instanceId, zone: 'left' });
                }
            }
        });

        this.registerSystemShortcut('window.snapRight', {
            keys: ['Alt+ArrowRight', 'Ctrl+Alt+ArrowRight'],
            displayKeys: 'Alt + →',
            label: 'Ajustar janela ativa à metade direita (Aero Snap)',
            category: 'window',
            allowInInput: false,
            callback: () => {
                const instanceId = getFocusedWindowId();
                if (instanceId) {
                    eventBus.emit('window:snap', { instanceId, zone: 'right' });
                }
            }
        });

        this.registerSystemShortcut('window.center', {
            keys: ['Alt+C', 'Ctrl+Alt+C'],
            displayKeys: 'Alt + C',
            label: 'Centralizar janela ativa na tela',
            category: 'window',
            allowInInput: false,
            callback: () => {
                const instanceId = getFocusedWindowId();
                if (instanceId) {
                    eventBus.emit('window:center', { instanceId });
                }
            }
        });

        this.registerSystemShortcut('window.cycleNext', {
            keys: ['Alt+Backquote', 'Alt+]', 'Alt+Tab'],
            displayKeys: 'Alt + ` / Alt + ]',
            label: 'Alternar foco para a próxima janela',
            category: 'window',
            allowInInput: true,
            callback: () => {
                eventBus.emit('window:cycle', { direction: 1 });
            }
        });

        this.registerSystemShortcut('window.cyclePrev', {
            keys: ['Alt+Shift+Backquote', 'Alt+[', 'Alt+Shift+Tab'],
            displayKeys: 'Alt + Shift + ` / Alt + [',
            label: 'Alternar foco para a janela anterior',
            category: 'window',
            allowInInput: true,
            callback: () => {
                eventBus.emit('window:cycle', { direction: -1 });
            }
        });

        // 3. Lançadores Rápidos de Aplicativos (Linux Distro Standard)
        this.registerSystemShortcut('app.terminal', {
            keys: ['Ctrl+Alt+T'],
            displayKeys: 'Ctrl + Alt + T',
            label: 'Abrir Terminal',
            category: 'launch',
            allowInInput: true,
            callback: () => launchOrFocus('terminal')
        });

        this.registerSystemShortcut('app.fileManager', {
            keys: ['Ctrl+Alt+E'],
            displayKeys: 'Ctrl + Alt + E',
            label: 'Abrir Gerenciador de Arquivos',
            category: 'launch',
            allowInInput: true,
            callback: () => launchOrFocus('file-manager')
        });

        this.registerSystemShortcut('app.settings', {
            keys: ['Ctrl+Alt+I', 'Ctrl+Comma'],
            displayKeys: 'Ctrl + , / Ctrl + Alt + I',
            label: 'Abrir Configurações do Sistema',
            category: 'launch',
            allowInInput: true,
            callback: () => launchOrFocus('settings')
        });

        this.registerSystemShortcut('app.processManager', {
            keys: ['Ctrl+Shift+Escape'],
            displayKeys: 'Ctrl + Shift + Esc',
            label: 'Abrir Gerenciador de Processos',
            category: 'launch',
            allowInInput: true,
            callback: () => launchOrFocus('process-manager')
        });

        this.registerSystemShortcut('app.browser', {
            keys: ['Ctrl+Alt+B'],
            displayKeys: 'Ctrl + Alt + B',
            label: 'Abrir Navegador The Orb',
            category: 'launch',
            allowInInput: true,
            callback: () => launchOrFocus('theorb')
        });
    }

    /**
     * Registra um atalho global de sistema (Camada 1)
     * @param {string} id - Identificador único (ex: 'system.fullscreen')
     * @param {object} config - Configuração do atalho
     */
    registerSystemShortcut(id, config) {
        if (!id || !config || typeof config.callback !== 'function') return;
        const keys = Array.isArray(config.keys) ? config.keys : [config.keys];
        this.systemShortcuts.set(id, {
            id,
            keys,
            displayKeys: config.displayKeys || keys.join(' / '),
            label: config.label || id,
            category: config.category || 'system',
            allowInInput: config.allowInInput !== false,
            when: typeof config.when === 'function' ? config.when : null,
            callback: config.callback,
            preventDefault: config.preventDefault !== false,
            stopPropagation: config.stopPropagation !== false
        });
    }

    /**
     * Remove um atalho global de sistema
     * @param {string} id
     */
    unregisterSystemShortcut(id) {
        this.systemShortcuts.delete(id);
    }

    /**
     * Retorna a lista de todos os atalhos de sistema registrados
     * @returns {Array<object>}
     */
    getSystemShortcuts() {
        return Array.from(this.systemShortcuts.values()).map((item) => ({
            id: item.id,
            keys: [...item.keys],
            displayKeys: item.displayKeys,
            label: item.label,
            category: item.category
        }));
    }

    /**
     * Define qual instância de app está ativa
     */
    setActiveInstance(instanceId) {
        if (this.activeInstanceId && typeof document !== 'undefined') {
            const prevElement = document.querySelector(`[data-instance-id="${this.activeInstanceId}"]`);
            if (prevElement) {
                prevElement.removeAttribute('data-keyboard-active');
            }
        }

        this.activeInstanceId = instanceId;

        if (instanceId && typeof document !== 'undefined') {
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

        if (this.activeInstanceId === instanceId) {
            this.activeInstanceId = null;
        }
    }

    /**
     * Executa verificação de atalhos de sistema (Camada 1)
     * @param {KeyboardEvent} event
     * @returns {boolean} true se um atalho de sistema capturou o evento
     */
    handleSystemShortcuts(event) {
        if (!this.enabled) return false;
        if (typeof document !== 'undefined' && document.documentElement?.dataset?.systemKeybinds === 'false') {
            return false;
        }

        const inInput = this.isInputElement(event.target);

        for (const shortcut of this.systemShortcuts.values()) {
            if (inInput && !shortcut.allowInInput) {
                continue;
            }
            if (shortcut.when && !shortcut.when(event)) {
                continue;
            }
            if (this.matchesShortcut(event, shortcut.keys)) {
                if (shortcut.preventDefault) {
                    event.preventDefault();
                }
                if (shortcut.stopPropagation) {
                    event.stopPropagation();
                }
                try {
                    shortcut.callback(event);
                    eventBus.emit('keyboard:system-shortcut', { id: shortcut.id });
                } catch (err) {
                    console.error(`[KeyboardManager] Erro ao executar atalho de sistema '${shortcut.id}':`, err);
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Manipula eventos keydown globais
     */
    handleGlobalKeydown(event) {
        // Camada 1: Avalia keybinds globais do sistema antes do filtro de janelas
        if (this.handleSystemShortcuts(event)) {
            return;
        }

        if (event.target instanceof Element && event.target.closest('dialog[open]')) return;

        // Se o foco está em um input/textarea, permite que atalhos com Ctrl/Alt/Meta ou F-keys
        // registrados pelo app ativo (ex: Ctrl+S no editor de texto) ainda funcionem,
        // mas deixa digitação normal passar livremente.
        if (this.isInputElement(event.target)) {
            const hasCommandModifier = event.ctrlKey || event.metaKey || event.altKey || /^F\d+$/.test(event.key);
            if (!hasCommandModifier) {
                return;
            }
        }

        // Se não há instância ativa, encerra
        if (!this.activeInstanceId) {
            return;
        }

        // Verifica se o evento vem de uma janela que não é a ativa
        const eventInstanceId = this.getInstanceIdFromTarget(event.target);

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

        listeners.forEach(({ eventType: listenerType, listener }) => {
            if (listenerType === eventType) {
                try {
                    listener(event);
                } catch (error) {
                    console.error(`[KeyboardManager] Erro no listener ${eventType}:`, error);
                }
            }
        });
    }

    /**
     * Verifica se o elemento é um input que deve sempre receber digitação
     */
    isInputElement(element) {
        if (!element || typeof element !== 'object') return false;
        const inputTags = ['INPUT', 'TEXTAREA', 'SELECT'];
        return (
            inputTags.includes(element.tagName) ||
            element.contentEditable === 'true' ||
            element.isContentEditable === true
        );
    }

    /**
     * Obtém o instanceId a partir do elemento target
     */
    getInstanceIdFromTarget(element) {
        let current = element;
        while (current && current !== document.body) {
            if (current.classList && current.classList.contains('app')) {
                return current.dataset.instanceId || current.id;
            }
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
     * Verifica se o evento corresponde ao atalho (suporta tanto event.key quanto event.code)
     */
    matchesShortcut(event, keys) {
        if (!event) return false;
        if (typeof keys === 'string') {
            keys = [keys];
        }
        if (!Array.isArray(keys)) return false;

        const eventKey = String(event.key || '').toLowerCase();
        const eventCode = String(event.code || '').toLowerCase();

        return keys.some((keyCombo) => {
            if (!keyCombo || typeof keyCombo !== 'string') return false;
            const parts = keyCombo
                .toLowerCase()
                .split('+')
                .map((p) => p.trim())
                .filter(Boolean);
            const targetKey = parts.pop();
            if (!targetKey) return false;

            const needsCtrl = parts.includes('ctrl') || parts.includes('control');
            const needsShift = parts.includes('shift');
            const needsAlt = parts.includes('alt');
            const needsMeta = parts.includes('meta') || parts.includes('super') || parts.includes('cmd');

            if (
                Boolean(event.ctrlKey) !== needsCtrl ||
                Boolean(event.shiftKey) !== needsShift ||
                Boolean(event.altKey) !== needsAlt ||
                Boolean(event.metaKey) !== needsMeta
            ) {
                return false;
            }

            const candidates = KEY_ALIASES[targetKey] || [targetKey, `key${targetKey}`, `digit${targetKey}`];
            return candidates.includes(eventKey) || candidates.includes(eventCode);
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
