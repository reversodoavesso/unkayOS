import { normalizeAppearance } from '../utils/appPreferences.js';
import { accentPresets } from '../ui/designSystem.js';

export const WALLPAPERS = [
  { name: 'Atmosfera', value: 'linear-gradient(145deg, var(--rda-surface-primary) 12%, var(--unkay-accent-subtle) 64%, var(--rda-surface-secondary))' },
  { name: 'Montanhas', value: '/assets/images/wallpaper_01.jpg' },
  { name: 'Nebulosa', value: 'radial-gradient(circle at 50% 50%, #164e63 0%, #0a0a0a 100%)' },
  { name: 'Obsidian', value: '#0a0a0a' }
];
export const DEFAULT_SHELL = { bar: 'floating', launcher: 'atlas', showLabels: false, pinned: ['theorb', 'file-manager', 'openui'] };
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function normalizeShell(value) {
  const shell = object(value);
  return { bar: shell.bar === 'edge' ? 'edge' : 'floating', launcher: shell.launcher === 'compact' ? 'compact' : 'atlas', showLabels: shell.showLabels === true, pinned: Array.isArray(shell.pinned) ? [...new Set(shell.pinned.filter(id => typeof id === 'string' && /^[a-z][a-z0-9-]*$/.test(id)))].slice(0, 8) : [...DEFAULT_SHELL.pinned] };
}

/**
 * @typedef {{schema:string,id:string,title:string,icon:string,type:'note',content:string}} NoteWidget
 * @typedef {{schema:string,id:string,title:string,icon:string,type:'links',items:Array<{label:string,url:string}>}} LinksWidget
 * @returns {NoteWidget|LinksWidget}
 */
export function validateWidget(value) {
  const widget = object(value);
  if (widget.schema !== 'unkayos.widget/v1' || !/^[a-z][a-z0-9-]{1,47}$/.test(widget.id || '') || ['clock', 'system-info', 'taskbar'].includes(widget.id)) throw new Error('Identificador ou versão do widget inválido.');
  if (typeof widget.title !== 'string' || !widget.title.trim() || widget.title.length > 60) throw new Error('Informe um título de até 60 caracteres.');
  const icon = typeof widget.icon === 'string' && /^[a-z0-9-]+$/.test(widget.icon) ? widget.icon : 'layout-grid';
  const base = { schema: 'unkayos.widget/v1', id: widget.id, title: widget.title.trim(), icon, type: widget.type };
  if (widget.type === 'note' && typeof widget.content === 'string' && widget.content.length <= 1600) return { ...base, type: 'note', content: widget.content };
  if (widget.type === 'links' && Array.isArray(widget.items) && widget.items.length > 0 && widget.items.length <= 8) {
    return { ...base, type: 'links', items: widget.items.map(item => {
      if (typeof item?.label !== 'string' || !item.label.trim() || item.label.length > 80) throw new Error('Rótulo de link inválido.');
      let url;
      try { url = new URL(item.url); } catch (_) { throw new Error('Use URLs HTTP ou HTTPS válidas nos links.'); }
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Use links HTTP ou HTTPS sem credenciais.');
      return { label: item.label.trim(), url: url.href };
    }) };
  }
  throw new Error('Use um widget de notas ou links dentro dos limites indicados.');
}

export function normalizeWidgets(value) {
  const prefs = object(value), custom = [];
  for (const entry of Array.isArray(prefs.custom) ? prefs.custom.slice(0, 12) : []) {
    try { const widget = validateWidget(entry); if (!custom.some(w => w.id === widget.id)) custom.push(widget); } catch (_) { /* Invalid saved entries cannot execute or render. */ }
  }
  return { enabled: prefs.enabled !== false, startup: Array.isArray(prefs.startup) ? [...new Set(prefs.startup.filter(id => typeof id === 'string' && /^[a-z][a-z0-9-]{0,47}$/.test(id)).slice(0, 24))] : ['clock'], custom };
}

function normalizeOnboarding(value) {
  const state = object(value);
  return { version: Number.isInteger(state.version) ? state.version : 0, displayName: typeof state.displayName === 'string' ? state.displayName.trim().slice(0, 40) : '', ...(typeof state.completedAt === 'string' && Number.isFinite(Date.parse(state.completedAt)) ? { completedAt: state.completedAt } : {}) };
}

export function normalizeWorkspace(value = {}) {
  const settings = object(value);
  return { ...settings, appearance: normalizeAppearance(settings.appearance || { wallpaper: WALLPAPERS[0].value }), windowing: { aeroSnap: true, centerWindows: true, taskbarPosition: 'bottom', autoHideTaskbar: false, ...object(settings.windowing) }, storage: { minioUrl: 'http://localhost:9000', minioBucket: 'unkayos-storage', ...object(settings.storage) }, network: { offlineMode: false, ...object(settings.network) }, security: { strictSandbox: true, secureHostDrop: true, ...object(settings.security) }, shell: normalizeShell(settings.shell), widgets: normalizeWidgets(settings.widgets), onboarding: normalizeOnboarding(settings.onboarding) };
}

export function mergeWorkspace(current, patch) {
  const next = { ...current };
  for (const [key, value] of Object.entries(object(patch))) next[key] = value && typeof value === 'object' && !Array.isArray(value) ? { ...object(current[key]), ...value } : value;
  return normalizeWorkspace(next);
}

export function changedSettings(before = {}, after = {}) {
  const changes = {};
  for (const [section, value] of Object.entries(after)) {
    if (JSON.stringify(before[section]) === JSON.stringify(value)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const fields = {};
      for (const [key, field] of Object.entries(value)) if (JSON.stringify(before[section]?.[key]) !== JSON.stringify(field)) fields[key] = field;
      changes[section] = fields;
    } else changes[section] = value;
  }
  return changes;
}

export function applyShell(value = {}) {
  const shell = normalizeShell(value);
  document.documentElement.dataset.shellBar = shell.bar;
  document.documentElement.dataset.shellLauncher = shell.launcher;
  document.documentElement.dataset.shellLabels = String(shell.showLabels);
}

export function accentChoices(selected) {
  return Object.entries(accentPresets).map(([id, preset]) => `<button type="button" class="rda-button rda-button--lg accent-swatch" data-color="primary" data-icon-only="true" data-rda-product="unkayos" data-unkay-accent="${id}" data-accent="${id}" aria-label="${preset.label}" title="${preset.label}" aria-pressed="${id === selected}"><rda-icon name="check"></rda-icon></button>`).join('');
}

export const WIDGET_EXAMPLE = { schema: 'unkayos.widget/v1', id: 'meus-links', title: 'Meu ponto de partida', icon: 'bookmark', type: 'links', items: [{ label: 'Reverso do Avesso', url: 'https://reversodoavesso.com' }] };
