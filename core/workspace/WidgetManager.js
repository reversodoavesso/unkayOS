import eventBus from '../eventBus.js';
import { iconMarkup } from '../ui/designSystem.js';
import { validateWidget } from './preferences.js';

export class WidgetManager {
  constructor(session) {
    this.session = session;
    this.active = new Map();
    this.queue = Promise.resolve();
    this.wasEnabled = false;
    this.started = ({ appId, instanceId }) => {
      if (this.session.appManager.loadedAppDetails.get(appId)?.widget === true) {
        this.adopt(appId, instanceId);
        if (!this.session.settings.widgets.enabled) this.hide(appId).catch(error => this.report(error));
      }
    };
    this.stopped = ({ instanceId }) => {
      for (const [id, entry] of this.active) if (entry.instanceId === instanceId) { entry.frame.remove(); this.active.delete(id); }
      this.notify();
    };
  }

  catalog() {
    return [
      ...[...this.session.appManager.loadedAppDetails.values()].filter(app => app.widget === true).sort((a, b) => a.id.localeCompare(b.id)).map(app => ({ id: app.id, title: app.app_name, icon: app.icon_name, type: 'native', description: app.description || 'Widget do sistema' })),
      ...this.session.settings.widgets.custom.map(widget => ({ ...widget, description: widget.type === 'note' ? 'Nota pessoal' : `${widget.items.length} links` }))
    ];
  }

  async initialize() {
    this.rail = document.createElement('aside');
    this.rail.className = 'workspace-widgets';
    this.rail.setAttribute('aria-label', 'Widgets da área de trabalho');
    this.session.desktop.appendChild(this.rail);
    eventBus.on('app:started', this.started);
    eventBus.on('app:stopped', this.stopped);
    await this.applyPreferences();
  }

  enqueue(action) {
    const operation = this.queue.then(action);
    this.queue = operation.catch(() => {});
    return operation;
  }

  notify() { eventBus.emit('widgets:updated'); }

  frame(widget) {
    const frame = document.createElement('section');
    frame.className = 'workspace-widget';
    frame.dataset.widgetId = widget.id;
    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.innerHTML = iconMarkup(widget.icon || 'layout-grid', { size: 16 });
    title.appendChild(document.createTextNode(widget.title));
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'workspace-icon-button';
    close.setAttribute('aria-label', `Ocultar ${widget.title} nesta sessão`);
    close.title = 'Ocultar nesta sessão'; close.innerHTML = iconMarkup('x', { size: 16 });
    close.addEventListener('click', () => this.hide(widget.id).catch(error => this.report(error)));
    header.append(title, close); frame.appendChild(header);
    this.rail.appendChild(frame);
    return frame;
  }

  adopt(id, instanceId) {
    if (this.active.has(id)) return;
    const app = this.session.appManager.runningApps.get(instanceId);
    const widget = this.catalog().find(entry => entry.id === id);
    if (!app?.UI?.appElement || !widget) return;
    const frame = this.frame(widget);
    const element = app.UI.appElement;
    Object.assign(element.style, { position: 'relative', top: 'auto', left: 'auto', right: 'auto', bottom: 'auto', width: '100%', height: 'auto', transform: 'none' });
    frame.appendChild(element);
    this.active.set(id, { frame, instanceId });
    this.notify();
  }

  async load(id) {
    if (this.active.has(id)) return;
    const widget = this.catalog().find(entry => entry.id === id);
    if (!widget) throw new Error('Widget não encontrado.');
    if (widget.type === 'native') {
      const running = [...this.session.appManager.runningApps.entries()].find(([, app]) => app.CORE.id === id);
      const instanceId = running?.[0] || await this.session.appManager.runApp(id);
      if (!instanceId) throw new Error(`Não foi possível carregar ${widget.title}.`);
      this.adopt(id, instanceId);
    } else {
      const frame = this.frame(widget);
      const body = document.createElement('div'); body.className = 'workspace-widget__body';
      if (widget.type === 'note') {
        const text = document.createElement('p'); text.textContent = widget.content; body.appendChild(text);
      } else {
        for (const item of widget.items) {
          const link = document.createElement('a'); link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
          link.textContent = item.label; body.appendChild(link);
        }
      }
      frame.appendChild(body); this.active.set(id, { frame, instanceId: null });
      this.notify();
    }
  }

  async unload(id) {
    const entry = this.active.get(id);
    if (!entry) return;
    if (entry.instanceId) await this.session.appManager.stopApp(entry.instanceId);
    entry.frame.remove(); this.active.delete(id); this.notify();
  }

  show(id) {
    return this.enqueue(async () => {
      if (!this.session.settings.widgets.enabled) throw new Error('Ative os widgets antes de carregar um deles.');
      await this.load(id);
    });
  }
  hide(id) { return this.enqueue(() => this.unload(id)); }

  applyPreferences() {
    return this.enqueue(async () => {
      const prefs = this.session.settings.widgets;
      const known = new Set(this.catalog().map(widget => widget.id));
      for (const id of [...this.active.keys()]) if (!prefs.enabled || !known.has(id)) await this.unload(id);
      if (prefs.enabled && !this.wasEnabled) {
        for (const id of prefs.startup) {
          if (!known.has(id)) continue;
          try { await this.load(id); } catch (error) { this.report(error); }
        }
      }
      this.wasEnabled = prefs.enabled;
      this.rail.hidden = !prefs.enabled;
      this.notify();
    });
  }

  async import(value, startup) {
    const widget = validateWidget(value);
    await this.session.update(settings => {
      const prefs = settings.widgets;
      if (this.catalog().some(entry => entry.id === widget.id)) throw new Error('Já existe um widget com esse identificador.');
      if (prefs.custom.length >= 12) throw new Error('O espaço aceita até 12 widgets importados.');
      return { widgets: { custom: [...prefs.custom, widget], startup: startup ? [...prefs.startup, widget.id] : prefs.startup, enabled: true } };
    });
    await this.show(widget.id);
  }

  async remove(id) {
    await this.session.update(settings => ({ widgets: { custom: settings.widgets.custom.filter(widget => widget.id !== id), startup: settings.widgets.startup.filter(entry => entry !== id) } }));
  }

  report(error) { eventBus.emit('widgets:error', error.message); }

  async destroy() {
    await this.enqueue(async () => { for (const id of [...this.active.keys()]) await this.unload(id); });
    eventBus.off('app:started', this.started); eventBus.off('app:stopped', this.stopped);
    this.rail?.remove();
  }
}
