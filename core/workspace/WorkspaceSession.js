import eventBus from '../eventBus.js';
import { readPreferences, writePreferences, applyAppearance, applyWindowing } from '../utils/appPreferences.js';
import { normalizeWorkspace, mergeWorkspace, applyShell } from './preferences.js';
import { WidgetManager } from './WidgetManager.js';
import { WelcomeSetup } from './WelcomeSetup.js';

let currentSession = null;
export const getWorkspace = () => currentSession;

export class WorkspaceSession {
  constructor({ desktop, appManager, fs, auth }) {
    this.desktop = desktop;
    this.appManager = appManager;
    this.fs = fs;
    this.auth = auth;
    this.settings = normalizeWorkspace();
    this.queue = Promise.resolve();
    this.widgets = new WidgetManager(this);
    this.setup = new WelcomeSetup(this);
    this.keyboard = event => {
      if (event.ctrlKey && event.code === 'Space' && !event.altKey && !event.metaKey && !document.querySelector('dialog[open]:not(.menu_apps)')) {
        event.preventDefault();
        eventBus.emit('menu:apps:toggle');
      }
    };
  }

  async initialize() {
    this.settings = normalizeWorkspace(await readPreferences(this.fs, '/etc/unkay-settings.json', 'unkayos_system_settings'));
    currentSession = this;
    this.apply();
    await this.widgets.initialize();
    document.addEventListener('keydown', this.keyboard);
    eventBus.emit('settings:updated', structuredClone(this.settings));
    if (!this.settings.onboarding.completedAt) this.setup.show();
    return this;
  }

  apply(settings = this.settings) {
    applyAppearance(settings.appearance, this.desktop);
    applyWindowing(settings.windowing);
    applyShell(settings.shell);
  }

  update(patch) {
    const copied = typeof patch === 'function' ? patch : structuredClone(patch);
    const operation = this.queue.then(async () => {
      const next = mergeWorkspace(this.settings, typeof copied === 'function' ? copied(structuredClone(this.settings)) : copied);
      await writePreferences(this.fs, '/etc/unkay-settings.json', 'unkayos_system_settings', next);
      if (this.fs?.flush) await this.fs.flush();
      this.settings = next;
      this.apply();
      await this.widgets.applyPreferences();
      eventBus.emit('settings:updated', structuredClone(next));
      return structuredClone(next);
    });
    this.queue = operation.catch(() => {});
    return operation;
  }

  async pin(appId) {
    return this.update(settings => {
      const pinned = settings.shell.pinned;
      if (!pinned.includes(appId) && pinned.length >= 8) throw new Error('A trilha aceita até 8 favoritos. Desafixe um app para adicionar outro.');
      return { shell: { pinned: pinned.includes(appId) ? pinned.filter(id => id !== appId) : [...pinned, appId] } };
    });
  }

  async launch(appId, params = {}) {
    const running = [...this.appManager.runningApps.entries()].find(([, app]) => app.CORE.id === appId && app.CORE.mode === 'system_window');
    if (running) {
      if (params.panel) running[1].CORE.appInstance?.switchPanel?.(params.panel);
      if (running[1].UI.isMinimized) running[1].UI.restore();
      this.appManager.defineFirstPlaneApp(running[0]);
      return running[0];
    }
    return this.appManager.runApp(appId, params);
  }

  async destroy() {
    document.removeEventListener('keydown', this.keyboard);
    this.setup.destroy();
    await this.widgets.destroy();
    if (currentSession === this) currentSession = null;
  }
}
