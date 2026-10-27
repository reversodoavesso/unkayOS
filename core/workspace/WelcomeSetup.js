import { workspaceIcon } from '../deployment.js';
import { iconMarkup } from '../ui/designSystem.js';
import { shouldAdaptWallpaper } from '../ui/wallpaperAppearance.js';
import { applyWallpaperStyle, resolveEffectiveRemapParams } from '../utils/appPreferences.js';
import { accentChoices, escapeHtml, WALLPAPERS } from './preferences.js';

const STEPS = ['Bem-vindo', 'Aparência', 'Navegação', 'Widgets'];
export class WelcomeSetup {
  constructor(session) { this.session = session; }

  show() {
    if (this.dialog?.open) return;
    this.draft = structuredClone(this.session.settings);
    this.step = 0; this.committed = false; this.authMessage = ''; this.status = '';
    this.previousFocus = document.activeElement;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'rda-dialog workspace-setup';
    this.dialog.setAttribute('aria-labelledby', 'setupTitle');
    this.session.desktop.appendChild(this.dialog);
    this.controller = new AbortController();
    const options = { signal: this.controller.signal };
    this.dialog.addEventListener('click', event => this.click(event), options);
    this.dialog.addEventListener('input', event => {
      if (event.target instanceof HTMLInputElement && event.target.id === 'setupName') this.draft.onboarding.displayName = event.target.value.slice(0, 40);
    }, options);
    this.dialog.addEventListener('change', event => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement)) return;
      if (field.id === 'setupWidgetsEnabled') this.draft.widgets.enabled = field.checked;
      if (field.dataset.startup) {
        const ids = this.draft.widgets.startup.filter(id => id !== field.dataset.startup);
        if (field.checked) ids.push(field.dataset.startup);
        this.draft.widgets.startup = ids;
      }
    }, options);
    this.dialog.addEventListener('close', () => this.closed(), { once: true });
    this.authChanged = () => { if (this.dialog?.open) this.render(); };
    this.authError = error => { this.authMessage = error.message || 'Não foi possível entrar agora. Você pode continuar neste dispositivo.'; this.render(); };
    this.session.auth?.on('change', this.authChanged);
    this.session.auth?.on('login_error', this.authError);
    this.render(); this.dialog.showModal();
    this.dialog.querySelector('h1')?.focus();
  }

  render(focusSelector) {
    const e = escapeHtml, authUser = this.session.auth?.getCurrentUser();
    let body;
    if (this.step === 0) {
      body = `<span class="workspace-eyebrow">UM ESPAÇO QUE É SEU</span><h1 id="setupTitle" tabindex="-1">Seu ritmo.<br>Seu próximo movimento.</h1><p class="setup-lead">Um lugar para explorar, criar e organizar suas ideias. Vamos deixar o Unkayos com a sua cara.</p>
        <label class="rda-form-field"><span class="rda-label">Como quer ser chamado?</span><input id="setupName" class="rda-input rda-input--lg" maxlength="40" value="${e(this.draft.onboarding.displayName)}" placeholder="Seu nome, se quiser" autocomplete="nickname"></label>
        <div class="setup-account"><span class="setup-account__icon">${iconMarkup(authUser ? 'circle-check' : 'user', { size: 24 })}</span><div><strong>${authUser ? e(authUser.name || authUser.preferred_username || 'Conta conectada') : 'Comece aqui. Conecte-se quando quiser.'}</strong><p>${authUser ? 'Sua conta RDA está conectada.' : 'Use neste dispositivo ou entre com sua conta RDA. Você pode decidir depois.'}</p></div>${!authUser ? '<button type="button" class="rda-button rda-button--md" data-color="secondary" data-setup="login">Entrar com RDA</button>' : ''}</div><p role="status">${e(this.authMessage)}</p>`;
    } else if (this.step === 1) {
      body = `<span class="workspace-eyebrow">LUZ, COR E ATMOSFERA</span><h1 id="setupTitle" tabindex="-1">Faça este espaço<br>parecer seu.</h1><p class="setup-lead">Escolha uma base para começar. Tudo continua disponível nas configurações.</p>
        <div class="setup-two-options">${['dark', 'light'].map(theme => `<button type="button" class="setup-choice" data-theme-choice="${theme}" aria-pressed="${this.draft.appearance.theme === theme}"><span class="setup-theme-sample" data-theme="${theme}"><span></span><i></i><i></i></span><strong>${theme === 'dark' ? 'Escuro' : 'Claro'}</strong></button>`).join('')}</div>
        <h2 class="setup-label">Seu ponto de cor</h2><div class="accent-presets">${accentChoices(this.draft.appearance.accent)}</div>
        <h2 class="setup-label">Pano de fundo</h2><div class="setup-wallpapers">${WALLPAPERS.map((wallpaper, index) => `<button type="button" class="setup-wallpaper" data-wallpaper="${index}" aria-pressed="${wallpaper.value === this.draft.appearance.wallpaper}"><span>${wallpaper.name}</span></button>`).join('')}</div>`;
    } else if (this.step === 2) {
      body = `<span class="workspace-eyebrow">UM JEITO DE CHEGAR ÀS IDEIAS</span><h1 id="setupTitle" tabindex="-1">À mão.<br>Sem ocupar o seu espaço.</h1><p class="setup-lead">A trilha reúne seus atalhos e o que está em curso. O painel de apps abre espaço para descobrir o restante.</p>
        <h2 class="setup-label">Barra de aplicativos</h2><div class="setup-two-options">${[['floating', 'Trilha flutuante', 'Leve, com atalhos e apps em curso.'], ['edge', 'Barra de borda', 'Uma linha contínua no limite da tela.']].map(([id, title, text]) => `<button type="button" class="setup-choice" data-bar="${id}" aria-pressed="${this.draft.shell.bar === id}"><span class="setup-shell-sample" data-sample-bar="${id}"><i></i><i></i><i></i></span><strong>${title}</strong><span>${text}</span></button>`).join('')}</div>
        <h2 class="setup-label">Menu de aplicativos</h2><div class="setup-two-options">${[['atlas', 'Painel amplo', 'Categorias, favoritos e espaço para explorar.'], ['compact', 'Lista compacta', 'Busca direta e resultados em uma coluna.']].map(([id, title, text]) => `<button type="button" class="setup-choice" data-launcher="${id}" aria-pressed="${this.draft.shell.launcher === id}"><strong>${title}</strong><span>${text}</span></button>`).join('')}</div><p class="setup-hint">${iconMarkup('search', { size: 16 })} Abra seus apps a qualquer momento com <kbd>Ctrl</kbd> + <kbd>Espaço</kbd>.</p>`;
    } else {
      body = `<span class="workspace-eyebrow">SÓ O QUE IMPORTA AGORA</span><h1 id="setupTitle" tabindex="-1">Informação perto.<br>Ideias livres.</h1><p class="setup-lead">Widgets vivem em uma faixa discreta do desktop. Carregue apenas o que ajuda no seu dia.</p>
        <label class="setup-checkbox"><input id="setupWidgetsEnabled" type="checkbox" class="rda-checkbox-native" ${this.draft.widgets.enabled ? 'checked' : ''}><span><strong>Mostrar widgets na área de trabalho</strong><small>Você pode ocultar todos a qualquer momento.</small></span></label>
        <div class="setup-widget-options">${this.session.widgets.catalog().map(widget => `<label class="setup-checkbox">${iconMarkup(widget.icon, { size: 24 })}<span><strong>${e(widget.title)}</strong><small>Carregar ao entrar no Unkayos</small></span><input type="checkbox" class="rda-checkbox-native" data-startup="${e(widget.id)}" ${this.draft.widgets.startup.includes(widget.id) ? 'checked' : ''}></label>`).join('')}</div>
        <p class="setup-hint">Depois, importe notas e coleções de links em Configurações → Widgets.</p>`;
    }
    this.dialog.innerHTML = `<aside class="setup-story"><div class="workspace-wordmark">${iconMarkup(workspaceIcon, { size: 28 })}<span>unkay<span>OS</span></span></div><ol>${STEPS.map((label, index) => `<li ${index === this.step ? 'aria-current="step"' : ''}><span>${index < this.step ? iconMarkup('check', { size: 14 }) : String(index + 1).padStart(2, '0')}</span>${label}</li>`).join('')}</ol><p>Menos ruído.<br>Mais espaço para o que vem.</p><span class="setup-story__orbit" aria-hidden="true"></span></aside>
      <section class="setup-main"><div class="setup-body">${body}</div><p class="setup-error" role="alert">${e(this.status)}</p><footer class="setup-footer"><button type="button" class="rda-button rda-button--md" data-color="ghost" data-setup="${this.step ? 'back' : 'skip'}">${this.step ? 'Voltar' : 'Pular por enquanto'}</button><span>${this.step + 1} de ${STEPS.length}</span><button type="button" class="rda-button rda-button--lg" data-color="primary" data-setup="next">${this.step === 3 ? 'Entrar no meu espaço' : 'Continuar'}${iconMarkup('arrow-right', { size: 18 })}</button></footer></section>`;
    this.dialog.querySelectorAll('button[data-wallpaper]').forEach(button => {
      const wallpaper = WALLPAPERS[Number(button.getAttribute('data-wallpaper'))].value;
      applyWallpaperStyle(button, wallpaper, { ...resolveEffectiveRemapParams(this.draft.appearance, wallpaper), adaptToAccent: shouldAdaptWallpaper(this.draft.appearance), maxDimension: 420 });
    });
    if (focusSelector) this.dialog.querySelector(focusSelector)?.focus();
  }

  async click(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    const { setup, accent, themeChoice, wallpaper, bar, launcher } = button.dataset;
    if (setup === 'login') {
      button.disabled = true;
      try { await this.session.auth.login(); this.authMessage = 'Janela de login aberta. Você pode continuar a configuração enquanto se conecta.'; }
      catch (error) { this.authMessage = error.message; }
      this.render('[data-setup="login"]'); return;
    }
    if (setup === 'back') { this.step--; this.status = ''; this.render(); this.dialog.querySelector('h1')?.focus(); return; }
    if (setup === 'skip' || (setup === 'next' && this.step === 3)) { await this.complete(button); return; }
    if (setup === 'next') { this.step++; this.status = ''; this.render(); this.dialog.querySelector('h1')?.focus(); return; }
    let selector;
    if (accent) { this.draft.appearance.accent = accent; selector = `[data-accent="${accent}"]`; }
    if (themeChoice) { this.draft.appearance.theme = themeChoice; selector = `[data-theme-choice="${themeChoice}"]`; }
    if (wallpaper !== undefined) { this.draft.appearance.wallpaper = WALLPAPERS[Number(wallpaper)].value; selector = `[data-wallpaper="${wallpaper}"]`; }
    if (bar) { this.draft.shell.bar = bar; selector = `[data-bar="${bar}"]`; }
    if (launcher) { this.draft.shell.launcher = launcher; selector = `[data-launcher="${launcher}"]`; }
    if (selector) { this.session.apply(this.draft); this.render(selector); }
  }

  async complete(button) {
    button.disabled = true;
    try {
      this.draft.onboarding = { ...this.draft.onboarding, displayName: this.draft.onboarding.displayName.trim(), version: 1, completedAt: new Date().toISOString() };
      await this.session.update(this.draft);
      if (this.draft.widgets.enabled) {
        for (const id of [...this.session.widgets.active.keys()]) if (!this.draft.widgets.startup.includes(id)) await this.session.widgets.hide(id);
        for (const id of this.draft.widgets.startup) await this.session.widgets.show(id);
      }
      this.committed = true; this.dialog.close();
    } catch (error) { this.status = error.message; this.render(); }
  }

  closed() {
    if (!this.committed) this.session.apply();
    this.session.auth?.off('change', this.authChanged);
    this.session.auth?.off('login_error', this.authError);
    this.controller?.abort(); this.dialog?.remove(); this.dialog = null;
    if (this.previousFocus instanceof HTMLElement && this.previousFocus.isConnected) this.previousFocus.focus();
  }
  destroy() { if (this.dialog?.open) this.dialog.close(); if (this.dialog) this.closed(); }
}
