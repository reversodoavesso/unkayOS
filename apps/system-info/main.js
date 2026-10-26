import { BaseApp } from '../../core/BaseApp.js';
import { currentRelease } from '../../core/release-info.js';
export default class SystemInfoApp extends BaseApp {
  onRun() {
    this.startedAt = Date.now();
    const update = () => {
      this.$('#osInfo').textContent = `${currentRelease.version} · #${currentRelease.number}`;
      this.$('#activeApps').textContent = String([...window.appManager.runningApps.values()].filter(app => app.CORE.mode === 'system_window').length);
      const seconds = Math.floor((Date.now() - this.startedAt) / 1000);
      this.$('#uptime').textContent = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
    };
    update(); this.infoTimer = this.setInterval(update, 1000);
  }
  async onCleanup() { this.clearInterval(this.infoTimer); }
  static runCli(args, writeLine) { window.appManager?.runApp('system-info'); writeLine('Informações carregadas.'); }
}
