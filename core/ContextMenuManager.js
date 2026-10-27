// core/ContextMenuManager.js - unkayOS 2.0 Hierarchical Context Resolution & Context Menu System
// Architecture inspired by daedalOS, Puter, OS.js, GNOME (GTK4/Libadwaita) & KDE Plasma

import eventBus from './eventBus.js';
import { windowLayerManager } from './WindowLayerManager.js';
import { fullscreenManager } from './FullscreenManager.js';
import { iconMarkup } from './ui/designSystem.js';
import { getWorkspace } from './workspace/WorkspaceSession.js';
import { DEFAULT_SHELL } from './workspace/preferences.js';
import { applyAppearance, applyWindowing } from './utils/appPreferences.js';

export class ContextMenuManager {
    constructor() {
        this.desktopElement = null;
        this.menuElement = null;
        this.activeContext = null;
        this.isOpen = false;
        this.appProviders = new Map(); // instanceId -> Array<{ selector, handler }>
        this.globalProviders = new Map(); // providerId -> { priority, match, handler }
        this._internalClipboard = '';

        this._boundContextMenu = this.handleGlobalContextMenu.bind(this);
        this._boundPointerDown = this.handleOutsidePointerDown.bind(this);
        this._boundKeyDown = this.handleMenuKeyDown.bind(this);
        this._boundClose = () => this.close();
        this._boundOpenFromKeyboard = ({ target }) => this.openForElement(target);
    }

    /**
     * Inicializa o gerenciador global de menus de contexto
     * @param {HTMLElement} [desktopElement]
     */
    initialize(desktopElement = typeof document !== 'undefined' ? document.getElementById('desktop') : null) {
        this.desktopElement = desktopElement || (typeof document !== 'undefined' ? document.body : null);
        if (typeof document === 'undefined') return;

        document.removeEventListener('contextmenu', this._boundContextMenu, true);
        document.removeEventListener('pointerdown', this._boundPointerDown, true);
        document.removeEventListener('keydown', this._boundKeyDown, true);
        window.removeEventListener('resize', this._boundClose);
        window.removeEventListener('blur', this._boundClose);

        document.addEventListener('contextmenu', this._boundContextMenu, true);
        document.addEventListener('pointerdown', this._boundPointerDown, true);
        document.addEventListener('keydown', this._boundKeyDown, true);
        window.addEventListener('resize', this._boundClose);
        window.addEventListener('blur', this._boundClose);

        eventBus.off('app:stopped', this._onAppStopped);
        eventBus.off('app:closed', this._onAppStopped);
        eventBus.off('menu:apps:toggle', this._boundClose);
        eventBus.off('contextmenu:close', this._boundClose);
        eventBus.off('contextmenu:open-from-keyboard', this._boundOpenFromKeyboard);

        this._onAppStopped = ({ instanceId }) => {
            this.removeAppProviders(instanceId);
            if (this.activeContext?.instanceId === instanceId) {
                this.close();
            }
        };

        eventBus.on('app:stopped', this._onAppStopped);
        eventBus.on('app:closed', this._onAppStopped);
        eventBus.on('menu:apps:toggle', this._boundClose);
        eventBus.on('contextmenu:close', this._boundClose);
        eventBus.on('contextmenu:open-from-keyboard', this._boundOpenFromKeyboard);
    }

    /**
     * Registra um provedor de menu de contexto para uma instância de aplicativo
     * @param {string} instanceId
     * @param {function|string} selectorOrBuilder - Seletor CSS opcional ou função `(context) => items`
     * @param {function} [builder] - Função `(context) => items` quando seletor é informado
     * @returns {function} Função de desregistro
     */
    registerAppProvider(instanceId, selectorOrBuilder, builder = null) {
        if (!instanceId) return () => {};
        const selector = typeof selectorOrBuilder === 'string' ? selectorOrBuilder : null;
        const handler = typeof selectorOrBuilder === 'function' ? selectorOrBuilder : builder;
        if (typeof handler !== 'function') return () => {};

        if (!this.appProviders.has(instanceId)) {
            this.appProviders.set(instanceId, []);
        }
        const entry = { selector, handler };
        this.appProviders.get(instanceId).push(entry);

        return () => {
            const list = this.appProviders.get(instanceId);
            if (!list) return;
            const idx = list.indexOf(entry);
            if (idx !== -1) list.splice(idx, 1);
        };
    }

    /**
     * Remove todos os provedores registrados por uma instância de app
     * @param {string} instanceId
     */
    removeAppProviders(instanceId) {
        this.appProviders.delete(instanceId);
    }

    /**
     * Registra um provedor global customizado
     * @param {string} id
     * @param {{ priority?: number, match: (context: object) => boolean, build: (context: object) => Array }} provider
     */
    registerGlobalProvider(id, provider) {
        if (!id || !provider || typeof provider.build !== 'function') return;
        this.globalProviders.set(id, {
            priority: provider.priority ?? 50,
            match: provider.match || (() => true),
            build: provider.build
        });
    }

    /**
     * Inspeciona o alvo do clique e resolve o descritor semântico de contexto
     * @param {Element|EventTarget} rawTarget
     * @param {number} [clientX=0]
     * @param {number} [clientY=0]
     * @param {Event} [originalEvent=null]
     * @returns {object} ContextDescriptor
     */
    resolveContext(rawTarget, clientX = 0, clientY = 0, originalEvent = null) {
        const target =
            rawTarget instanceof Element
                ? rawTarget
                : rawTarget && /** @type {Node} */ (rawTarget).parentElement
                  ? /** @type {Node} */ (rawTarget).parentElement
                  : typeof document !== 'undefined'
                    ? document.body
                    : null;

        const selectionText =
            typeof window !== 'undefined' && typeof window.getSelection === 'function'
                ? String(window.getSelection()?.toString() || '').trim()
                : '';

        const editableElement = target?.closest?.(
            'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="color"]), textarea, [contenteditable="true"]'
        ) || null;

        const windowEl = target?.closest?.('.app[data-app-type="system_window"]') || null;
        const instanceId =
            windowEl?.dataset?.instanceId ||
            windowEl?.id ||
            target?.closest?.('[data-instance-id]')?.dataset?.instanceId ||
            null;

        const appManager = typeof window !== 'undefined' ? window.appManager : null;
        const runningApp = instanceId ? appManager?.runningApps?.get(instanceId) : null;

        let appId =
            windowEl?.dataset?.appId ||
            runningApp?.CORE?.id ||
            target?.closest?.('[data-app-id]')?.dataset?.appId ||
            target?.closest?.('[data-app]')?.dataset?.app ||
            null;

        const widgetEl = target?.closest?.('.workspace-widget') || null;
        const widgetId = widgetEl?.dataset?.widgetId || null;

        let zone = 'desktop';

        if (editableElement) {
            zone = 'editable';
        } else if (target?.closest?.('.app__top_bar') && windowEl) {
            zone = 'window-titlebar';
        } else if (target?.closest?.('.taskbar__apps_on__app_icon')) {
            const btn = target.closest('.taskbar__apps_on__app_icon');
            const btnInstanceId = btn?.dataset?.instanceId || instanceId;
            const btnApp = btnInstanceId ? appManager?.runningApps?.get(btnInstanceId) : null;
            zone = 'taskbar-running-app';
            appId = btnApp?.CORE?.id || appId;
        } else if (target?.closest?.('.taskbar__pin')) {
            const pinBtn = target.closest('.taskbar__pin');
            appId = pinBtn?.dataset?.appId || appId;
            zone = 'taskbar-pinned-app';
        } else if (target?.closest?.('.taskbar__start_menu')) {
            zone = 'taskbar-launcher';
        } else if (target?.closest?.('.taskbar')) {
            zone = 'taskbar-bar';
        } else if (widgetEl) {
            zone = 'widget';
        } else if (target?.closest?.('.launcher-tile')) {
            const tile = target.closest('.launcher-tile');
            const launchBtn = tile?.querySelector?.('[data-app]');
            appId = launchBtn?.dataset?.app || appId;
            zone = 'launcher-app-card';
        } else if (windowEl) {
            zone = 'window-body';
        } else {
            zone = 'desktop';
        }

        return {
            target,
            clientX,
            clientY,
            zone,
            instanceId,
            appId,
            widgetId,
            selectionText,
            editableElement,
            windowElement: windowEl,
            originalEvent
        };
    }

    /**
     * Constrói a lista de ações contextuais para o ContextDescriptor resolvido
     * @param {object} context
     * @returns {Array<object>}
     */
    buildMenuItems(context) {
        if (!context) return [];

        // 0. Provedores globais de alta prioridade
        const sortedGlobal = [...this.globalProviders.values()].sort((a, b) => b.priority - a.priority);
        for (const provider of sortedGlobal) {
            if (provider.match(context)) {
                const customItems = provider.build(context);
                if (Array.isArray(customItems) && customItems.length > 0) {
                    return customItems;
                }
            }
        }

        // 1. Barra de título da janela sempre exibe o menu de gerenciamento da janela (WM)
        if (context.zone === 'window-titlebar') {
            return this._buildWindowMenu(context, true);
        }

        // 2. Provedor com seletor específico registrado pela instância do aplicativo
        if (context.instanceId && this.appProviders.has(context.instanceId)) {
            const providers = this.appProviders.get(context.instanceId) || [];
            for (let i = providers.length - 1; i >= 0; i--) {
                const { selector, handler } = providers[i];
                if (!selector) continue;
                const matchedEl = context.target?.closest?.(selector);
                if (!matchedEl) continue;
                const items = handler({ ...context, matchedElement: matchedEl });
                if (Array.isArray(items) && items.length > 0) return items;
            }
        }

        // 3. Se clicou em um campo de texto editável (input / textarea / contenteditable)
        if (context.zone === 'editable' && context.editableElement) {
            return this._buildEditableMenu(context);
        }

        // 4. Provedor geral (sem seletor) registrado pela instância do aplicativo
        if (context.instanceId && this.appProviders.has(context.instanceId)) {
            const providers = this.appProviders.get(context.instanceId) || [];
            for (let i = providers.length - 1; i >= 0; i--) {
                const { selector, handler } = providers[i];
                if (selector) continue;
                const items = handler(context);
                if (Array.isArray(items) && items.length > 0) return items;
            }
        }

        // 5. Zonas nativas do sistema operacional
        switch (context.zone) {
            case 'window-body':
                return this._buildWindowMenu(context, false);
            case 'taskbar-running-app':
                return this._buildTaskbarRunningAppMenu(context);
            case 'taskbar-pinned-app':
                return this._buildTaskbarPinnedAppMenu(context);
            case 'taskbar-launcher':
                return this._buildTaskbarLauncherMenu(context);
            case 'taskbar-bar':
                return this._buildTaskbarBarMenu(context);
            case 'widget':
                return this._buildWidgetMenu(context);
            case 'launcher-app-card':
                return this._buildLauncherCardMenu(context);
            case 'desktop':
            default:
                return this._buildDesktopMenu(context);
        }
    }

    /**
     * Manipula o evento contextmenu global
     * @param {MouseEvent} event
     */
    handleGlobalContextMenu(event) {
        if (!(event.target instanceof Element)) return;

        // Se clicou dentro do próprio menu de contexto, apenas previne o menu nativo do browser
        if (event.target.closest('.unkay-context-menu')) {
            event.preventDefault();
            return;
        }

        // Foca a janela caso o clique direito tenha ocorrido dentro de uma system_window
        const windowEl = event.target.closest('.app[data-app-type="system_window"]');
        if (windowEl) {
            const instanceId = windowEl.dataset.instanceId || windowEl.id;
            if (instanceId && typeof window !== 'undefined' && window.appManager?.activeAppInstanceId !== instanceId) {
                eventBus.emit('window:focus', { instanceId });
            }
        }

        const context = this.resolveContext(event.target, event.clientX, event.clientY, event);
        const items = this.buildMenuItems(context);

        if (!items || items.length === 0) return;

        event.preventDefault();
        event.stopPropagation();

        this.open(items, {
            x: event.clientX,
            y: event.clientY,
            context
        });
    }

    /**
     * Abre o menu de contexto via teclado (Shift+F10 / ContextMenu key)
     * @param {Element|null} targetEl
     */
    openForElement(targetEl = null) {
        const activeId = typeof window !== 'undefined' ? window.appManager?.activeAppInstanceId : null;
        const fallbackEl =
            (activeId && typeof document !== 'undefined'
                ? document.querySelector(`[data-instance-id="${activeId}"] .app__top_bar`)
                : null) ||
            this.desktopElement ||
            (typeof document !== 'undefined' ? document.body : null);

        const el =
            targetEl instanceof Element && targetEl !== document.body ? targetEl : fallbackEl;
        if (!el) return;

        const rect = el.getBoundingClientRect?.() || { left: 120, top: 120, width: 0, height: 0 };
        const x = Math.max(16, Math.round(rect.left + Math.min(rect.width / 2, 160)));
        const y = Math.max(16, Math.round(rect.top + Math.min(rect.height / 2, 48)));

        const context = this.resolveContext(el, x, y, null);
        const items = this.buildMenuItems(context);
        if (items.length > 0) {
            this.open(items, { x, y, context });
        }
    }

    /**
     * Renderiza e abre o menu de contexto nas coordenadas especificadas
     * @param {Array<object>} items
     * @param {{ x: number, y: number, context?: object }} options
     */
    open(items, { x = 0, y = 0, context = null } = {}) {
        this.close();
        if (!Array.isArray(items) || items.length === 0 || typeof document === 'undefined') return;

        this.activeContext = context;
        this.isOpen = true;

        const menu = document.createElement('div');
        menu.className = 'unkay-context-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Menu de contexto do sistema');
        menu.dataset.contextZone = context?.zone || 'custom';
        windowLayerManager.setSystemLayer(menu, 'CONTEXT_MENU');

        this._populateMenuItems(menu, items, context);

        // Se o clique ocorreu dentro de um <dialog open> (top-layer), monta dentro dele
        const openDialog = context?.target?.closest?.('dialog[open]');
        const host = openDialog || this.desktopElement || document.body;
        host.appendChild(menu);
        this.menuElement = menu;

        this._positionMenu(menu, x, y);

        // Foca o primeiro item habilitado para navegação por teclado imediata
        const firstButton = menu.querySelector('.unkay-context-menu__item:not(:disabled)');
        if (firstButton instanceof HTMLElement) {
            firstButton.focus({ preventScroll: true });
        }

        eventBus.emit('contextmenu:opened', {
            zone: context?.zone || 'custom',
            x,
            y
        });
    }

    /**
     * Fecha o menu de contexto ativo
     */
    close() {
        if (this.menuElement) {
            this.menuElement.remove();
            this.menuElement = null;
        }
        if (this.isOpen) {
            this.isOpen = false;
            this.activeContext = null;
            eventBus.emit('contextmenu:closed');
        }
    }

    /**
     * Popula elementos DOM do menu
     * @private
     */
    _populateMenuItems(container, items, context) {
        for (const item of items) {
            if (!item) continue;

            if (item.type === 'separator') {
                const sep = document.createElement('div');
                sep.className = 'unkay-context-menu__separator';
                sep.setAttribute('role', 'separator');
                container.appendChild(sep);
                continue;
            }

            if (item.type === 'header') {
                const header = document.createElement('div');
                header.className = 'unkay-context-menu__header';
                if (item.icon) {
                    const iconSpan = document.createElement('span');
                    iconSpan.className = 'unkay-context-menu__header-icon';
                    iconSpan.innerHTML = iconMarkup(item.icon, { size: 14 });
                    header.appendChild(iconSpan);
                }
                const titleSpan = document.createElement('span');
                titleSpan.textContent = item.label || '';
                header.appendChild(titleSpan);
                container.appendChild(header);
                continue;
            }

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'unkay-context-menu__item';
            if (item.danger) btn.classList.add('unkay-context-menu__item--danger');
            if (item.id) btn.dataset.actionId = item.id;
            btn.disabled = Boolean(item.disabled);
            btn.setAttribute('role', typeof item.checked === 'boolean' ? 'menuitemcheckbox' : 'menuitem');
            if (typeof item.checked === 'boolean') {
                btn.setAttribute('aria-checked', String(item.checked));
            }

            const iconWrap = document.createElement('span');
            iconWrap.className = 'unkay-context-menu__icon';
            const iconName =
                typeof item.checked === 'boolean' && item.checked && !item.icon
                    ? 'check'
                    : item.icon || (typeof item.checked === 'boolean' && item.checked ? 'check' : '');
            if (iconName) {
                iconWrap.innerHTML = iconMarkup(iconName, { size: 15 });
            }
            btn.appendChild(iconWrap);

            const labelSpan = document.createElement('span');
            labelSpan.className = 'unkay-context-menu__label';
            labelSpan.textContent = item.label || '';
            btn.appendChild(labelSpan);

            if (typeof item.checked === 'boolean' && item.checked) {
                const checkBadge = document.createElement('span');
                checkBadge.className = 'unkay-context-menu__check';
                checkBadge.innerHTML = iconMarkup('check', { size: 14 });
                btn.appendChild(checkBadge);
            } else if (item.shortcut) {
                const kbd = document.createElement('kbd');
                kbd.className = 'unkay-context-menu__shortcut';
                kbd.textContent = item.shortcut;
                btn.appendChild(kbd);
            }

            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (item.disabled) return;
                const savedContext = context;
                this.close();
                if (typeof item.action === 'function') {
                    try {
                        await item.action(savedContext, e);
                    } catch (err) {
                        console.error(`[ContextMenuManager] Erro ao executar ação '${item.id || item.label}':`, err);
                    }
                }
            });

            container.appendChild(btn);
        }
    }

    /**
     * Posiciona o menu garantindo que nunca ultrapasse as bordas da tela
     * @private
     */
    _positionMenu(menu, x, y) {
        const vw = typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280;
        const vh = typeof window !== 'undefined' ? window.innerHeight || 720 : 720;
        const margin = 8;

        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        const rect = menu.getBoundingClientRect();
        const width = rect.width || 240;
        const height = rect.height || 260;

        let finalX = x;
        let finalY = y;

        if (x + width + margin > vw) {
            finalX = Math.max(margin, x - width);
        }
        if (y + height + margin > vh) {
            finalY = Math.max(margin, y - height);
        }

        finalX = Math.max(margin, Math.min(finalX, vw - width - margin));
        finalY = Math.max(margin, Math.min(finalY, vh - height - margin));

        menu.style.left = `${Math.round(finalX)}px`;
        menu.style.top = `${Math.round(finalY)}px`;
    }

    handleOutsidePointerDown(event) {
        if (!this.isOpen || !this.menuElement) return;
        if (event.target instanceof Node && this.menuElement.contains(event.target)) return;
        this.close();
    }

    handleMenuKeyDown(event) {
        if (!this.isOpen || !this.menuElement) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            this.close();
            return;
        }

        const items = [
            ...this.menuElement.querySelectorAll('.unkay-context-menu__item:not(:disabled)')
        ];
        if (items.length === 0) return;

        const currentIndex = items.indexOf(/** @type {Element} */ (document.activeElement));

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            event.stopPropagation();
            const next = currentIndex === -1 ? 0 : (currentIndex + 1) % items.length;
            /** @type {HTMLElement} */ (items[next]).focus({ preventScroll: true });
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            event.stopPropagation();
            const prev =
                currentIndex <= 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
            /** @type {HTMLElement} */ (items[prev]).focus({ preventScroll: true });
        } else if (event.key === 'Home') {
            event.preventDefault();
            event.stopPropagation();
            /** @type {HTMLElement} */ (items[0]).focus({ preventScroll: true });
        } else if (event.key === 'End') {
            event.preventDefault();
            event.stopPropagation();
            /** @type {HTMLElement} */ (items[items.length - 1]).focus({ preventScroll: true });
        }
    }

    // =========================================================================
    // CONSTRUTORES DE MENUS POR ZONA CONTEXTUAL
    // =========================================================================

    _launchApp(appId, params = {}) {
        const session = getWorkspace();
        if (session && typeof session.launch === 'function') {
            return session.launch(appId, params);
        }
        const appManager = typeof window !== 'undefined' ? window.appManager : null;
        if (appManager && typeof appManager.runApp === 'function') {
            return appManager.runApp(appId, params);
        }
        eventBus.emit('app:start', { appId, params });
    }

    _runAppInstance(appId, params = {}) {
        const appManager = typeof window !== 'undefined' ? window.appManager : null;
        if (appManager && typeof appManager.runApp === 'function') {
            return appManager.runApp(appId, params);
        }
        eventBus.emit('app:start', { appId, params });
    }

    async _copyText(text) {
        if (!text) return;
        this._internalClipboard = text;
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            }
        } catch (_) {
            // Fallback stored in _internalClipboard
        }
    }

    async _readClipboardText() {
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
                const text = await navigator.clipboard.readText();
                if (text) return text;
            }
        } catch (_) {
            // Fallback to internal clipboard
        }
        return this._internalClipboard || '';
    }

    _buildSelectionItems(selectionText) {
        if (!selectionText) return [];
        const preview =
            selectionText.length > 24 ? `${selectionText.slice(0, 24)}…` : selectionText;
        return [
            {
                id: 'selection.copy',
                label: `Copiar "${preview}"`,
                icon: 'copy',
                shortcut: 'Ctrl+C',
                action: () => this._copyText(selectionText)
            },
            {
                id: 'selection.openInEditor',
                label: 'Enviar seleção ao Editor de Texto',
                icon: 'file-text',
                action: () => this._runAppInstance('text-editor', { content: selectionText })
            },
            {
                id: 'selection.searchWeb',
                label: 'Pesquisar no The Orb',
                icon: 'globe',
                action: () =>
                    this._launchApp('theorb', {
                        url: `https://duckduckgo.com/?q=${encodeURIComponent(selectionText)}`
                    })
            },
            { type: 'separator' }
        ];
    }

    _buildEditableMenu(context) {
        const el = /** @type {HTMLInputElement|HTMLTextAreaElement} */ (context.editableElement);
        const isInputOrTextarea = el && ('value' in el);
        const hasSelection =
            isInputOrTextarea &&
            typeof el.selectionStart === 'number' &&
            typeof el.selectionEnd === 'number' &&
            el.selectionEnd > el.selectionStart;
        const selectedValue = hasSelection
            ? el.value.slice(el.selectionStart, el.selectionEnd)
            : context.selectionText || (isInputOrTextarea ? el.value : '');

        return [
            {
                type: 'header',
                label: 'Campo de Texto',
                icon: 'pencil'
            },
            {
                id: 'edit.cut',
                label: 'Recortar',
                icon: 'scissors',
                shortcut: 'Ctrl+X',
                disabled: !selectedValue || el.readOnly || el.disabled,
                action: async () => {
                    await this._copyText(selectedValue);
                    if (isInputOrTextarea && !el.readOnly && !el.disabled) {
                        if (hasSelection) {
                            const start = el.selectionStart;
                            el.setRangeText('', start, el.selectionEnd, 'end');
                        } else {
                            el.value = '';
                        }
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.focus();
                    }
                }
            },
            {
                id: 'edit.copy',
                label: 'Copiar',
                icon: 'copy',
                shortcut: 'Ctrl+C',
                disabled: !selectedValue,
                action: async () => {
                    await this._copyText(selectedValue);
                    el.focus?.();
                }
            },
            {
                id: 'edit.paste',
                label: 'Colar',
                icon: 'clipboard-paste',
                shortcut: 'Ctrl+V',
                disabled: Boolean(el.readOnly || el.disabled),
                action: async () => {
                    const text = await this._readClipboardText();
                    if (!text || !isInputOrTextarea || el.readOnly || el.disabled) return;
                    const start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
                    const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length;
                    if (typeof el.setRangeText === 'function') {
                        el.setRangeText(text, start, end, 'end');
                    } else {
                        el.value = el.value.slice(0, start) + text + el.value.slice(end);
                    }
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.focus();
                }
            },
            { type: 'separator' },
            {
                id: 'edit.selectAll',
                label: 'Selecionar tudo',
                icon: 'check',
                shortcut: 'Ctrl+A',
                disabled: isInputOrTextarea && !el.value,
                action: () => {
                    el.focus?.();
                    el.select?.();
                }
            },
            {
                id: 'edit.clear',
                label: 'Limpar campo',
                icon: 'brush-cleaning',
                danger: true,
                disabled: Boolean(el.readOnly || el.disabled || (isInputOrTextarea && !el.value)),
                action: () => {
                    if (isInputOrTextarea) {
                        el.value = '';
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.focus();
                    }
                }
            }
        ];
    }

    _buildDesktopMenu(context) {
        const isFs = fullscreenManager.isFullscreen();
        const session = getWorkspace();
        const isLight =
            (session?.settings?.appearance?.theme ||
                (typeof document !== 'undefined' ? document.documentElement.dataset.theme : 'dark')) ===
            'light';
        const widgetsEnabled = session ? session.settings.widgets.enabled !== false : true;
        const selectionItems = this._buildSelectionItems(context.selectionText);

        return [
            ...selectionItems,
            {
                type: 'header',
                label: 'Área de Trabalho · unkayOS',
                icon: 'monitor'
            },
            {
                id: 'desktop.openTerminal',
                label: 'Abrir Terminal aqui',
                icon: 'terminal',
                shortcut: 'Ctrl+Alt+T',
                action: () => this._runAppInstance('terminal', { cwd: '/home/user' })
            },
            {
                id: 'desktop.openFiles',
                label: 'Abrir Gerenciador de Arquivos',
                icon: 'folder-open',
                shortcut: 'Ctrl+Alt+E',
                action: () => this._launchApp('file-manager', { path: '/home/user' })
            },
            {
                id: 'desktop.openLauncher',
                label: 'Menu de Aplicativos',
                icon: 'compass',
                shortcut: 'Ctrl+Espaço',
                action: () => eventBus.emit('menu:apps:toggle')
            },
            { type: 'separator' },
            {
                id: 'desktop.newFolder',
                label: 'Nova Pasta em /home/user',
                icon: 'folder-plus',
                action: async () => {
                    const fsApi = typeof window !== 'undefined' ? window.unkayFileSystem?.fs : null;
                    const wasmVfs = typeof window !== 'undefined' ? window.wasmFileSystem : null;
                    const baseName = 'Nova Pasta';
                    let targetPath = `/home/user/${baseName}`;
                    let counter = 2;
                    while (fsApi?.exists?.(targetPath) && counter < 50) {
                        targetPath = `/home/user/${baseName} ${counter++}`;
                    }
                    try {
                        fsApi?.mkdir?.(targetPath, true);
                        await wasmVfs?.mkdir?.(targetPath, { recursive: true });
                    } catch (_) {}
                    this._launchApp('file-manager', { path: '/home/user' });
                }
            },
            {
                id: 'desktop.newTextFile',
                label: 'Novo Documento de Texto',
                icon: 'file-plus',
                action: () => this._runAppInstance('text-editor')
            },
            { type: 'separator' },
            {
                id: 'desktop.showDesktop',
                label: 'Mostrar / Restaurar Janelas',
                icon: 'panels-top-left',
                shortcut: 'Ctrl+Alt+D',
                action: () => eventBus.emit('desktop:toggle-show')
            },
            {
                id: 'desktop.toggleFullscreen',
                label: isFs ? 'Sair da Tela Cheia' : 'Entrar em Tela Cheia',
                icon: 'maximize-2',
                shortcut: 'F11',
                checked: isFs,
                action: () => fullscreenManager.toggle()
            },
            {
                id: 'desktop.toggleTheme',
                label: isLight ? 'Alternar para Tema Escuro' : 'Alternar para Tema Claro',
                icon: isLight ? 'moon' : 'sun',
                action: async () => {
                    const nextTheme = isLight ? 'dark' : 'light';
                    if (session) {
                        await session.update({ appearance: { theme: nextTheme } });
                    } else {
                        applyAppearance({ theme: nextTheme }, this.desktopElement);
                    }
                }
            },
            {
                id: 'desktop.toggleWidgets',
                label: 'Widgets na Área de Trabalho',
                icon: 'layout-grid',
                checked: widgetsEnabled,
                action: async () => {
                    if (session) {
                        await session.update({ widgets: { enabled: !widgetsEnabled } });
                    }
                }
            },
            { type: 'separator' },
            {
                id: 'desktop.wallpaperSettings',
                label: 'Papel de Parede e Aparência…',
                icon: 'palette',
                action: () => this._launchApp('settings', { panel: 'appearance' })
            },
            {
                id: 'desktop.workspaceSettings',
                label: 'Personalizar Meu Espaço…',
                icon: 'settings',
                shortcut: 'Ctrl+,',
                action: () => this._launchApp('settings', { panel: 'workspace' })
            },
            {
                id: 'desktop.processManager',
                label: 'Gerenciador de Processos',
                icon: 'activity',
                shortcut: 'Ctrl+Shift+Esc',
                action: () => this._launchApp('process-manager')
            },
            {
                id: 'desktop.about',
                label: 'Sobre o unkayOS',
                icon: 'info',
                action: () => this._launchApp('about')
            }
        ];
    }

    _buildWindowMenu(context, isTitlebar = true) {
        const appManager = typeof window !== 'undefined' ? window.appManager : null;
        const appInfo = context.instanceId ? appManager?.runningApps?.get(context.instanceId) : null;
        const appId = context.appId || appInfo?.CORE?.id;
        const appName = appInfo?.CORE?.app_name || 'Janela do Aplicativo';
        const iconName = appInfo?.CORE?.rawData?.icon_name || 'package';
        const isMaximized = Boolean(appInfo?.UI?.isMaximized);
        const isMinimized = Boolean(appInfo?.UI?.isMinimized);
        const snapState = appInfo?.UI?.snapState || 'none';
        const session = getWorkspace();
        const pinned = session?.settings?.shell?.pinned || DEFAULT_SHELL.pinned;
        const isPinned = Boolean(appId && pinned.includes(appId));

        const selectionItems = !isTitlebar ? this._buildSelectionItems(context.selectionText) : [];

        return [
            ...selectionItems,
            {
                type: 'header',
                label: appName,
                icon: iconName
            },
            {
                id: 'window.maximizeOrRestore',
                label: isMaximized || snapState !== 'none' ? 'Restaurar Tamanho' : 'Maximizar Janela',
                icon: 'maximize-2',
                shortcut: 'Alt+F10',
                action: () => {
                    if (!context.instanceId) return;
                    if (isMaximized) {
                        eventBus.emit('window:unmaximize', { instanceId: context.instanceId });
                    } else if (snapState !== 'none') {
                        eventBus.emit('window:snap', { instanceId: context.instanceId, zone: 'none' });
                    } else {
                        eventBus.emit('window:maximize', { instanceId: context.instanceId });
                    }
                }
            },
            {
                id: 'window.minimize',
                label: isMinimized ? 'Restaurar da Barra' : 'Minimizar Janela',
                icon: 'minus',
                shortcut: 'Alt+M',
                action: () => {
                    if (!context.instanceId) return;
                    eventBus.emit(isMinimized ? 'window:restore' : 'window:minimize', {
                        instanceId: context.instanceId
                    });
                }
            },
            {
                id: 'window.snapLeft',
                label: 'Ajustar à Esquerda (50%)',
                icon: 'arrow-left',
                shortcut: 'Alt+←',
                checked: snapState === 'left',
                action: () => {
                    if (context.instanceId) {
                        eventBus.emit('window:snap', {
                            instanceId: context.instanceId,
                            zone: snapState === 'left' ? 'none' : 'left'
                        });
                    }
                }
            },
            {
                id: 'window.snapRight',
                label: 'Ajustar à Direita (50%)',
                icon: 'arrow-right',
                shortcut: 'Alt+→',
                checked: snapState === 'right',
                action: () => {
                    if (context.instanceId) {
                        eventBus.emit('window:snap', {
                            instanceId: context.instanceId,
                            zone: snapState === 'right' ? 'none' : 'right'
                        });
                    }
                }
            },
            {
                id: 'window.center',
                label: 'Centralizar na Tela',
                icon: 'panels-top-left',
                shortcut: 'Alt+C',
                action: () => {
                    if (context.instanceId) {
                        eventBus.emit('window:center', { instanceId: context.instanceId });
                    }
                }
            },
            { type: 'separator' },
            ...(appId
                ? [
                      {
                          id: 'window.newInstance',
                          label: 'Nova Janela deste Aplicativo',
                          icon: 'plus',
                          action: () => this._runAppInstance(appId)
                      },
                      {
                          id: 'window.pinToggle',
                          label: isPinned ? 'Desafixar da Trilha' : 'Fixar na Trilha',
                          icon: 'star',
                          checked: isPinned,
                          action: () => session?.pin?.(appId)
                      }
                  ]
                : []),
            {
                id: 'window.restart',
                label: 'Reiniciar Aplicativo',
                icon: 'refresh-cw',
                action: () => {
                    if (context.instanceId && appManager?.restartApp) {
                        appManager.restartApp(context.instanceId);
                    }
                }
            },
            { type: 'separator' },
            {
                id: 'window.close',
                label: 'Fechar Janela',
                icon: 'x',
                shortcut: 'Alt+F4',
                danger: true,
                action: () => {
                    if (context.instanceId) {
                        eventBus.emit('window:close', { instanceId: context.instanceId });
                    }
                }
            }
        ];
    }

    _buildTaskbarRunningAppMenu(context) {
        const btn = context.target?.closest?.('.taskbar__apps_on__app_icon');
        const instanceId = btn?.dataset?.instanceId || context.instanceId;
        return this._buildWindowMenu({ ...context, instanceId }, true);
    }

    _buildTaskbarPinnedAppMenu(context) {
        const details = typeof window !== 'undefined' ? window.loadedAppDetails : null;
        const appData = context.appId ? details?.get?.(context.appId) : null;
        const appName = appData?.app_name || context.appId || 'Aplicativo Fixado';
        const iconName = appData?.icon_name || 'package';
        const session = getWorkspace();

        return [
            {
                type: 'header',
                label: appName,
                icon: iconName
            },
            {
                id: 'pin.open',
                label: `Abrir ${appName}`,
                icon: 'play',
                action: () => {
                    if (context.appId) this._launchApp(context.appId);
                }
            },
            {
                id: 'pin.newInstance',
                label: 'Abrir Nova Instância',
                icon: 'plus',
                action: () => {
                    if (context.appId) this._runAppInstance(context.appId);
                }
            },
            {
                id: 'pin.unpin',
                label: 'Desafixar da Trilha',
                icon: 'star',
                checked: true,
                action: () => {
                    if (context.appId) session?.pin?.(context.appId);
                }
            },
            { type: 'separator' },
            {
                id: 'pin.configureBar',
                label: 'Configurar Barra de Aplicativos…',
                icon: 'settings',
                action: () => this._launchApp('settings', { panel: 'workspace' })
            }
        ];
    }

    _buildTaskbarLauncherMenu(_context) {
        const isFs = fullscreenManager.isFullscreen();
        return [
            {
                type: 'header',
                label: 'Sistema unkayOS',
                icon: 'compass'
            },
            {
                id: 'launcher.toggle',
                label: 'Abrir Menu de Aplicativos',
                icon: 'compass',
                shortcut: 'Ctrl+Espaço',
                action: () => eventBus.emit('menu:apps:toggle')
            },
            { type: 'separator' },
            {
                id: 'launcher.terminal',
                label: 'Terminal',
                icon: 'terminal',
                shortcut: 'Ctrl+Alt+T',
                action: () => this._launchApp('terminal')
            },
            {
                id: 'launcher.files',
                label: 'Gerenciador de Arquivos',
                icon: 'folder-open',
                shortcut: 'Ctrl+Alt+E',
                action: () => this._launchApp('file-manager')
            },
            {
                id: 'launcher.processManager',
                label: 'Gerenciador de Processos',
                icon: 'activity',
                shortcut: 'Ctrl+Shift+Esc',
                action: () => this._launchApp('process-manager')
            },
            {
                id: 'launcher.settings',
                label: 'Configurações do Sistema',
                icon: 'settings',
                shortcut: 'Ctrl+Alt+I',
                action: () => this._launchApp('settings')
            },
            { type: 'separator' },
            {
                id: 'launcher.fullscreen',
                label: isFs ? 'Sair da Tela Cheia' : 'Entrar em Tela Cheia',
                icon: 'maximize-2',
                shortcut: 'F11',
                checked: isFs,
                action: () => fullscreenManager.toggle()
            },
            {
                id: 'launcher.killAll',
                label: 'Fechar Todas as Janelas',
                icon: 'circle-stop',
                danger: true,
                action: () => eventBus.emit('app:killall')
            }
        ];
    }

    _buildTaskbarBarMenu(_context) {
        const session = getWorkspace();
        const isFs = fullscreenManager.isFullscreen();
        const taskbarTop =
            (session?.settings?.windowing?.taskbarPosition ||
                (typeof document !== 'undefined'
                    ? document.documentElement.dataset.taskbarPosition
                    : 'bottom')) === 'top';
        const autoHide =
            session?.settings?.windowing?.autoHideTaskbar === true ||
            (typeof document !== 'undefined' &&
                document.documentElement.dataset.taskbarAutohide === 'true');
        const edgeBar =
            (session?.settings?.shell?.bar ||
                (typeof document !== 'undefined'
                    ? document.documentElement.dataset.shellBar
                    : 'floating')) === 'edge';
        const showLabels =
            session?.settings?.shell?.showLabels === true ||
            (typeof document !== 'undefined' &&
                document.documentElement.dataset.shellLabels === 'true');

        return [
            {
                type: 'header',
                label: 'Trilha de Aplicativos',
                icon: 'panels-top-left'
            },
            {
                id: 'taskbar.showDesktop',
                label: 'Mostrar Área de Trabalho',
                icon: 'panels-top-left',
                shortcut: 'Ctrl+Alt+D',
                action: () => eventBus.emit('desktop:toggle-show')
            },
            {
                id: 'taskbar.fullscreen',
                label: isFs ? 'Sair da Tela Cheia' : 'Tela Cheia do Navegador',
                icon: 'maximize-2',
                shortcut: 'F11',
                checked: isFs,
                action: () => fullscreenManager.toggle()
            },
            { type: 'separator' },
            {
                id: 'taskbar.togglePosition',
                label: 'Posicionar Barra no Topo',
                icon: 'arrow-up',
                checked: taskbarTop,
                action: async () => {
                    const nextPos = taskbarTop ? 'bottom' : 'top';
                    if (session) {
                        await session.update({ windowing: { taskbarPosition: nextPos } });
                    } else {
                        applyWindowing({ taskbarPosition: nextPos, autoHideTaskbar: autoHide });
                    }
                }
            },
            {
                id: 'taskbar.toggleBarStyle',
                label: 'Barra Alinhada à Borda',
                icon: 'monitor',
                checked: edgeBar,
                action: async () => {
                    const nextBar = edgeBar ? 'floating' : 'edge';
                    if (session) {
                        await session.update({ shell: { bar: nextBar } });
                    } else if (typeof document !== 'undefined') {
                        document.documentElement.dataset.shellBar = nextBar;
                    }
                }
            },
            {
                id: 'taskbar.toggleLabels',
                label: 'Mostrar Nomes na Barra',
                icon: 'list',
                checked: showLabels,
                action: async () => {
                    const nextLabels = !showLabels;
                    if (session) {
                        await session.update({ shell: { showLabels: nextLabels } });
                    } else if (typeof document !== 'undefined') {
                        document.documentElement.dataset.shellLabels = String(nextLabels);
                    }
                }
            },
            {
                id: 'taskbar.toggleAutohide',
                label: 'Ocultar Barra Automaticamente',
                icon: 'eye-off',
                checked: autoHide,
                action: async () => {
                    const nextHide = !autoHide;
                    if (session) {
                        await session.update({ windowing: { autoHideTaskbar: nextHide } });
                    } else {
                        applyWindowing({
                            taskbarPosition: taskbarTop ? 'top' : 'bottom',
                            autoHideTaskbar: nextHide
                        });
                    }
                }
            },
            { type: 'separator' },
            {
                id: 'taskbar.processManager',
                label: 'Gerenciador de Processos',
                icon: 'activity',
                shortcut: 'Ctrl+Shift+Esc',
                action: () => this._launchApp('process-manager')
            },
            {
                id: 'taskbar.settings',
                label: 'Configurações da Barra…',
                icon: 'settings',
                action: () => this._launchApp('settings', { panel: 'windowing' })
            }
        ];
    }

    _buildWidgetMenu(context) {
        const session = getWorkspace();
        const widgetId = context.widgetId;
        const catalogEntry = session?.widgets?.catalog?.().find((w) => w.id === widgetId);
        const title = catalogEntry?.title || widgetId || 'Widget';
        const isStartup = Boolean(
            widgetId && session?.settings?.widgets?.startup?.includes(widgetId)
        );
        const isCustom = catalogEntry && catalogEntry.type !== 'native';

        return [
            {
                type: 'header',
                label: title,
                icon: catalogEntry?.icon || 'layout-grid'
            },
            {
                id: 'widget.hide',
                label: 'Ocultar nesta Sessão',
                icon: 'eye-off',
                action: () => {
                    if (widgetId) session?.widgets?.hide?.(widgetId);
                }
            },
            {
                id: 'widget.toggleStartup',
                label: 'Carregar ao Iniciar o Sistema',
                icon: 'check',
                checked: isStartup,
                action: async () => {
                    if (!widgetId || !session) return;
                    await session.update((settings) => ({
                        widgets: {
                            startup: isStartup
                                ? settings.widgets.startup.filter((id) => id !== widgetId)
                                : [...new Set([...settings.widgets.startup, widgetId])]
                        }
                    }));
                }
            },
            ...(isCustom
                ? [
                      {
                          id: 'widget.removeCustom',
                          label: 'Remover Widget Importado',
                          icon: 'trash-2',
                          danger: true,
                          action: () => {
                              if (widgetId) session?.widgets?.remove?.(widgetId);
                          }
                      }
                  ]
                : []),
            { type: 'separator' },
            {
                id: 'widget.manage',
                label: 'Gerenciar Widgets…',
                icon: 'layout-grid',
                action: () => {
                    eventBus.emit('menu:apps:close');
                    this._launchApp('settings', { panel: 'widgets' });
                }
            }
        ];
    }

    _buildLauncherCardMenu(context) {
        const details = typeof window !== 'undefined' ? window.loadedAppDetails : null;
        const appData = context.appId ? details?.get?.(context.appId) : null;
        const appName = appData?.app_name || context.appId || 'Aplicativo';
        const iconName = appData?.icon_name || 'package';
        const session = getWorkspace();
        const pinned = session?.settings?.shell?.pinned || DEFAULT_SHELL.pinned;
        const isPinned = Boolean(context.appId && pinned.includes(context.appId));

        return [
            {
                type: 'header',
                label: appName,
                icon: iconName
            },
            {
                id: 'launcherCard.open',
                label: `Abrir ${appName}`,
                icon: 'play',
                action: () => {
                    eventBus.emit('menu:apps:close');
                    if (context.appId) this._launchApp(context.appId);
                }
            },
            {
                id: 'launcherCard.newInstance',
                label: 'Abrir Nova Janela',
                icon: 'plus',
                action: () => {
                    eventBus.emit('menu:apps:close');
                    if (context.appId) this._runAppInstance(context.appId);
                }
            },
            {
                id: 'launcherCard.pinToggle',
                label: isPinned ? 'Desafixar da Trilha' : 'Fixar na Trilha',
                icon: 'star',
                checked: isPinned,
                action: async () => {
                    if (context.appId) await session?.pin?.(context.appId);
                }
            }
        ];
    }

    destroy() {
        this.close();
        if (typeof document !== 'undefined') {
            document.removeEventListener('contextmenu', this._boundContextMenu, true);
            document.removeEventListener('pointerdown', this._boundPointerDown, true);
            document.removeEventListener('keydown', this._boundKeyDown, true);
            window.removeEventListener('resize', this._boundClose);
            window.removeEventListener('blur', this._boundClose);
        }
        if (this._onAppStopped) {
            eventBus.off('app:stopped', this._onAppStopped);
            eventBus.off('app:closed', this._onAppStopped);
        }
        eventBus.off('menu:apps:toggle', this._boundClose);
        eventBus.off('contextmenu:close', this._boundClose);
        eventBus.off('contextmenu:open-from-keyboard', this._boundOpenFromKeyboard);
    }

    openCustomMenu(items, options = {}) {
        return this.open(items, options);
    }

    closeMenu() {
        return this.close();
    }

    shutdown() {
        return this.destroy();
    }
}

export const contextMenuManager = new ContextMenuManager();
