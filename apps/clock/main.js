import { BaseApp } from '../../core/BaseApp.js';
export default class ClockApp extends BaseApp {
  onRun() {
    const update = () => {
      const now = new Date();
      this.$('#clockTime').textContent = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(now);
      this.$('#clockDate').textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
    };
    update(); this.clockTimer = this.setInterval(update, 1000);
  }
  async onCleanup() { this.clearInterval(this.clockTimer); }
  static runCli(args, writeLine) { window.appManager?.runApp('clock'); writeLine('Relógio carregado.'); }
}
