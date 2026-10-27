// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import eventBus from '../core/eventBus.js';
import { FullscreenManager } from '../core/FullscreenManager.js';
import { KeyboardManager } from '../core/KeyboardManager.js';
import { ContextMenuManager } from '../core/ContextMenuManager.js';

describe('unkayOS Fullscreen, System Keybinds & Contextual Right-Click Menus', () => {
    let desktop;

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="desktop">
                <div class="taskbar">
                    <button class="taskbar__start_menu" type="button">unkayOS</button>
                    <div class="taskbar__pinned">
                        <button class="taskbar__pin" data-app-id="terminal" type="button">Terminal</button>
                    </div>
                    <div class="taskbar__apps_on">
                        <button class="taskbar__apps_on__app_icon" data-instance-id="inst_1" data-app-id="text-editor" type="button">Editor</button>
                    </div>
                    <div class="taskbar__system_tray"></div>
                </div>
                <section class="workspace-widgets">
                    <article class="workspace-widget" data-widget-id="clock">Relógio</article>
                </section>
                <div class="app active-app" id="inst_1" data-instance-id="inst_1" data-app-id="text-editor" data-app-type="system_window">
                    <div class="app__top_bar">
                        <span class="app__top_bar__app_name">Editor de Texto</span>
                    </div>
                    <div class="app__content">
                        <div class="file-item" data-path="/home/user/notes.txt" data-type="file">notes.txt</div>
                        <textarea id="editor-input">Texto de exemplo</textarea>
                    </div>
                </div>
                <dialog class="menu_apps">
                    <div class="launcher-tile">
                        <button data-app="browser" type="button">Navegador</button>
                    </div>
                </dialog>
            </div>
        `;
        desktop = document.getElementById('desktop');

        window.loadedAppDetails = new Map([
            ['terminal', { id: 'terminal', app_name: 'Terminal', icon_name: 'terminal' }],
            ['text-editor', { id: 'text-editor', app_name: 'Editor de Texto', icon_name: 'file-text' }],
            ['browser', { id: 'browser', app_name: 'Navegador', icon_name: 'globe' }]
        ]);

        window.appManager = {
            activeAppInstanceId: 'inst_1',
            runningApps: new Map([
                [
                    'inst_1',
                    {
                        CORE: {
                            id: 'text-editor',
                            instanceId: 'inst_1',
                            app_name: 'Editor de Texto',
                            mode: 'system_window',
                            rawData: { icon_name: 'file-text' }
                        },
                        UI: {
                            isMinimized: false,
                            isMaximized: false,
                            snapTo: vi.fn(),
                            centerWindow: vi.fn(),
                            toggleMaximizeWindow: vi.fn()
                        }
                    }
                ]
            ]),
            runApp: vi.fn(),
            closeApp: vi.fn(),
            cycleWindows: vi.fn(),
            toggleShowDesktop: vi.fn()
        };
    });

    afterEach(() => {
        document.body.innerHTML = '';
        delete document.documentElement.dataset.fullscreen;
    });

    describe('FullscreenManager', () => {
        it('toggles fullscreen state, updates root dataset, and emits system:fullscreen:changed', async () => {
            const fsManager = new FullscreenManager();
            fsManager.initialize();

            const changedSpy = vi.fn();
            eventBus.on('system:fullscreen:changed', changedSpy);

            expect(fsManager.isFullscreen()).toBe(false);

            const entered = await fsManager.enterFullscreen();
            expect(entered).toBe(true);
            expect(fsManager.isFullscreen()).toBe(true);
            expect(document.documentElement.dataset.fullscreen).toBe('true');
            expect(changedSpy).toHaveBeenCalledWith({ isFullscreen: true });

            const exited = await fsManager.exitFullscreen();
            expect(exited).toBe(false);
            expect(fsManager.isFullscreen()).toBe(false);
            expect(document.documentElement.dataset.fullscreen).toBe('false');
            expect(changedSpy).toHaveBeenLastCalledWith({ isFullscreen: false });

            eventBus.off('system:fullscreen:changed', changedSpy);
            fsManager.shutdown();
        });

        it('responds to system:fullscreen:toggle event on eventBus', async () => {
            const fsManager = new FullscreenManager();
            fsManager.initialize();

            eventBus.emit('system:fullscreen:toggle');
            await Promise.resolve();
            expect(fsManager.isFullscreen()).toBe(true);

            eventBus.emit('system:fullscreen:toggle');
            await Promise.resolve();
            expect(fsManager.isFullscreen()).toBe(false);

            fsManager.shutdown();
        });
    });

    describe('KeyboardManager System Keybinds', () => {
        it('registers default system shortcuts for launcher, fullscreen, window management, and apps', () => {
            const kb = new KeyboardManager();
            const shortcuts = kb.getSystemShortcuts();
            const ids = shortcuts.map((s) => s.id);

            expect(ids).toContain('system.launcher');
            expect(ids).toContain('system.fullscreen');
            expect(ids).toContain('system.showDesktop');
            expect(ids).toContain('system.contextMenu');
            expect(ids).toContain('window.close');
            expect(ids).toContain('window.maximize');
            expect(ids).toContain('window.minimize');
            expect(ids).toContain('window.snapLeft');
            expect(ids).toContain('window.snapRight');
            expect(ids).toContain('window.center');
            expect(ids).toContain('window.cycleNext');
            expect(ids).toContain('app.terminal');
            expect(ids).toContain('app.fileManager');
            expect(ids).toContain('app.settings');
            expect(ids).toContain('app.processManager');
        });

        it('executes global system keybinds (F11, Alt+ArrowLeft, Ctrl+Alt+T, Ctrl+Alt+D)', () => {
            const kb = new KeyboardManager();
            kb.activeInstanceId = 'inst_1';

            const fsSpy = vi.fn();
            const snapSpy = vi.fn();
            const startSpy = vi.fn();
            const showDesktopSpy = vi.fn();

            eventBus.on('system:fullscreen:toggle', fsSpy);
            eventBus.on('window:snap', snapSpy);
            eventBus.on('app:start', startSpy);
            eventBus.on('desktop:toggle-show', showDesktopSpy);

            // F11 -> system:fullscreen:toggle
            const f11Event = new KeyboardEvent('keydown', { key: 'F11', code: 'F11', cancelable: true });
            kb.handleGlobalKeyEvent(f11Event);
            expect(fsSpy).toHaveBeenCalledTimes(1);

            // Alt+ArrowLeft -> window:snap left
            const snapLeftEvent = new KeyboardEvent('keydown', {
                key: 'ArrowLeft',
                code: 'ArrowLeft',
                altKey: true,
                cancelable: true
            });
            kb.handleGlobalKeyEvent(snapLeftEvent);
            expect(snapSpy).toHaveBeenCalledWith({ instanceId: 'inst_1', zone: 'left' });

            // Ctrl+Alt+T -> app:start terminal
            const termEvent = new KeyboardEvent('keydown', {
                key: 't',
                code: 'KeyT',
                ctrlKey: true,
                altKey: true,
                cancelable: true
            });
            kb.handleGlobalKeyEvent(termEvent);
            expect(startSpy).toHaveBeenCalledWith({ appId: 'terminal', params: {} });

            // Ctrl+Alt+D -> desktop:toggle-show
            const desktopEvent = new KeyboardEvent('keydown', {
                key: 'd',
                code: 'KeyD',
                ctrlKey: true,
                altKey: true,
                cancelable: true
            });
            kb.handleGlobalKeyEvent(desktopEvent);
            expect(showDesktopSpy).toHaveBeenCalledTimes(1);

            eventBus.off('system:fullscreen:toggle', fsSpy);
            eventBus.off('window:snap', snapSpy);
            eventBus.off('app:start', startSpy);
            eventBus.off('desktop:toggle-show', showDesktopSpy);
        });
    });

    describe('ContextMenuManager Contextual Resolution & Rendering', () => {
        let cm;

        beforeEach(() => {
            cm = new ContextMenuManager();
            cm.initialize(desktop);
        });

        afterEach(() => {
            cm.shutdown();
        });

        it('accurately resolves all semantic OS zones from DOM targets', () => {
            expect(cm.resolveContext(desktop).zone).toBe('desktop');
            expect(cm.resolveContext(desktop.querySelector('.app__top_bar')).zone).toBe('window-titlebar');
            expect(cm.resolveContext(desktop.querySelector('.app__content')).zone).toBe('window-body');
            expect(cm.resolveContext(desktop.querySelector('.taskbar__apps_on__app_icon')).zone).toBe('taskbar-running-app');
            expect(cm.resolveContext(desktop.querySelector('.taskbar__pin')).zone).toBe('taskbar-pinned-app');
            expect(cm.resolveContext(desktop.querySelector('.taskbar__pin')).appId).toBe('terminal');
            expect(cm.resolveContext(desktop.querySelector('.taskbar__start_menu')).zone).toBe('taskbar-launcher');
            expect(cm.resolveContext(desktop.querySelector('.taskbar__system_tray')).zone).toBe('taskbar-bar');
            expect(cm.resolveContext(desktop.querySelector('.workspace-widget')).zone).toBe('widget');
            expect(cm.resolveContext(desktop.querySelector('.workspace-widget')).widgetId).toBe('clock');
            expect(cm.resolveContext(desktop.querySelector('.launcher-tile button')).zone).toBe('launcher-app-card');
            expect(cm.resolveContext(desktop.querySelector('.launcher-tile button')).appId).toBe('browser');
            expect(cm.resolveContext(desktop.querySelector('#editor-input')).zone).toBe('editable');
        });

        it('opens desktop context menu on right-click and executes menu item action', () => {
            const event = new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: 180,
                clientY: 220
            });
            desktop.dispatchEvent(event);

            expect(event.defaultPrevented).toBe(true);
            expect(cm.isOpen).toBe(true);

            const menuEl = desktop.querySelector('.unkay-context-menu');
            expect(menuEl).toBeTruthy();
            expect(menuEl.getAttribute('role')).toBe('menu');
            expect(menuEl.dataset.contextZone).toBe('desktop');

            const items = menuEl.querySelectorAll('[role="menuitem"]');
            expect(items.length).toBeGreaterThan(4);

            // Click "Abrir Terminal aqui"
            const terminalItem = Array.from(items).find((btn) =>
                btn.textContent.includes('Abrir Terminal')
            );
            expect(terminalItem).toBeTruthy();
            terminalItem.click();

            expect(window.appManager.runApp).toHaveBeenCalledWith('terminal', { cwd: '/home/user' });
            expect(cm.isOpen).toBe(false);
        });

        it('supports app-registered selector providers while preserving window titlebar WM menu', () => {
            const customAction = vi.fn();
            cm.registerAppProvider('inst_1', '.file-item', ({ matchedElement }) => [
                {
                    label: `Abrir ${matchedElement.dataset.path}`,
                    icon: 'file-text',
                    action: customAction
                }
            ]);

            // Right-clicking on .file-item triggers the app provider
            const fileItem = desktop.querySelector('.file-item');
            const ctxFile = cm.resolveContext(fileItem, 100, 100);
            const fileMenuItems = cm.buildMenuItems(ctxFile);
            expect(fileMenuItems[0].label).toBe('Abrir /home/user/notes.txt');

            // Right-clicking on .app__top_bar still shows the WM window menu
            const titleBar = desktop.querySelector('.app__top_bar');
            const ctxTitle = cm.resolveContext(titleBar, 100, 20);
            const titleMenuItems = cm.buildMenuItems(ctxTitle);
            const labels = titleMenuItems.filter((i) => i.label).map((i) => i.label);
            expect(labels).toContain('Minimizar Janela');
            expect(labels).toContain('Ajustar à Esquerda (50%)');
            expect(labels).toContain('Fechar Janela');

            cm.removeAppProviders('inst_1');
        });
    });
});
