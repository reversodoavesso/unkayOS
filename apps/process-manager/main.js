import eventBus from '../../core/eventBus.js';
import { BaseApp } from '../../core/BaseApp.js';

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

export default class ProcessManagerApp extends BaseApp {
  constructor(appCore, apis) {
    super(appCore, apis);
    this.appCore = appCore;
    this.apis = apis;
  }

  onRun() {
    // Usar utilitários padronizados para acesso ao DOM local
    this.tableBody = this.$('#processTable tbody');
    this.emptyMsg = this.$('#emptyMsg');
    this.refreshBtn = this.$('#refreshBtn');
    this.kernelSummary = this.$('#kernelSummary');
    this.kernelFeatures = this.$('#kernelFeatures');

    this.refresh = () => {
      this.renderTable();
      this.renderKernel();
    };

    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', this.refresh);
      if (!this.refreshBtn.querySelector('rda-icon')) {
        this.refreshBtn.innerHTML = "<rda-icon name=\"refresh-cw\" size=\"20\" aria-label=\"Atualizar\" title=\"Atualizar\"></rda-icon>";
      }
    }

    if (this.tableBody) {
      this.tableBody.addEventListener('click', (e) => this.handleTableClick(e));
    }

    eventBus.on('app:started', this.refresh);
    eventBus.on('app:stopped', this.refresh);
    eventBus.on('apps:catalog:changed', this.refresh);
    eventBus.on('packages:changed', this.refresh);
    eventBus.on('kernel:ready', this.refresh);

    this.refresh();
  }

  getRunningApps() {
    const appManager = window.appManager;
    if (!appManager || !appManager.runningApps) return [];
    const apps = [];
    for (const [instanceId, appInfo] of appManager.runningApps.entries()) {
      if (!appInfo || !appInfo.CORE) continue;
      const core = appInfo.CORE;
      apps.push({
        instanceId,
        appId: core.id,
        appName: core.app_name,
        mode: core.mode,
        status: appInfo.UI && appInfo.UI.isMinimized ? 'Minimizado' : 'Ativo',
        canStop: core.mode !== 'desktop_ui',
      });
    }
    return apps;
  }

  renderTable() {
    const apps = this.getRunningApps();
    if (this.tableBody) {
      this.tableBody.innerHTML = apps.length === 0
        ? ''
        : apps.map(app => this.renderRow(app)).join('');
    }
    if (this.emptyMsg) {
      this.emptyMsg.style.display = apps.length === 0 ? 'block' : 'none';
    }
  }

  renderRow(app) {
    return `
      <tr>
        <td>${app.appName}</td>
        <td>${app.mode}</td>
        <td>${app.instanceId}</td>
        <td>${app.status}</td>
        <td>
          <button class="action-btn" data-instance="${app.instanceId}" ${!app.canStop ? 'disabled' : ''} aria-label="Parar processo" title="Parar processo">
            <rda-icon name="circle-stop" size="20"></rda-icon>
          </button>
        </td>
      </tr>
    `;
  }

  renderKernel() {
    if (!this.kernelSummary || !this.kernelFeatures) return;
    const kernel = /** @type {any} */ (window).systemManager?.kernel;
    if (!kernel) {
      this.kernelSummary.textContent = 'Kernel indisponível nesta sessão.';
      this.kernelFeatures.innerHTML = '';
      return;
    }

    const description = kernel.describe();
    const running = description.features.filter(feature => feature.running).length;
    const profile = /** @type {any} */ (window).systemManager?.getSystem?.('hostProfile')?.id || 'rda';
    this.kernelSummary.innerHTML = `
      <span class="kernel-stat"><strong>${escapeHtml(profile)}</strong> perfil</span>
      <span class="kernel-stat"><strong>${escapeHtml(description.state)}</strong> estado</span>
      <span class="kernel-stat"><strong>${running}/${description.features.length}</strong> features</span>
      <span class="kernel-stat"><strong>${description.capabilities.length}</strong> capacidades</span>
    `;

    this.kernelFeatures.innerHTML = description.features.map(feature => `
      <article class="kernel-feature ${feature.running ? 'is-running' : ''}">
        <span class="kernel-dot" aria-hidden="true"></span>
        <div class="kernel-copy">
          <strong>${escapeHtml(feature.id)}</strong>
          <small>${feature.provides.map(capability => escapeHtml(capability)).join(' · ')}</small>
        </div>
        <span class="kernel-version">v${escapeHtml(feature.version)}</span>
      </article>
    `).join('');
  }

  handleTableClick(e) {
    const btn = e.target.closest('.action-btn');
    if (btn && !btn.disabled) {
      const instanceId = btn.dataset.instance;
      if (instanceId) {
        eventBus.emit('app:stop', { instanceId });
        setTimeout(() => this.refresh(), 200);
      }
    }
  }

  async onCleanup() {
    eventBus.off('app:started', this.refresh);
    eventBus.off('app:stopped', this.refresh);
    eventBus.off('apps:catalog:changed', this.refresh);
    eventBus.off('packages:changed', this.refresh);
    eventBus.off('kernel:ready', this.refresh);
    if (this.refreshBtn) {
      this.refreshBtn.replaceWith(this.refreshBtn.cloneNode(true));
    }
    if (this.tableBody) {
      this.tableBody.replaceWith(this.tableBody.cloneNode(true));
    }
    await super.onCleanup();
  }

  static runCli(args, writeLine) {
    if (args.includes('--help') || args.includes('-h')) {
        writeLine('Uso: process-manager [--help]\nGerencia os processos/apps em execução.');
        return;
    }
    window.appManager?.runApp('process-manager');
    writeLine('Gerenciador de processos iniciado.');
  }
}
