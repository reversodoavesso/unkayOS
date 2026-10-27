import { BaseApp } from '../../core/BaseApp.js';
import eventBus from '../../core/eventBus.js';
import { iconMarkup } from '../../core/ui/designSystem.js';
import { windowLayerManager } from '../../core/WindowLayerManager.js';
import { getWorkspace } from '../../core/workspace/WorkspaceSession.js';
import { DEFAULT_SHELL } from '../../core/workspace/preferences.js';
import { workspaceIcon } from '../../core/deployment.js';

export default class TaskbarApp extends BaseApp {
  async onRun() {
    this.taskbarElement = /** @type {HTMLElement} */ (this.$('.taskbar'));
    this.startMenuElement = this.$('.taskbar__start_menu');
    this.startMenuElement.querySelector('[data-workspace-mark]').setAttribute('name', workspaceIcon);
    this.appsOnToolbarElement = this.$('.taskbar__apps_on');
    windowLayerManager.setSystemLayer(this.taskbarElement, 'TASKBAR');
    this.controller = new AbortController();
    this.startMenuElement.addEventListener('click', () => eventBus.emit('menu:apps:toggle'), { signal: this.controller.signal });
    this.started = ({ instanceId }) => this.createAppIcon(instanceId);
    this.failed = ({ instanceId }) => { if (instanceId) this.createAppIcon(instanceId); };
    this.stopped = ({ instanceId }) => this.appsOnToolbarElement.querySelector(`[data-instance-id="${instanceId}"]`)?.remove();
    this.changed = ({ instanceId, ...state }) => this.updateAppIcon(instanceId, state);
    this.preferencesChanged = () => this.renderPinned();
    this.fullscreenChanged = ({ isFullscreen }) => this.updateFullscreenTrayButton(isFullscreen);
    eventBus.on('app:started', this.started);
    eventBus.on('app:start:error', this.failed);
    eventBus.on('app:stopped', this.stopped);
    eventBus.on('app:icon:update', this.changed);
    eventBus.on('settings:updated', this.preferencesChanged);
    eventBus.on('system:fullscreen:changed', this.fullscreenChanged);
    this.renderPinned();
    const { menuApps } = await import('../../core/MenuApps.js');
    this.menu = new menuApps(this.desktopElement); this.menu.init();
    this.initSystemTray();
    for (const [instanceId] of window.appManager?.runningApps || []) this.createAppIcon(instanceId);
  }

  renderPinned() {
    const host = this.$('.taskbar__pinned'); if (!host) return;
    host.replaceChildren();
    const details = window.loadedAppDetails || new Map();
    for (const id of getWorkspace()?.settings.shell.pinned || DEFAULT_SHELL.pinned) {
      const app = details.get(id); if (!app) continue;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'taskbar__pin';
      button.dataset.appId = id;
      button.title = app.app_name; button.setAttribute('aria-label', `Abrir ${app.app_name}`);
      button.innerHTML = iconMarkup(app.icon_name, { size: 22 });
      const name = document.createElement('span'); name.textContent = app.short_name || app.app_name; button.appendChild(name);
      button.addEventListener('click', () => getWorkspace()?.launch(id)); host.appendChild(button);
    }
  }

  createAppIcon(instanceId) {
    if (!this.appsOnToolbarElement || this.appsOnToolbarElement.querySelector(`[data-instance-id="${instanceId}"]`)) return;
    const app = window.appManager?.runningApps.get(instanceId);
    if (app?.CORE.mode !== 'system_window') return;
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'taskbar__apps_on__app_icon'; button.dataset.instanceId = instanceId;
    button.dataset.appId = app.CORE.id;
    button.title = app.CORE.app_name; button.setAttribute('aria-label', `Ativar ou minimizar ${app.CORE.app_name}`);
    if (app.CORE.launchFailed) { button.dataset.state = 'failed'; button.title += ' · Falha ao abrir'; }
    button.innerHTML = iconMarkup(app.CORE.rawData.icon_name, { size: 20 });
    const name = document.createElement('span'); name.textContent = app.CORE.rawData.short_name || app.CORE.app_name; button.appendChild(name);
    button.addEventListener('click', () => eventBus.emit('window:toggle', { instanceId }));
    this.appsOnToolbarElement.appendChild(button);
    this.updateAppIcon(instanceId, { isActive: window.appManager.activeAppInstanceId === instanceId, isMinimized: app.UI.isMinimized });
  }

  updateAppIcon(instanceId, state) {
    const button = this.appsOnToolbarElement?.querySelector(`[data-instance-id="${instanceId}"]`);
    if (!button) return;
    const active = Boolean(state.isActive || state.state === 'active');
    button.classList.toggle('active', active); button.classList.toggle('minimized', Boolean(state.isMinimized));
    button.setAttribute('aria-pressed', String(active));
  }

  initSystemTray() {
    const tray = this.$('.taskbar__system_tray'); tray.replaceChildren();
    const time = document.createElement('time'); time.className = 'taskbar__time';
    const update = () => { const now = new Date(); time.dateTime = now.toISOString(); time.textContent = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(now); };
    update(); this.timeTimer = this.setInterval(update, 1000); tray.appendChild(time);

    const fsBtn = document.createElement('button');
    fsBtn.type = 'button';
    fsBtn.className = 'workspace-icon-button taskbar__fullscreen_btn';
    fsBtn.innerHTML = iconMarkup('maximize-2', { size: 18 });
    fsBtn.addEventListener('click', () => eventBus.emit('system:fullscreen:toggle'));
    this.fullscreenTrayButton = fsBtn;
    this.updateFullscreenTrayButton(Boolean(window.fullscreenManager?.isFullscreen?.() || document.documentElement?.dataset?.fullscreen === 'true'));
    tray.appendChild(fsBtn);

    for (const [icon, label, id, panel] of [['layout-grid', 'Configurar widgets', 'settings', 'widgets'], ['user', 'Meu perfil', 'user-profile', null]]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'workspace-icon-button';
      button.title = label; button.setAttribute('aria-label', label); button.innerHTML = iconMarkup(icon, { size: 18 });
      button.addEventListener('click', () => window.appManager.runApp(id, panel ? { panel } : {})); tray.appendChild(button);
    }
  }

  updateFullscreenTrayButton(isFullscreen) {
    if (!this.fullscreenTrayButton) return;
    const active = Boolean(isFullscreen);
    const label = active ? 'Sair da tela cheia (F11)' : 'Entrar em tela cheia (F11)';
    this.fullscreenTrayButton.title = label;
    this.fullscreenTrayButton.setAttribute('aria-label', label);
    this.fullscreenTrayButton.setAttribute('aria-pressed', String(active));
  }

  async onCleanup() {
    this.controller?.abort(); this.clearInterval(this.timeTimer); this.menu?.remove();
    eventBus.off('app:started', this.started); eventBus.off('app:stopped', this.stopped);
    eventBus.off('app:start:error', this.failed);
    eventBus.off('app:icon:update', this.changed); eventBus.off('settings:updated', this.preferencesChanged);
    eventBus.off('system:fullscreen:changed', this.fullscreenChanged);
  }
  static runCli(args, writeLine) { window.appManager?.runApp('taskbar'); writeLine('Trilha de aplicativos disponível.'); }
}
