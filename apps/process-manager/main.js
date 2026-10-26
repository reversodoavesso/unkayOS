import eventBus from '../../core/eventBus.js';
import { BaseApp } from '../../core/BaseApp.js';

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

    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', () => this.renderTable());
      if (!this.refreshBtn.querySelector('rda-icon')) {
        this.refreshBtn.innerHTML = "<rda-icon name=\"refresh-cw\" size=\"20\" aria-label=\"Atualizar\" title=\"Atualizar\"></rda-icon>";
      }
    }

    if (this.tableBody) {
      this.tableBody.addEventListener('click', (e) => this.handleTableClick(e));
    }

    eventBus.on('app:started', () => this.renderTable());
    eventBus.on('app:stopped', () => this.renderTable());

    this.renderTable();
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

  handleTableClick(e) {
    const btn = e.target.closest('.action-btn');
    if (btn && !btn.disabled) {
      const instanceId = btn.dataset.instance;
      if (instanceId) {
        eventBus.emit('app:stop', { instanceId });
        setTimeout(() => this.renderTable(), 200);
      }
    }
  }

  onCleanup() {
    // Exemplo de limpeza de listeners se necessário
    if (this.refreshBtn) {
      this.refreshBtn.replaceWith(this.refreshBtn.cloneNode(true));
    }
    if (this.tableBody) {
      this.tableBody.replaceWith(this.tableBody.cloneNode(true));
    }
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

