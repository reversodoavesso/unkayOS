// core/FullscreenManager.js - unkayOS 2.0 Browser Fullscreen & Keyboard Lock Manager
// Integrates W3C Fullscreen API + Keyboard Lock API (inspired by daedalOS & Linux Web Desktops)

import eventBus from './eventBus.js';

export class FullscreenManager {
    constructor() {
        this._fallbackFullscreen = false;
        this._boundOnChange = this._handleFullscreenChange.bind(this);
        this._boundToggle = () => {
            this.toggle().catch(() => {});
        };
        this._boundEnter = () => {
            this.enter().catch(() => {});
        };
        this._boundExit = () => {
            this.exit().catch(() => {});
        };
        this.init();
    }

    init() {
        if (typeof document === 'undefined') return;

        document.removeEventListener('fullscreenchange', this._boundOnChange);
        document.removeEventListener('webkitfullscreenchange', this._boundOnChange);
        eventBus.off('system:fullscreen:toggle', this._boundToggle);
        eventBus.off('system:fullscreen:enter', this._boundEnter);
        eventBus.off('system:fullscreen:exit', this._boundExit);

        document.addEventListener('fullscreenchange', this._boundOnChange);
        document.addEventListener('webkitfullscreenchange', this._boundOnChange);

        eventBus.on('system:fullscreen:toggle', this._boundToggle);
        eventBus.on('system:fullscreen:enter', this._boundEnter);
        eventBus.on('system:fullscreen:exit', this._boundExit);

        this._syncState(this.isFullscreen(), false);
    }

    initialize() {
        return this.init();
    }

    /**
     * Checks if the Browser Fullscreen API is supported in the current environment
     * @returns {boolean}
     */
    isSupported() {
        if (typeof document === 'undefined') return false;
        const root = document.documentElement;
        return Boolean(
            document.fullscreenEnabled ||
                document.webkitFullscreenEnabled ||
                typeof root?.requestFullscreen === 'function' ||
                typeof root?.webkitRequestFullscreen === 'function'
        );
    }

    /**
     * Checks if the browser is currently in fullscreen mode
     * @returns {boolean}
     */
    isFullscreen() {
        if (typeof document === 'undefined') return false;
        return Boolean(
            document.fullscreenElement ||
                document.webkitFullscreenElement ||
                this._fallbackFullscreen
        );
    }

    /**
     * Enters browser fullscreen mode on the target element (defaults to documentElement)
     * @param {HTMLElement} [target]
     * @returns {Promise<boolean>}
     */
    async enter(target = typeof document !== 'undefined' ? document.documentElement : null) {
        if (!target) return false;
        if (this.isFullscreen()) return true;

        try {
            if (typeof target.requestFullscreen === 'function') {
                await target.requestFullscreen({ navigationUI: 'hide' });
            } else if (typeof target.webkitRequestFullscreen === 'function') {
                await target.webkitRequestFullscreen();
            }
            this._fallbackFullscreen = true;
            await this._engageKeyboardLock();
            this._syncState(true, true);
            return true;
        } catch (error) {
            console.warn('[FullscreenManager] Não foi possível ativar tela cheia nativa:', error);
            return false;
        }
    }

    /**
     * Exits browser fullscreen mode
     * @returns {Promise<boolean>}
     */
    async exit() {
        if (typeof document === 'undefined') return false;
        if (!this.isFullscreen()) return false;

        try {
            this._releaseKeyboardLock();
            this._fallbackFullscreen = false;
            if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
                await document.exitFullscreen();
            } else if (
                document.webkitFullscreenElement &&
                typeof document.webkitExitFullscreen === 'function'
            ) {
                await document.webkitExitFullscreen();
            }
            this._syncState(false, true);
            return false;
        } catch (error) {
            console.warn('[FullscreenManager] Erro ao sair de tela cheia:', error);
            this._fallbackFullscreen = false;
            this._syncState(false, true);
            return false;
        }
    }

    /**
     * Toggles browser fullscreen mode
     * @param {HTMLElement} [target]
     * @returns {Promise<boolean>} New fullscreen state
     */
    async toggle(target) {
        if (this.isFullscreen()) {
            await this.exit();
            return false;
        }
        return this.enter(target);
    }

    enterFullscreen(target) {
        return this.enter(target);
    }

    exitFullscreen() {
        return this.exit();
    }

    toggleFullscreen(target) {
        return this.toggle(target);
    }

    /**
     * Requests W3C Keyboard Lock in fullscreen so system shortcuts (Esc, F11, Meta)
     * are delivered to unkayOS instead of being swallowed by the host browser.
     * @private
     */
    async _engageKeyboardLock() {
        try {
            if (typeof navigator !== 'undefined' && navigator.keyboard && typeof navigator.keyboard.lock === 'function') {
                await navigator.keyboard.lock(['Escape', 'F11', 'MetaLeft', 'MetaRight']);
            }
        } catch (_) {
            // Keyboard Lock is optional and only supported in Chromium contexts
        }
    }

    /**
     * Releases W3C Keyboard Lock
     * @private
     */
    _releaseKeyboardLock() {
        try {
            if (typeof navigator !== 'undefined' && navigator.keyboard && typeof navigator.keyboard.unlock === 'function') {
                navigator.keyboard.unlock();
            }
        } catch (_) {
            // Ignore
        }
    }

    /**
     * Handles native fullscreenchange events (e.g. user pressed browser F11 or Esc)
     * @private
     */
    _handleFullscreenChange() {
        const active = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
        this._fallbackFullscreen = active;
        if (!active) {
            this._releaseKeyboardLock();
        }
        this._syncState(active, true);
    }

    /**
     * Synchronizes DOM dataset and broadcasts eventBus notification
     * @param {boolean} active
     * @param {boolean} emit
     * @private
     */
    _syncState(active, emit = true) {
        if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.dataset.fullscreen = String(active);
        }
        if (emit) {
            eventBus.emit('system:fullscreen:changed', { isFullscreen: active });
        }
    }

    destroy() {
        if (typeof document !== 'undefined') {
            document.removeEventListener('fullscreenchange', this._boundOnChange);
            document.removeEventListener('webkitfullscreenchange', this._boundOnChange);
        }
        eventBus.off('system:fullscreen:toggle', this._boundToggle);
        eventBus.off('system:fullscreen:enter', this._boundEnter);
        eventBus.off('system:fullscreen:exit', this._boundExit);
    }

    shutdown() {
        return this.destroy();
    }
}

export const fullscreenManager = new FullscreenManager();
