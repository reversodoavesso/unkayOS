// apps/settings/main.js - Configurações Gerais do Sistema unkayOS 2.0

import { BaseApp } from '../../core/BaseApp.js';
import { currentRelease } from '../../core/release-info.js';
import { renderReleaseNotes } from '../../core/ui/releaseNotes.js';
import eventBus from '../../core/eventBus.js';
import { accentPresets, iconMarkup } from '../../core/ui/designSystem.js';
import { readPreferences, writePreferences, applyAppearance, applyWallpaperStyle, applyWindowing, clearTemporaryFiles, normalizeAppearance } from '../../core/utils/appPreferences.js';
import { getWorkspace } from '../../core/workspace/WorkspaceSession.js';
import { normalizeWorkspace, changedSettings, applyShell, accentChoices, WALLPAPERS, validateWidget, WIDGET_EXAMPLE, escapeHtml } from '../../core/workspace/preferences.js';

export default class SettingsApp extends BaseApp {
  static get parameters() {
    return {
      panel: {
        type: 'string',
        required: false,
        description: 'Painel de configurações a ser exibido inicialmente (appearance, windowing, storage, services, security, about)'
      }
    };
  }

  constructor(CORE, standardAPIs, appContentRoot = null, desktopElement = null) {
    super(CORE, standardAPIs, appContentRoot, desktopElement);
    this.fileSystem = this.wasmFileSystem || this.fileSystem;

    this.settingsConfigPath = '/etc/unkay-settings.json';

    this.systemSettings = {
      appearance: normalizeAppearance(),
      windowing: {
        aeroSnap: true,
        centerWindows: true,
        taskbarPosition: 'bottom',
        autoHideTaskbar: false
      },
      storage: {
        minioUrl: 'http://localhost:9000',
        minioBucket: 'unkayos-storage'
      },
      network: {
        offlineMode: false
      },
      security: {
        strictSandbox: true,
        secureHostDrop: true
      }
    };

    // Bindings
    this.handleWallpaperClick = this.handleWallpaperClick.bind(this);
    this.handleThemeChange = this.handleThemeChange.bind(this);
  }

  handleNavClick(panelId) {
    this.switchPanel(panelId);
  }

  async onRun(terminalOutputCallback = null, appParams = {}) {
    const versionLabel = this.$('[data-system-version]');
    if (versionLabel) versionLabel.textContent = `v${currentRelease.version} · Release ${currentRelease.number}`;
    renderReleaseNotes(this.$('[data-release-notes]'));
    console.log(`[SettingsApp - ${this.instanceId}] Inicializando Painel de Configurações...`);

    // Elementos da barra de navegação
    this.sidebarNav = this.$('.sidebar-nav');
    this.settingsSearchInput = this.$('#settingsSearchInput');

    const accentPicker = this.$('#accentPicker');
    if (accentPicker) {
      accentPicker.innerHTML = accentChoices(this.systemSettings.appearance.accent);
      accentPicker.addEventListener('click', async event => {
        if (!(event.target instanceof Element)) return;
        const button = event.target.closest('[data-accent]');
        if (!(button instanceof HTMLElement)) return;
        this.systemSettings.appearance.accent = button.dataset.accent;
        if (await this.saveSettings()) this.syncUiWithSettings();
      });
    }

    // Controles de Aparência
    const wallpaperPicker = this.$('#wallpaperPicker');
    if (wallpaperPicker) wallpaperPicker.innerHTML = WALLPAPERS.map(wp => `<button type="button" class="wallpaper-thumb" data-wp="${escapeHtml(wp.value)}" aria-pressed="false"><span class="wp-label">${wp.name}</span></button>`).join('');
    this.wallpaperThumbs = this.$$('.wallpaper-thumb');
    this.customWallpaperUrl = this.$('#customWallpaperUrl');
    this.applyCustomWallpaperBtn = this.$('#applyCustomWallpaperBtn');
    this.toggleGlassmorphism = this.$('#toggleGlassmorphism');
    this.selectFontScale = this.$('#selectFontScale');

    // Controles de Janelas & Desktop
    this.toggleAeroSnap = this.$('#toggleAeroSnap');
    this.toggleCenterWindows = this.$('#toggleCenterWindows');
    this.selectTaskbarPosition = this.$('#selectTaskbarPosition');
    this.toggleAutoHideTaskbar = this.$('#toggleAutoHideTaskbar');

    // Controles de Armazenamento
    this.inputMinioUrl = this.$('#inputMinioUrl');
    this.inputMinioBucket = this.$('#inputMinioBucket');
    this.syncMinioNowBtn = this.$('#syncMinioNowBtn');
    this.exportBackupBtn = this.$('#exportBackupBtn');
    this.cleanTmpBtn = this.$('#cleanTmpBtn');

    // Controles de Rede & Serviços
    this.computeLatency = this.$('#computeLatency');
    this.authLatency = this.$('#authLatency');
    this.userLatency = this.$('#userLatency');
    this.checkServicesHealthBtn = this.$('#checkServicesHealthBtn');
    this.toggleOfflineMode = this.$('#toggleOfflineMode');

    // Controles de Segurança
    this.toggleStrictSandbox = this.$('#toggleStrictSandbox');
    this.toggleSecureHostDrop = this.$('#toggleSecureHostDrop');

    // Controles da aba Sobre
    this.checkUpdatesBtn = this.$('#checkUpdatesBtn');
    this.resetAllSettingsBtn = this.$('#resetAllSettingsBtn');

    // Registra listeners
    this.registerEventListeners();

    // Carrega configurações persistidas
    await this.loadSettings();
    this.bindWorkspaceSettings();

    // Executa verificação inicial de saúde dos microsserviços
    this.checkServicesHealth();

    // Infrastructure policy is enforced by the gateway and the sandbox.
    for (const control of [this.inputMinioUrl, this.inputMinioBucket, this.toggleStrictSandbox, this.toggleSecureHostDrop, this.toggleOfflineMode]) {
      if (control) {
        control.disabled = true;
        control.title = 'Configuração gerenciada pelo sistema e pelo gateway RDA.';
      }
    }

    // Ativa painel solicitado por parâmetro se houver
    if (appParams.panel) {
      this.switchPanel(appParams.panel);
    }
  }

  registerEventListeners() {
    // Navegação entre painéis
    const navItems = this.$$('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const panel = item.getAttribute('data-panel');
        if (panel) this.switchPanel(panel);
      });
    });

    // Busca de configurações
    if (this.settingsSearchInput) {
      this.settingsSearchInput.addEventListener('input', (e) => {
        this.filterSettings(e.target.value.toLowerCase());
      });
    }

    // Seletor de Tema (Dark / Light)
    const themeOptions = this.$$('.theme-option');
    themeOptions.forEach(opt => {
      opt.addEventListener('click', () => {
        const theme = opt.getAttribute('data-theme');
        if (theme) this.handleThemeChange(theme);
      });
    });

    // Wallpapers
    this.wallpaperThumbs.forEach(thumb => {
      applyWallpaperStyle(thumb, thumb.getAttribute('data-wp'));
      thumb.addEventListener('click', () => {
        const wp = thumb.getAttribute('data-wp');
        if (wp) this.handleWallpaperClick(wp);
      });
    });

    if (this.applyCustomWallpaperBtn && this.customWallpaperUrl) {
      this.applyCustomWallpaperBtn.addEventListener('click', () => {
        const url = this.customWallpaperUrl.value.trim();
        if (url) this.handleWallpaperClick(url);
      });
    }

    // Efeitos Visuais & Tipografia
    if (this.toggleGlassmorphism) {
      this.toggleGlassmorphism.addEventListener('change', (e) => {
        this.systemSettings.appearance.glassmorphism = e.target.checked;
        this.saveSettings();
      });
    }
    if (this.selectFontScale) {
      this.selectFontScale.addEventListener('change', (e) => {
        this.systemSettings.appearance.fontScale = e.target.value;
        this.saveSettings();
      });
    }

    // Janelas & Desktop
    if (this.toggleAeroSnap) {
      this.toggleAeroSnap.addEventListener('change', (e) => {
        this.systemSettings.windowing.aeroSnap = e.target.checked;
        this.saveSettings();
      });
    }
    if (this.toggleCenterWindows) {
      this.toggleCenterWindows.addEventListener('change', (e) => {
        this.systemSettings.windowing.centerWindows = e.target.checked;
        this.saveSettings();
      });
    }
    if (this.selectTaskbarPosition) {
      this.selectTaskbarPosition.addEventListener('change', (e) => {
        this.systemSettings.windowing.taskbarPosition = e.target.value;
        this.saveSettings();
        eventBus.emit('taskbar:position_changed', { position: e.target.value });
      });
    }
    if (this.toggleAutoHideTaskbar) {
      this.toggleAutoHideTaskbar.addEventListener('change', (e) => {
        this.systemSettings.windowing.autoHideTaskbar = e.target.checked;
        this.saveSettings();
      });
    }

    // Armazenamento
    if (this.syncMinioNowBtn) {
      this.syncMinioNowBtn.addEventListener('click', async () => {
        this.syncMinioNowBtn.disabled = true;
        try {
          const { minioSyncDriver } = await import('../../core/sync/MinioSyncDriver.js');
          const result = await minioSyncDriver.sync();
          this.showToast(result.success ? 'Sincronização concluída.' : result.reason || 'Falha na sincronização.');
        } catch (error) { this.showToast(`Erro na sincronização: ${error.message}`); }
        finally { this.syncMinioNowBtn.disabled = false; }
      });
    }
    if (this.exportBackupBtn) {
      this.exportBackupBtn.addEventListener('click', () => {
        this.exportVfsBackup();
      });
    }
    if (this.cleanTmpBtn) {
      this.cleanTmpBtn.addEventListener('click', () => {
        this.cleanTmp();
      });
    }

    // Rede & Serviços
    if (this.checkServicesHealthBtn) {
      this.checkServicesHealthBtn.addEventListener('click', () => {
        this.checkServicesHealth();
      });
    }
    if (this.toggleOfflineMode) {
      this.toggleOfflineMode.addEventListener('change', (e) => {
        this.systemSettings.network.offlineMode = e.target.checked;
        this.saveSettings();
        this.showToast(e.target.checked ? 'Modo Offline Ativado.' : 'Modo Online Restaurado.');
      });
    }

    // Segurança
    if (this.toggleStrictSandbox) {
      this.toggleStrictSandbox.addEventListener('change', (e) => {
        this.systemSettings.security.strictSandbox = e.target.checked;
        this.saveSettings();
      });
    }
    if (this.toggleSecureHostDrop) {
      this.toggleSecureHostDrop.addEventListener('change', (e) => {
        this.systemSettings.security.secureHostDrop = e.target.checked;
        this.saveSettings();
      });
    }

    // Sobre
    if (this.checkUpdatesBtn) {
      this.checkUpdatesBtn.addEventListener('click', () => {
        this.appManager?.runApp('about');
      });
    }
    if (this.resetAllSettingsBtn) {
      this.resetAllSettingsBtn.addEventListener('click', () => {
        this.resetAllSettings();
      });
    }
  }

  switchPanel(panelId) {
    const navItems = this.$$('.nav-item');
    navItems.forEach(item => {
      if (item.getAttribute('data-panel') === panelId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    const panels = {
      workspace: this.$('#panelWorkspace'),
      widgets: this.$('#panelWidgets'),
      appearance: this.$('#panelAppearance'),
      windowing: this.$('#panelWindowing'),
      storage: this.$('#panelStorage'),
      services: this.$('#panelServices'),
      security: this.$('#panelSecurity'),
      about: this.$('#panelAbout')
    };

    Object.entries(panels).forEach(([id, panel]) => {
      if (panel) {
        panel.style.display = id === panelId ? 'flex' : 'none';
      }
    });
  }

  filterSettings(query) {
    if (!query) {
      this.$$('.settings-card').forEach(c => c.style.display = 'flex');
      return;
    }

    this.$$('.settings-card').forEach(card => {
      const text = card.textContent.toLowerCase();
      if (text.includes(query)) {
        card.style.display = 'flex';
      } else {
        card.style.display = 'none';
      }
    });
  }

  async handleThemeChange(theme) {
    this.systemSettings.appearance.theme = theme;

    this.$$('.theme-option').forEach(opt => {
      if (opt.getAttribute('data-theme') === theme) {
        opt.classList.add('active');
      } else {
        opt.classList.remove('active');
      }
    });

    if (!await this.saveSettings()) return;
    this.showToast(`Tema alterado para: ${theme === 'dark' ? 'Escuro Obsidian' : 'Claro'}`);
  }

  async handleWallpaperClick(wp) {
    this.systemSettings.appearance.wallpaper = wp;
    if (!await this.saveSettings()) return;
    this.syncUiWithSettings();
    this.showToast('Papel de parede aplicado!');
  }

  async loadSettings() {
    const loaded = getWorkspace()?.settings || await readPreferences(this.fileSystem, this.settingsConfigPath, 'unkayos_system_settings');

    if (loaded) {
      this.systemSettings = {
        ...this.systemSettings,
        ...loaded,
        appearance: normalizeAppearance({ ...this.systemSettings.appearance, ...(loaded.appearance || {}) }),
        windowing: { ...this.systemSettings.windowing, ...(loaded.windowing || {}) },
        storage: { ...this.systemSettings.storage, ...(loaded.storage || {}) },
        network: { ...this.systemSettings.network, ...(loaded.network || {}) },
        security: { ...this.systemSettings.security, ...(loaded.security || {}) }
      };
    }

    this.systemSettings = normalizeWorkspace(this.systemSettings);
    this.lastSnapshot = structuredClone(this.systemSettings);
    this.syncUiWithSettings();
    this.applySettingsRealtime();
  }

  syncUiWithSettings() {
    const { appearance, windowing, storage, network, security } = this.systemSettings;

    this.$$('[data-accent]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.accent === appearance.accent)));
    const accentName = this.$('#selectedAccentName');
    if (accentName) accentName.textContent = `Selecionada: ${accentPresets[appearance.accent].label}`;
    // Aparência
    this.$$('.theme-option').forEach(opt => {
      opt.classList.toggle('active', opt.getAttribute('data-theme') === appearance.theme);
    });
    this.wallpaperThumbs.forEach(thumb => {
      const selected = thumb.getAttribute('data-wp') === appearance.wallpaper;
      thumb.classList.toggle('active', selected);
      thumb.setAttribute('aria-pressed', String(selected));
    });
    if (this.toggleGlassmorphism) this.toggleGlassmorphism.checked = appearance.glassmorphism;
    if (this.selectFontScale) this.selectFontScale.value = appearance.fontScale;

    // Janelas
    if (this.toggleAeroSnap) this.toggleAeroSnap.checked = windowing.aeroSnap;
    if (this.toggleCenterWindows) this.toggleCenterWindows.checked = windowing.centerWindows;
    if (this.selectTaskbarPosition) this.selectTaskbarPosition.value = windowing.taskbarPosition;
    if (this.toggleAutoHideTaskbar) this.toggleAutoHideTaskbar.checked = windowing.autoHideTaskbar;
    const shellBar = /** @type {HTMLSelectElement} */ (this.$('#selectShellBar')), launcher = /** @type {HTMLSelectElement} */ (this.$('#selectShellLauncher')), displayName = /** @type {HTMLInputElement} */ (this.$('#workspaceDisplayName')), widgetsEnabled = /** @type {HTMLInputElement} */ (this.$('#widgetsEnabled'));
    if (shellBar) shellBar.value = this.systemSettings.shell?.bar || 'floating';
    if (launcher) launcher.value = this.systemSettings.shell?.launcher || 'atlas';
    const showLabels = /** @type {HTMLInputElement} */ (this.$('#showTaskbarLabels'));
    if (showLabels) showLabels.checked = this.systemSettings.shell?.showLabels === true;
    if (displayName && document.activeElement !== displayName) displayName.value = this.systemSettings.onboarding?.displayName || '';
    if (widgetsEnabled) widgetsEnabled.checked = this.systemSettings.widgets?.enabled !== false;

    // Armazenamento
    if (this.inputMinioUrl) this.inputMinioUrl.value = storage.minioUrl;
    if (this.inputMinioBucket) this.inputMinioBucket.value = storage.minioBucket;

    // Rede & Segurança
    if (this.toggleOfflineMode) this.toggleOfflineMode.checked = network.offlineMode;
    if (this.toggleStrictSandbox) this.toggleStrictSandbox.checked = security.strictSandbox;
    if (this.toggleSecureHostDrop) this.toggleSecureHostDrop.checked = security.secureHostDrop;
  }

  async saveSettings() {
    try {
      const session = getWorkspace();
      if (session) {
        this.systemSettings = await session.update(changedSettings(this.lastSnapshot, this.systemSettings));
        this.lastSnapshot = structuredClone(this.systemSettings);
        return true;
      }
      this.systemSettings.appearance = normalizeAppearance(this.systemSettings.appearance);
      await writePreferences(this.fileSystem, this.settingsConfigPath, 'unkayos_system_settings', this.systemSettings);
      this.applySettingsRealtime();
      eventBus.emit('settings:updated', this.systemSettings);
      return true;
    } catch (error) {
      this.showToast(error.message);
      return false;
    }
  }

  applySettingsRealtime() {
    applyAppearance(this.systemSettings.appearance, this.desktopElement || document.getElementById('desktop'));
    applyWindowing(this.systemSettings.windowing);
    applyShell(this.systemSettings.shell);
  }

  bindWorkspaceSettings() {
    this.workspaceController = new AbortController();
    const options = { signal: this.workspaceController.signal };
    const element = selector => /** @type {HTMLElement} */ (this.$(selector));
    const input = selector => /** @type {HTMLInputElement} */ (this.$(selector));
    const action = selector => /** @type {HTMLButtonElement} */ (this.$(selector));
    const bind = (selector, event, handler) => this.$(selector)?.addEventListener(event, handler, options);
    const report = error => { const status = this.$('#widgetSettingsStatus'); if (status) status.textContent = error.message; };
    this.workspaceUpdated = settings => {
      this.systemSettings = normalizeWorkspace(settings);
      this.lastSnapshot = structuredClone(this.systemSettings);
      this.syncUiWithSettings(); this.renderWidgetSettings();
    };
    this.widgetsUpdated = () => this.renderWidgetSettings();
    this.widgetError = message => report(new Error(message));
    eventBus.on('settings:updated', this.workspaceUpdated);
    eventBus.on('widgets:updated', this.widgetsUpdated);
    eventBus.on('widgets:error', this.widgetError);
    for (const [selector, key] of [['#selectShellBar', 'bar'], ['#selectShellLauncher', 'launcher']]) {
      bind(selector, 'change', async event => {
        this.systemSettings.shell[key] = event.target.value;
        if (await this.saveSettings()) this.syncUiWithSettings();
      });
    }
    bind('#workspaceDisplayName', 'change', async event => {
      this.systemSettings.onboarding.displayName = event.target.value.trim().slice(0, 40);
      await this.saveSettings();
    });
    bind('#showTaskbarLabels', 'change', async event => {
      this.systemSettings.shell.showLabels = event.target.checked;
      if (await this.saveSettings()) this.syncUiWithSettings();
    });
    bind('#reopenWelcomeBtn', 'click', () => getWorkspace()?.setup.show());
    bind('#widgetsEnabled', 'change', async event => {
      try { await getWorkspace()?.update({ widgets: { enabled: event.target.checked } }); } catch (error) { report(error); }
    });
    bind('#widgetSettingsList', 'click', async event => {
      const button = event.target.closest('button'); if (!button) return;
      const session = getWorkspace(); if (!session) return;
      button.disabled = true;
      try {
        if (button.dataset.widgetToggle) {
          const id = button.dataset.widgetToggle;
          if (session.widgets.active.has(id)) await session.widgets.hide(id);
          else { if (!session.settings.widgets.enabled) await session.update({ widgets: { enabled: true } }); await session.widgets.show(id); }
        }
        if (button.dataset.widgetRemove) await session.widgets.remove(button.dataset.widgetRemove);
      } catch (error) { report(error); }
      finally { this.renderWidgetSettings(); }
    });
    bind('#widgetSettingsList', 'change', async event => {
      const field = event.target, id = field.dataset.widgetStartup, session = getWorkspace();
      if (!id || !session) return;
      const checked = field.checked;
      try { await session.update(settings => ({ widgets: { startup: checked ? [...new Set([...settings.widgets.startup, id])] : settings.widgets.startup.filter(entry => entry !== id) } })); } catch (error) { report(error); }
    });
    bind('#widgetImportFile', 'change', async event => {
      this.pendingWidget = null;
      for (const selector of ['#confirmWidgetImport', '#widgetImportStartupRow', '#widgetImportPreview']) element(selector).hidden = true;
      try {
        const file = event.target.files?.[0]; if (!file) return;
        if (file.size > 32768) throw new Error('Use um JSON de até 32 KB.');
        this.pendingWidget = validateWidget(JSON.parse(await file.text()));
        const preview = element('#widgetImportPreview');
        preview.textContent = `${this.pendingWidget.title} · ${this.pendingWidget.type === 'note' ? this.pendingWidget.content : this.pendingWidget.items.map(item => item.label).join(' / ')}`;
        preview.hidden = false;
        this.$('#widgetSettingsStatus').textContent = 'Prévia pronta. Adicione quando estiver de acordo.';
      } catch (error) { report(error); }
      for (const selector of ['#confirmWidgetImport', '#widgetImportStartupRow']) element(selector).hidden = !this.pendingWidget;
    });
    bind('#confirmWidgetImport', 'click', async () => {
      if (!this.pendingWidget) return;
      const button = action('#confirmWidgetImport'); button.disabled = true;
      try {
        await getWorkspace().widgets.import(this.pendingWidget, input('#widgetImportStartup').checked);
        this.pendingWidget = null; input('#widgetImportFile').value = '';
        for (const selector of ['#confirmWidgetImport', '#widgetImportStartupRow', '#widgetImportPreview']) element(selector).hidden = true;
        this.$('#widgetSettingsStatus').textContent = 'Widget adicionado ao seu espaço.';
      } catch (error) { report(error); }
      finally { button.disabled = false; }
    });
    bind('#downloadWidgetExample', 'click', () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(WIDGET_EXAMPLE, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'meus-links.widget.json'; link.click(); URL.revokeObjectURL(url);
    });
    this.renderWidgetSettings();
  }

  renderWidgetSettings() {
    const list = this.$('#widgetSettingsList'), session = getWorkspace(); if (!list || !session) return;
    list.innerHTML = session.widgets.catalog().map(widget => {
      const active = session.widgets.active.has(widget.id), startup = session.settings.widgets.startup.includes(widget.id), e = escapeHtml;
      return `<article class="widget-setting-row"><span class="widget-setting-icon">${iconMarkup(widget.icon, { size: 24 })}</span><div class="widget-setting-copy"><strong>${e(widget.title)}</strong><small>${e(widget.description)} · ${active ? 'Carregado' : 'Oculto'}</small></div><label class="widget-startup-option"><input type="checkbox" class="rda-checkbox-native" data-widget-startup="${e(widget.id)}" ${startup ? 'checked' : ''}> Ao entrar</label><button type="button" class="rda-button rda-button--sm" data-color="secondary" data-widget-toggle="${e(widget.id)}">${active ? 'Ocultar' : 'Carregar'}</button>${widget.type !== 'native' ? `<button type="button" class="workspace-icon-button" data-widget-remove="${e(widget.id)}" aria-label="Remover ${e(widget.title)}">${iconMarkup('trash-2', { size: 16 })}</button>` : ''}</article>`;
    }).join('');
  }

  async checkServicesHealth() {
    this.healthController?.abort();
    const controller = new AbortController();
    this.healthController = controller;
    const timeout = this.setTimeout(() => controller.abort(), 5000);
    if (this.computeLatency) {
      this.computeLatency.textContent = 'Verificando...';
      const t0 = performance.now();
      try {
        const res = await fetch('/api/compute/health', { signal: controller.signal });
        this.computeLatency.textContent = res.ok ? `${Math.round(performance.now() - t0)}ms (Ativo)` : 'Indisponível';
      } catch (_) { this.computeLatency.textContent = 'Offline'; }
      finally { this.clearTimeout?.(timeout); }
    } else { this.clearTimeout?.(timeout); }
    const auth = this.standardAPIs.auth || this.unkay?.auth;
    const user = auth?.getCurrentUser?.() || auth?.getUser?.();
    if (this.authLatency) this.authLatency.textContent = user ? 'Sessão autenticada' : 'Sem sessão SSO';
    if (this.userLatency) this.userLatency.textContent = 'Não verificado';
  }

  async exportVfsBackup() {
    try {
      const backupData = {
        exported_at: new Date().toISOString(),
        version: currentRelease.version,
        system_settings: this.systemSettings,
        user_profile: null
      };

      try {
        const profileRaw = localStorage.getItem('unkayos_user_profile');
        if (profileRaw) backupData.user_profile = JSON.parse(profileRaw);
      } catch (_) {}

      const backupString = JSON.stringify(backupData, null, 2);
      const filename = `/home/user/documents/unkayos-backup-${Date.now()}.json`;

      if (this.fileSystem && typeof this.fileSystem.mkdir === 'function') {
        await this.fileSystem.mkdir('/home/user/documents', { recursive: true });
      }
      if (this.fileSystem && typeof this.fileSystem.writeFile === 'function') {
        await this.fileSystem.writeFile(filename, backupString);
      } else {
        throw new Error('Sistema de arquivos indisponível.');
      }

      this.showToast(`Backup gravado em ${filename}`);
    } catch (e) {
      this.showToast(`Erro ao exportar backup: ${e.message}`);
    }
  }

  async cleanTmp() {
    try {
      const removed = await clearTemporaryFiles(this.fileSystem);
      this.showToast(`${removed} arquivo(s) temporário(s) removido(s).`);
    } catch (error) { this.showToast(error.message); }
  }

  async resetAllSettings() {
    this.systemSettings = {
      appearance: normalizeAppearance(),
      windowing: {
        aeroSnap: true,
        centerWindows: true,
        taskbarPosition: 'bottom',
        autoHideTaskbar: false
      },
      storage: {
        minioUrl: 'http://localhost:9000',
        minioBucket: 'unkayos-storage'
      },
      network: {
        offlineMode: false
      },
      security: {
        strictSandbox: true,
        secureHostDrop: true
      }
    };

    if (!await this.saveSettings()) return;
    this.syncUiWithSettings();
    this.showToast('Configurações redefinidas para o padrão de fábrica.');
  }

  showToast(msg) {
    const existing = this.$('.settings-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'settings-toast';
    toast.textContent = ` ${msg}`;

    if (this.appContentRoot) {
      this.appContentRoot.appendChild(toast);
      this.setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 3000);
    }
  }

  async onCleanup() {
    this.workspaceController?.abort();
    eventBus.off('settings:updated', this.workspaceUpdated);
    eventBus.off('widgets:updated', this.widgetsUpdated);
    eventBus.off('widgets:error', this.widgetError);
    this.healthController?.abort();
    await super.onCleanup();
  }

  static async runCli(args, writeLine) {
    let panel = 'appearance';
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--panel' && args[i + 1]) {
        panel = args[i + 1];
        i++;
      } else if (args[i] === '--help' || args[i] === '-h') {
        writeLine('Uso: settings [--panel <appearance|windowing|storage|services|security|about>] [--help]');
        return;
      }
    }
    eventBus.emit('app:start', { appId: 'settings', params: { panel } });
    writeLine('Configurações do Sistema iniciadas.');
  }
}
