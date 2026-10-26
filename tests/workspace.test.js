// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeWorkspace, mergeWorkspace, changedSettings, validateWidget } from '../core/workspace/preferences.js';
import { WorkspaceSession } from '../core/workspace/WorkspaceSession.js';
import { WidgetManager } from '../core/workspace/WidgetManager.js';
import { AppManager } from '../core/AppManager.js';

const cleanup = [];
afterEach(async () => { for (const manager of cleanup.splice(0)) await manager.destroy(); document.body.replaceChildren(); localStorage.clear(); });

describe('Workspace preferences and widget lifecycle', () => {
  it('serializes concurrent changes without dropping another preference section', async () => {
    const saved = [];
    const session = new WorkspaceSession({ desktop: document.body, appManager: {}, auth: {}, fs: { mkdir: async () => {}, writeFile: async (path, text) => { await Promise.resolve(); saved.push(JSON.parse(text)); }, flush: async () => {} } });
    session.apply = vi.fn(); session.widgets.applyPreferences = vi.fn(async () => {});
    await Promise.all([session.update({ shell: { bar: 'edge' } }), session.update({ appearance: { accent: 'rose' } })]);
    expect(saved.at(-1).shell.bar).toBe('edge');
    expect(saved.at(-1).appearance.accent).toBe('rose');
    expect(saved.at(-1).shell.pinned).toContain('theorb');
    await Promise.all([session.pin('terminal'), session.pin('settings')]);
    expect(session.settings.shell.pinned).toEqual(expect.arrayContaining(['terminal', 'settings']));
  });

  it('a settings edit patches only changed fields and preserves newer favorites', () => {
    const before = normalizeWorkspace(), edited = structuredClone(before);
    edited.appearance.theme = 'light';
    const latest = mergeWorkspace(before, { shell: { pinned: ['terminal'] } });
    const merged = mergeWorkspace(latest, changedSettings(before, edited));
    expect(merged.shell.pinned).toEqual(['terminal']);
    expect(merged.appearance.theme).toBe('light');
  });

  it.each(['javascript:alert(1)', 'data:text/html,hello', 'https://user:secret@example.com'])('rejects active or credential-bearing widget links: %s', url => {
    expect(() => validateWidget({ schema: 'unkayos.widget/v1', id: 'my-links', title: 'Links', type: 'links', items: [{ label: 'Link', url }] })).toThrow();
  });

  it('does not import code or privileged app identities from widget manifests', () => {
    const note = validateWidget({ schema: 'unkayos.widget/v1', id: 'my-note', title: 'Nota', type: 'note', content: '<img src=x onerror=alert(1)>', script: 'alert(1)', permissions: ['admin'] });
    expect(note).not.toHaveProperty('script'); expect(note).not.toHaveProperty('permissions');
    expect(() => validateWidget({ ...note, id: 'taskbar' })).toThrow();
  });

  it('loads each native widget once, stops it on hide and keeps startup separate', async () => {
    const appManager = { loadedAppDetails: new Map([['clock', { id: 'clock', widget: true, app_name: 'Relógio', icon_name: 'clock' }]]), runningApps: new Map() };
    appManager.runApp = vi.fn(async id => { const instanceId = id + '-instance'; appManager.runningApps.set(instanceId, { CORE: { id }, UI: { appElement: document.createElement('div') } }); return instanceId; });
    appManager.stopApp = vi.fn(async instanceId => appManager.runningApps.delete(instanceId));
    const session = { desktop: document.body, settings: normalizeWorkspace({ widgets: { startup: [] } }), appManager };
    const manager = new WidgetManager(session); cleanup.push(manager);
    await manager.initialize(); expect(appManager.runApp).not.toHaveBeenCalled();
    await Promise.all([manager.show('clock'), manager.show('clock')]);
    expect(appManager.runApp).toHaveBeenCalledTimes(1);
    await manager.hide('clock'); expect(appManager.stopApp).toHaveBeenCalledTimes(1);
    expect(session.settings.widgets.startup).toEqual([]);
    await manager.show('clock'); session.settings.widgets.enabled = false; await manager.applyPreferences();
    expect(manager.active.size).toBe(0); expect(appManager.stopApp).toHaveBeenCalledTimes(2);
  });

  it('renders imported notes as text, with no imported DOM or executable content', async () => {
    const note = validateWidget({ schema: 'unkayos.widget/v1', id: 'my-note', title: 'Minha nota', type: 'note', content: '<img src=x onerror=alert(1)>' });
    const session = { desktop: document.body, settings: normalizeWorkspace({ widgets: { custom: [note], startup: ['my-note'] } }), appManager: { loadedAppDetails: new Map(), runningApps: new Map() } };
    const manager = new WidgetManager(session); cleanup.push(manager); await manager.initialize();
    expect(manager.rail.querySelector('.workspace-widget__body p').textContent).toBe(note.content);
    expect(manager.rail.querySelector('img')).toBeNull();
  });

  it('allows closing registered widgets while keeping the system bar protected', async () => {
    const manager = new AppManager(document.body, null, []);
    const make = widget => ({ CORE: { mode: 'desktop_ui', rawData: { widget }, stop: vi.fn(async () => {}) }, UI: { remove: vi.fn() } });
    const bar = make(false), widget = make(true);
    manager.runningApps.set('bar', bar); manager.runningApps.set('clock', widget);
    await manager.stopApp('bar'); expect(bar.CORE.stop).not.toHaveBeenCalled();
    await manager.stopApp('clock'); expect(widget.CORE.stop).toHaveBeenCalledOnce(); expect(manager.runningApps.has('clock')).toBe(false);
  });
});
