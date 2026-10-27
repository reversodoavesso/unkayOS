import { workspaceIcon } from './deployment.js';
import eventBus from './eventBus.js';
import { iconMarkup } from './ui/designSystem.js';
import { getWorkspace } from './workspace/WorkspaceSession.js';
import { escapeHtml, DEFAULT_SHELL } from './workspace/preferences.js';

const categories = { theorb: 'explore', about: 'system', terminal: 'create', 'process-manager': 'system', 'file-manager': 'explore', 'text-editor': 'create', openui: 'create', store: 'explore', 'user-profile': 'system', settings: 'system' };
const descriptions = { theorb: 'Um novo caminho pela web', terminal: 'Comandos, ideias e possibilidades', about: 'Conheça o seu ambiente', 'process-manager': 'O que está em movimento', 'file-manager': 'Tudo o que você guarda', 'text-editor': 'Transforme ideias em palavras', openui: 'Crie novas interfaces', store: 'Descubra novas ferramentas', 'user-profile': 'Sua conta e identidade', settings: 'Deixe o espaço com a sua cara' };
const focus = element => { if (element instanceof HTMLElement) element.focus(); };
const groups = [['all', 'Todos'], ['create', 'Criar'], ['explore', 'Explorar'], ['system', 'Sistema'], ['pinned', 'Fixados']];

export class menuApps {
  constructor(desktop) { this.desktop = desktop; this.category = 'all'; this.visibilityFlag = false; this.allApps = []; }
  init() {
    this.menuElement = document.createElement('dialog'); this.menuElement.className = 'menu_apps'; this.menuElement.id = 'menu_apps';
    this.menuElement.setAttribute('aria-labelledby', 'launcherTitle'); this.desktop.appendChild(this.menuElement);
    this.controller = new AbortController(); const options = { signal: this.controller.signal };
    this.menuElement.addEventListener('click', event => this.click(event), options);
    this.menuElement.addEventListener('input', event => { if (event.target === this.searchInput) this.renderApps(); }, options);
    this.menuElement.addEventListener('keydown', event => this.keydown(event), options);
    this.menuElement.addEventListener('close', () => {
      this.visibilityFlag = false; this.menuElement.classList.remove('menu_apps--visible'); document.documentElement.dataset.launcherOpen = 'false';
      document.querySelector('.taskbar__start_menu')?.setAttribute('aria-expanded', 'false');
      if (this.previousFocus?.isConnected) focus(this.previousFocus);
    }, options);
    this.toggleHandler = () => this.toggle(); this.closeHandler = () => this.close();
    this.updateHandler = () => { if (this.visibilityFlag) this.refresh(); };
    eventBus.on('packages:changed', this.updateHandler);
    eventBus.on('menu:apps:toggle', this.toggleHandler); eventBus.on('menu:apps:close', this.closeHandler);
    eventBus.on('settings:updated', this.updateHandler); eventBus.on('app:started', this.updateHandler); eventBus.on('app:stopped', this.updateHandler); eventBus.on('app:start:error', this.updateHandler);
    this.refresh();
  }
  refresh() {
    const query = this.searchInput?.value || '';
    this.allApps = [...(window.loadedAppDetails || new Map()).values()].filter(app => !app.hidden && !app.widget).sort((a,b) => a.app_name.localeCompare(b.app_name, 'pt-BR'));
    const session = getWorkspace(), name = session?.settings.onboarding.displayName;
    this.menuElement.innerHTML = `<header class="launcher-header"><div><span class="workspace-eyebrow">${name ? `OLÁ, ${escapeHtml(name)}` : 'SEU ESPAÇO ESTÁ ABERTO'}</span><h1 id="launcherTitle">O que vamos<br><em>colocar em movimento?</em></h1></div><button type="button" class="workspace-icon-button" data-launcher-action="close" aria-label="Fechar aplicativos">${iconMarkup('x', { size: 20 })}</button></header>
      <div class="launcher-search">${iconMarkup('search', { size: 22 })}<input class="rda-input rda-input--lg menu_apps__search" type="search" placeholder="Encontre um app, siga uma ideia…" aria-label="Buscar aplicativos"><kbd>Esc</kbd></div>
      <div class="launcher-categories" role="group" aria-label="Filtrar aplicativos">${groups.map(([id,label])=>`<button type="button" data-category="${id}" aria-pressed="${id === this.category}">${label}</button>`).join('')}</div>
      <div class="launcher-results-heading"><span id="launcherCount"></span><span>SEU PRÓXIMO MOVIMENTO</span></div><div class="launcher-scroll rda-unkay-scroll-region"><div class="menu_apps__container"></div></div>
      <footer class="launcher-footer"><span>${iconMarkup(workspaceIcon, { size: 20 })}unkayOS <span>•</span> ${session?.auth.getCurrentUser() ? 'Conta conectada' : 'Este dispositivo'}</span><button type="button" data-launcher-action="settings">${iconMarkup('settings', { size: 16 })} Personalizar espaço ${iconMarkup('arrow-right', { size: 14 })}</button></footer>`;
    this.searchInput = this.menuElement.querySelector('input'); this.searchInput.value = query;
    this.appsContainer = this.menuElement.querySelector('.menu_apps__container'); this.renderApps();
  }
  renderApps() {
    const query = this.searchInput.value.trim().toLocaleLowerCase('pt-BR');
    const pinned = getWorkspace()?.settings.shell.pinned || DEFAULT_SHELL.pinned;
    const running = new Set([...(window.appManager?.runningApps.values() || [])].filter(app => !app.CORE.launchFailed).map(app => app.CORE.id));
    const apps = this.allApps.filter(app => (this.category === 'all' || (this.category === 'pinned' ? pinned.includes(app.id) : categories[app.id] === this.category)) && `${app.app_name} ${app.description || ''} ${descriptions[app.id] || ''}`.toLocaleLowerCase('pt-BR').includes(query));
    this.appsContainer.innerHTML = apps.length ? apps.map(app => `<article class="launcher-tile rda-unkay-app-card"><button type="button" class="menu_apps__app rda-action-card rda-unkay-app-card__launch" id="${escapeHtml(app.id)}-launcher" data-app="${escapeHtml(app.id)}" aria-label="Abrir ${escapeHtml(app.app_name)}"><span class="launcher-app-icon rda-unkay-app-card__icon">${iconMarkup(app.icon_name || 'package', { size: 30 })}</span><span class="launcher-app-copy rda-unkay-app-card__copy"><strong class="rda-action-card__title">${escapeHtml(app.app_name)}</strong><span class="rda-action-card__description">${escapeHtml(descriptions[app.id] || app.description || 'Um novo lugar para suas ideias')}</span>${running.has(app.id) ? '<small class="rda-unkay-app-card__state">Em curso</small>' : ''}</span></button><button type="button" class="launcher-pin rda-unkay-app-card__pin workspace-icon-button" data-pin="${escapeHtml(app.id)}" aria-pressed="${pinned.includes(app.id)}" aria-label="${pinned.includes(app.id) ? 'Desafixar' : 'Fixar'} ${escapeHtml(app.app_name)}" title="${pinned.includes(app.id) ? 'Desafixar da trilha' : 'Fixar na trilha'}">${iconMarkup('star', { size: 16 })}</button></article>`).join('') : '<p class="launcher-empty">Nenhum app por aqui. Experimente outra busca ou categoria.</p>';
    this.menuElement.querySelector('#launcherCount').textContent = `${apps.length} ${apps.length === 1 ? 'aplicativo' : 'aplicativos'}`;
  }
  async click(event) {
    if (event.target === this.menuElement) {
      const r = this.menuElement.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) this.close();
      return;
    }
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.category) {
      this.category = button.dataset.category;
      this.menuElement.querySelectorAll('[data-category]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      this.renderApps();
    }
    if (button.dataset.app) { this.close(); await getWorkspace()?.launch(button.dataset.app); }
    if (button.dataset.pin) {
      const id = button.dataset.pin;
      try { await getWorkspace()?.pin(id); focus(this.menuElement.querySelector(`[data-pin="${id}"]`)); }
      catch (error) { this.menuElement.querySelector('#launcherCount').textContent = error.message; this.searchInput.focus(); }
    }
    if (button.dataset.launcherAction === 'close') this.close();
    if (button.dataset.launcherAction === 'settings') { this.close(); await getWorkspace()?.launch('settings', { panel: 'workspace' }); }
  }
  keydown(event) {
    if (event.defaultPrevented) return;
    const apps = [...this.appsContainer.querySelectorAll('.menu_apps__app')];
    if (event.target === this.searchInput && event.key === 'ArrowDown') { event.preventDefault(); focus(apps[0]); return; }
    if (!event.target.matches('.menu_apps__app')) return;
    const columns = getComputedStyle(this.appsContainer).gridTemplateColumns.split(' ').length;
    const direction = { ArrowDown: columns, ArrowUp: -columns, ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (direction !== undefined && apps.length) { event.preventDefault(); focus(apps[(apps.indexOf(event.target) + direction + apps.length) % apps.length]); }
    if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); focus(apps[event.key === 'Home' ? 0 : apps.length - 1]); }
  }
  toggle() { if (this.visibilityFlag) this.close(); else this.show(); }
  onClick() { this.toggle(); }
  show() {
    if (document.querySelector('dialog[open]')) return;
    this.previousFocus = document.activeElement; this.category = 'all'; this.refresh();
    this.menuElement.classList.add('menu_apps--visible'); this.menuElement.showModal(); this.visibilityFlag = true;
    document.documentElement.dataset.launcherOpen = 'true'; document.querySelector('.taskbar__start_menu')?.setAttribute('aria-expanded', 'true');
    this.searchInput.focus();
  }
  close() { if (this.menuElement?.open) this.menuElement.close(); this.menuElement?.classList.remove('menu_apps--visible'); }
  remove() {
    eventBus.off('packages:changed', this.updateHandler);
    this.close(); this.controller?.abort(); this.menuElement?.remove();
    eventBus.off('menu:apps:toggle', this.toggleHandler); eventBus.off('menu:apps:close', this.closeHandler);
    eventBus.off('settings:updated', this.updateHandler); eventBus.off('app:started', this.updateHandler); eventBus.off('app:stopped', this.updateHandler); eventBus.off('app:start:error', this.updateHandler);
  }
}
