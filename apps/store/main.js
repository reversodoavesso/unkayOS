import { BaseApp } from '../../core/BaseApp.js';
import { unkay } from '../../core/sdk/unkay.js';
import { iconMarkup } from '../../core/ui/designSystem.js';
import { escapeHtml } from '../../core/workspace/preferences.js';

const labels = { system: 'Incluído no sistema', installed: 'Instalado', update: 'Atualização disponível',
    incomplete: 'Instalação incompleta', blocked: 'Indisponível', available: 'Disponível', pending: 'Processando…' };
const profiles = { 'client-only': 'Neste dispositivo', 'client-server': 'Nuvem RDA',
    containerized: 'Container dedicado', 'external-gateway': 'Serviço externo' };
const searchText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const button = (action, text, id, { disabled = false, color = 'primary' } = {}) =>
    `<button type="button" class="rda-button rda-button--sm" data-color="${color}" data-action="${action}" data-app-id="${escapeHtml(id)}" ${disabled ? 'disabled' : ''}>${text}</button>`;

export default class StoreApp extends BaseApp {
    constructor(CORE, APIs) {
        super(CORE, APIs);
        this.apps = [];
        this.view = 'all';
        this.searchQuery = '';
        this.category = 'all';
        this.onlyCompatible = false;
        this.modalAppId = null;
    }

    async onRun() {
        this.sdk = this.unkay || unkay;
        this.packages = this.sdk.packages;
        this.controller = new AbortController();
        this.setupEventListeners();
        this.unsubscribe = this.packages.subscribe(() => this.render());
        await this.refresh();
    }

    /** @returns {HTMLElement} */
    $(selector) { return this.appContentRoot?.querySelector(selector); }

    /** @returns {NodeListOf<HTMLElement>} */
    $$(selector) { return this.appContentRoot?.querySelectorAll(selector); }

    setupEventListeners() {
        const options = { signal: this.controller.signal };
        this.$('#storeSearchInput').addEventListener('input', event => { this.searchQuery = searchText((/** @type {HTMLInputElement} */ (event.target)).value.trim()); this.render(); }, options);
        this.$('#categoryFilter').addEventListener('change', event => { this.category = (/** @type {HTMLSelectElement} */ (event.target)).value; this.render(); }, options);
        this.$('#compatFilterCheckbox').addEventListener('change', event => { this.onlyCompatible = (/** @type {HTMLInputElement} */ (event.target)).checked; this.render(); }, options);
        this.$('#storeViews').addEventListener('click', event => {
            const tab = /** @type {HTMLElement} */ ((/** @type {Element} */ (event.target)).closest('[data-view]'));
            if (tab) { this.view = tab.dataset.view; this.render(); }
        }, options);
        this.$('#refreshCatalog').addEventListener('click', () => this.refresh(), options);
        this.$('#importPackage').addEventListener('change', event => this.importPackage(event.target), options);
        this.$('#appsGrid').addEventListener('click', event => this.handleAction(event), options);
        this.$('#modalBody').addEventListener('click', event => this.handleAction(event), options);
        this.$('#modalCloseBtn').addEventListener('click', () => this.closeModal(), options);
        this.$('#modalBackdrop').addEventListener('click', () => this.closeModal(), options);
        this.appContentRoot.addEventListener('keydown', event => {
            if (!this.modalAppId) return;
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.closeModal(); }
            if (event.key === 'Tab') {
                const focusable = [...this.$('#appDetailModal').querySelectorAll('button:not(:disabled), [tabindex="0"]')].filter(element => element instanceof HTMLElement);
                const first = focusable[0], last = focusable.at(-1);
                if (event.shiftKey && (event.target === first || !focusable.includes(/** @type {HTMLElement} */ (event.target)))) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && event.target === last) { event.preventDefault(); first?.focus(); }
            }
        }, options);
    }

    async refresh() {
        if (this.refreshing) return;
        this.refreshing = true;
        const refresh = /** @type {HTMLButtonElement} */ (this.$('#refreshCatalog'));
        refresh.disabled = true;
        this.$('#appsGrid').setAttribute('aria-busy', 'true');
        try { await this.packages.refresh(); }
        catch (error) { this.message(error.message, true); }
        finally {
            this.refreshing = false;
            if (!this.disposed) { refresh.disabled = false; this.$('#appsGrid').setAttribute('aria-busy', 'false'); this.render(); }
        }
    }

    message(text, error = false) {
        if (this.disposed) return;
        const status = this.$('#storeMessage');
        status.textContent = text;
        status.dataset.error = String(error);
        status.hidden = !text;
    }

    matchesView(app, view = this.view) {
        return view === 'all' || view === 'installed' && app.installed ||
            view === 'available' && (app.canInstall || app.busy && !app.installed) || view === 'updates' && app.updateAvailable ||
            view === 'blocked' && (app.state === 'blocked' || app.state === 'incomplete');
    }

    actions(app) {
        if (app.busy) return button('pending', 'Processando…', app.id, { disabled: true });
        let markup = '';
        if (app.canOpen) markup += button('open', 'Abrir', app.id);
        if (app.canInstall) markup += button('install', 'Instalar', app.id);
        if (app.canUpdate) markup += button('install', app.state === 'incomplete' ? 'Reparar' : 'Atualizar', app.id);
        if (!app.canOpen && !app.canInstall && !app.canUpdate) markup += button('blocked', app.installed ? 'Abertura indisponível' : 'Indisponível', app.id, { disabled: true, color: 'secondary' });
        return markup;
    }

    render() {
        if (this.disposed) return;
        this.apps = this.packages.list();
        this.$('#userTierPill').textContent = `Perfil: ${this.sdk.auth.getTier()}`;
        const catalogStatus = this.$('#catalogStatus');
        catalogStatus.textContent = this.packages.getCatalogError();
        catalogStatus.hidden = !catalogStatus.textContent;
        this.$$('#storeViews [data-view]').forEach(tab => {
            tab.setAttribute('aria-pressed', String(tab.dataset.view === this.view));
            tab.querySelector('span').textContent = String(this.apps.filter(app => this.matchesView(app, tab.dataset.view)).length);
        });
        const filtered = this.apps.filter(app => this.matchesView(app) &&
            (this.category === 'all' || app.category === this.category) &&
            (!this.onlyCompatible || app.canInstall || app.canOpen || app.canUpdate || app.busy) &&
            searchText(`${app.name} ${app.summary} ${app.description} ${app.authorName}`).includes(this.searchQuery));
        this.$('#resultsCount').textContent = `${filtered.length} de ${this.apps.length} aplicativos`;
        this.$('#appsGrid').innerHTML = filtered.length ? filtered.map(app => `
            <article class="app-card" data-app-id="${escapeHtml(app.id)}">
                <div class="card-top"><span class="card-icon">${iconMarkup(app.iconName || 'package', { size: 24 })}</span>
                    <div class="card-title"><h3><button type="button" class="detail-link" data-action="details" data-app-id="${escapeHtml(app.id)}">${escapeHtml(app.name)}</button></h3>
                    <span class="card-author">${escapeHtml(app.authorName || 'unkayOS')} ${app.version ? `· v${escapeHtml(app.version)}` : ''}</span></div></div>
                <span class="status-badge" data-state="${app.state}">${labels[app.state]}</span>
                <p class="card-summary">${escapeHtml(app.summary || app.description || 'Aplicativo local.')}</p>
                <div class="card-meta">${escapeHtml(profiles[app.runtimeProfile] || 'Pacote local')}${app.installedVersion ? ` · Instalado: ${escapeHtml(app.installedVersion)}` : ''}</div>
                ${app.state === 'blocked' || app.state === 'incomplete' ? `<p class="card-reason">${escapeHtml(app.state === 'incomplete' ? 'O conteúdo executável não foi encontrado. Remova ou repare o pacote.' : app.reasons[0])}</p>` : ''}
                <div class="card-bottom"><button type="button" class="detail-link" data-action="details" data-app-id="${escapeHtml(app.id)}">Detalhes ${iconMarkup('arrow-right', { size: 14 })}</button><div class="card-actions">${this.actions(app)}</div></div>
            </article>`).join('') : `<div class="empty-state">${iconMarkup('search', { size: 32 })}<h3>Nenhum aplicativo encontrado</h3><p>Experimente outra busca, categoria ou situação.</p></div>`;
        if (this.modalAppId) this.renderModal();
    }

    async handleAction(event) {
        const target = event.target.closest('[data-action]');
        if (!target || target.disabled) return;
        const { action, appId } = target.dataset;
        if (action === 'details') { this.openDetailModal(appId); return; }
        if (action === 'uninstall') { this.renderRemoval(appId); return; }
        if (action === 'cancel-remove') { this.renderModal(); return; }
        this.message('');
        try {
            if (action === 'open') await this.packages.open(appId);
            if (action === 'install') { await this.packages.install(appId); this.message('Aplicativo instalado e disponível no menu de aplicativos.'); }
            if (action === 'confirm-remove') { await this.packages.uninstall(appId); this.message('Aplicativo removido. Os dados pessoais foram preservados.'); }
        } catch (error) { this.message(error.message, true); }
        this.render();
    }

    async importPackage(input) {
        const file = input.files?.[0];
        if (!file) return;
        try {
            if (file.size > 1024 * 1024) throw new Error('O pacote excede o limite de 1 MB.');
            await this.packages.installLocal(await file.text());
            this.message('Pacote instalado. Você já pode abri-lo pelo menu de aplicativos.');
        } catch (error) { this.message(error.message, true); }
        finally { input.value = ''; this.render(); }
    }

    openDetailModal(id) {
        this.previousFocus = /** @type {HTMLElement} */ (document.activeElement);
        this.modalAppId = id;
        this.$('#storeMain').inert = true;
        this.$('#appDetailModal').hidden = false;
        this.renderModal();
        this.$('#modalCloseBtn').focus();
    }

    renderModal() {
        const app = this.apps.find(item => item.id === this.modalAppId);
        if (!app) { this.closeModal(); return; }
        this.$('#modalBody').innerHTML = `
            <span class="detail-icon">${iconMarkup(app.iconName || 'package', { size: 32 })}</span>
            <h2 id="storeDetailTitle">${escapeHtml(app.name)}</h2>
            <p class="detail-author">${escapeHtml(app.authorName || 'unkayOS')}</p>
            <span class="status-badge" data-state="${app.state}">${labels[app.state]}</span>
            <p class="detail-description">${escapeHtml(app.description || app.summary || 'Aplicativo incluído no unkayOS.')}</p>
            <dl class="detail-metadata"><div><dt>Versão instalada</dt><dd>${escapeHtml(app.installedVersion || (app.system ? 'Incluída no sistema' : 'Não instalado'))}</dd></div>
            <div><dt>Versão no catálogo</dt><dd>${escapeHtml(app.version || '—')}</dd></div>
            <div><dt>Execução</dt><dd>${escapeHtml(profiles[app.runtimeProfile] || 'Desconhecida')}</dd></div>
            <div><dt>Perfil necessário</dt><dd>${escapeHtml(app.requiredTier || 'guest')}</dd></div></dl>
            <div class="detail-permissions"><h3>Permissões declaradas</h3><p>${escapeHtml(app.permissions?.length ? app.permissions.join(', ') : 'Nenhuma')}</p></div>
            ${app.state === 'incomplete' ? `<p class="detail-warning">Instalação incompleta: ${escapeHtml(app.localError || 'Faltam arquivos executáveis. Remova ou repare o pacote.')}</p>` : ''}
            ${app.reasons?.length ? `<div class="detail-warning"><h3>Restrições de instalação</h3><ul>${app.reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join('')}</ul></div>` : ''}
            ${app.system ? '<p class="detail-note">Este aplicativo faz parte do unkayOS e é atualizado junto com o sistema.</p>' : ''}
            <div id="removalPrompt"></div><div class="detail-actions">${app.canUninstall ? button('uninstall', 'Remover', app.id, { color: 'danger' }) : ''}<div class="card-actions">${this.actions(app)}</div></div>`;
    }

    renderRemoval(id) {
        this.$('#removalPrompt').innerHTML = `<div class="detail-warning"><p>Remover este aplicativo? As janelas abertas serão fechadas. Seus dados serão preservados.</p><div class="card-actions">${button('cancel-remove', 'Cancelar', id, { color: 'secondary' })}${button('confirm-remove', 'Confirmar remoção', id, { color: 'danger' })}</div></div>`;
        this.$('#removalPrompt [data-action="cancel-remove"]').focus();
    }

    closeModal() {
        const id = this.modalAppId;
        this.modalAppId = null;
        this.$('#appDetailModal').hidden = true;
        this.$('#storeMain').inert = false;
        if (this.previousFocus?.isConnected) this.previousFocus.focus();
        else [...this.$$('[data-action="details"]')].find(button => button.dataset.appId === id)?.focus();
    }

    async onCleanup() {
        this.disposed = true;
        this.controller?.abort();
        this.unsubscribe?.();
    }
}
