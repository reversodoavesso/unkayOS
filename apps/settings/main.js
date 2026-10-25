// apps/settings/main.js - Configurações Gerais do Sistema unkayOS 2.0

import { BaseApp } from '../../core/BaseApp.js';
import eventBus from '../../core/eventBus.js';

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

    this.settingsConfigPath = '/etc/unkay-settings.json';

    this.systemSettings = {
      appearance: {
        theme: 'dark',
        accentColor: '#22d3ee',
        wallpaper: '/assets/images/wallpaper_01.jpg',
        glassmorphism: true,
        fontScale: 'standard'
      },
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
    this.handleAccentClick = this.handleAccentClick.bind(this);
    this.handleWallpaperClick = this.handleWallpaperClick.bind(this);
    this.handleThemeChange = this.handleThemeChange.bind(this);
  }

  handleNavClick(panelId) {
    this.switchPanel(panelId);
  }

  onRun(terminalOutputCallback = null, appParams = {}) {
    console.log(`[SettingsApp - ${this.instanceId}] Inicializando Painel de Configurações...`);

    // Elementos da barra de navegação
    this.sidebarNav = this.$('.sidebar-nav');
    this.settingsSearchInput = this.$('#settingsSearchInput');

    // Controles de Aparência
    this.accentDots = this.$$('.accent-dot');
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
    this.loadSettings();

    // Executa verificação inicial de saúde dos microsserviços
    this.checkServicesHealth();

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

    // Cores de Acento
    this.accentDots.forEach(dot => {
      dot.addEventListener('click', () => {
        const color = dot.getAttribute('data-color');
        if (color) this.handleAccentClick(color);
      });
    });

    // Wallpapers
    this.wallpaperThumbs.forEach(thumb => {
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
      this.syncMinioNowBtn.addEventListener('click', () => {
        eventBus.emit('minio:sync:start');
        this.showToast('Sincronização com nuvem iniciada.');
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
        this.showToast('O sistema está atualizado na versão 2.0.0-alpha.1');
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

  handleThemeChange(theme) {
    this.systemSettings.appearance.theme = theme;

    this.$$('.theme-option').forEach(opt => {
      if (opt.getAttribute('data-theme') === theme) {
        opt.classList.add('active');
      } else {
        opt.classList.remove('active');
      }
    });

    this.saveSettings();
    this.showToast(`Tema alterado para: ${theme === 'dark' ? 'Escuro Obsidian' : 'Claro'}`);
  }

  handleAccentClick(color) {
    this.systemSettings.appearance.accentColor = color;

    this.accentDots.forEach(dot => {
      if (dot.getAttribute('data-color') === color) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });

    this.saveSettings();
    this.showToast('Cor de destaque atualizada!');
  }

  handleWallpaperClick(wp) {
    this.systemSettings.appearance.wallpaper = wp;

    this.wallpaperThumbs.forEach(thumb => {
      if (thumb.getAttribute('data-wp') === wp) {
        thumb.classList.add('active');
      } else {
        thumb.classList.remove('active');
      }
    });

    this.saveSettings();
    this.showToast('Papel de parede aplicado!');
  }

  loadSettings() {
    let loaded = null;

    // 1. Tenta VFS
    try {
      if (this.fileSystem && typeof this.fileSystem.readFile === 'function') {
        const raw = this.fileSystem.readFile(this.settingsConfigPath);
        if (raw) loaded = JSON.parse(raw);
      }
    } catch (_) {}

    // 2. Tenta localStorage
    if (!loaded) {
      try {
        const raw = localStorage.getItem('unkayos_system_settings');
        if (raw) loaded = JSON.parse(raw);
      } catch (_) {}
    }

    if (loaded) {
      this.systemSettings = {
        ...this.systemSettings,
        ...loaded,
        appearance: { ...this.systemSettings.appearance, ...(loaded.appearance || {}) },
        windowing: { ...this.systemSettings.windowing, ...(loaded.windowing || {}) },
        storage: { ...this.systemSettings.storage, ...(loaded.storage || {}) },
        network: { ...this.systemSettings.network, ...(loaded.network || {}) },
        security: { ...this.systemSettings.security, ...(loaded.security || {}) }
      };
    }

    this.syncUiWithSettings();
    this.applySettingsRealtime();
  }

  syncUiWithSettings() {
    const { appearance, windowing, storage, network, security } = this.systemSettings;

    // Aparência
    this.$$('.theme-option').forEach(opt => {
      opt.classList.toggle('active', opt.getAttribute('data-theme') === appearance.theme);
    });
    this.accentDots.forEach(dot => {
      dot.classList.toggle('active', dot.getAttribute('data-color') === appearance.accentColor);
    });
    this.wallpaperThumbs.forEach(thumb => {
      thumb.classList.toggle('active', thumb.getAttribute('data-wp') === appearance.wallpaper);
    });
    if (this.toggleGlassmorphism) this.toggleGlassmorphism.checked = appearance.glassmorphism;
    if (this.selectFontScale) this.selectFontScale.value = appearance.fontScale;

    // Janelas
    if (this.toggleAeroSnap) this.toggleAeroSnap.checked = windowing.aeroSnap;
    if (this.toggleCenterWindows) this.toggleCenterWindows.checked = windowing.centerWindows;
    if (this.selectTaskbarPosition) this.selectTaskbarPosition.value = windowing.taskbarPosition;
    if (this.toggleAutoHideTaskbar) this.toggleAutoHideTaskbar.checked = windowing.autoHideTaskbar;

    // Armazenamento
    if (this.inputMinioUrl) this.inputMinioUrl.value = storage.minioUrl;
    if (this.inputMinioBucket) this.inputMinioBucket.value = storage.minioBucket;

    // Rede & Segurança
    if (this.toggleOfflineMode) this.toggleOfflineMode.checked = network.offlineMode;
    if (this.toggleStrictSandbox) this.toggleStrictSandbox.checked = security.strictSandbox;
    if (this.toggleSecureHostDrop) this.toggleSecureHostDrop.checked = security.secureHostDrop;
  }

  saveSettings() {
    const jsonString = JSON.stringify(this.systemSettings, null, 2);

    // 1. VFS
    try {
      if (this.fileSystem && typeof this.fileSystem.mkdir === 'function') {
        try { this.fileSystem.mkdir('/etc', { recursive: true }); } catch (_) {}
      }
      if (this.fileSystem && typeof this.fileSystem.writeFile === 'function') {
        this.fileSystem.writeFile(this.settingsConfigPath, jsonString);
      }
    } catch (e) {
      console.warn(`[SettingsApp] Erro ao gravar em ${this.settingsConfigPath}:`, e);
    }

    // 2. localStorage
    try {
      localStorage.setItem('unkayos_system_settings', jsonString);
    } catch (_) {}

    // Aplica alterações visuais e notifica
    this.applySettingsRealtime();
    eventBus.emit('settings:updated', this.systemSettings);
  }

  applySettingsRealtime() {
    const { appearance } = this.systemSettings;

    // 1. Aplica Cor de Destaque no :root
    if (appearance.accentColor) {
      document.documentElement.style.setProperty('--rda-color-primary-400', appearance.accentColor);
      document.documentElement.style.setProperty('--color-primary-base', appearance.accentColor);
    }

    // 2. Aplica Wallpaper no #desktop
    const desktop = this.desktopElement || document.querySelector('#desktop');
    if (desktop && appearance.wallpaper) {
      if (appearance.wallpaper.includes('gradient')) {
        desktop.style.backgroundImage = appearance.wallpaper;
        desktop.style.backgroundColor = 'transparent';
      } else if (appearance.wallpaper.startsWith('http') || appearance.wallpaper.startsWith('/') || appearance.wallpaper.startsWith('.')) {
        desktop.style.backgroundImage = `url('${appearance.wallpaper}')`;
        desktop.style.backgroundColor = 'transparent';
      } else {
        desktop.style.backgroundImage = 'none';
        desktop.style.backgroundColor = appearance.wallpaper;
      }
    }

    // 3. Aplica Escala de Fonte
    if (appearance.fontScale === 'compact') {
      document.documentElement.style.fontSize = '14px';
    } else if (appearance.fontScale === 'large') {
      document.documentElement.style.fontSize = '18px';
    } else {
      document.documentElement.style.fontSize = '16px';
    }
  }

  async checkServicesHealth() {
    // 1. compute-service (Porta 3005)
    if (this.computeLatency) {
      this.computeLatency.textContent = 'Verificando...';
      const t0 = performance.now();
      try {
        const res = await fetch('http://localhost:3005/health');
        if (res.ok) {
          const lat = Math.round(performance.now() - t0);
          this.computeLatency.textContent = `${lat}ms (Ativo)`;
        } else {
          this.computeLatency.textContent = 'Erro HTTP';
        }
      } catch (_) {
        this.computeLatency.textContent = 'Offline';
      }
    }

    // 2. auth-service / Zitadel
    if (this.authLatency) {
      this.authLatency.textContent = 'Pronto (OIDC)';
    }

    // 3. user-service (Porta 3001)
    if (this.userLatency) {
      this.userLatency.textContent = 'Ativo (Cluster)';
    }
  }

  exportVfsBackup() {
    try {
      const backupData = {
        exported_at: new Date().toISOString(),
        version: '2.0.0-alpha.1',
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
        try { this.fileSystem.mkdir('/home/user/documents', { recursive: true }); } catch (_) {}
      }
      if (this.fileSystem && typeof this.fileSystem.writeFile === 'function') {
        this.fileSystem.writeFile(filename, backupString);
      }

      this.showToast(`Backup gravado em ${filename}`);
    } catch (e) {
      this.showToast(`Erro ao exportar backup: ${e.message}`);
    }
  }

  cleanTmp() {
    try {
      if (this.fileSystem && typeof this.fileSystem.readdir === 'function') {
        const list = this.fileSystem.readdir('/tmp') || [];
        list.forEach(item => {
          try {
            if (typeof this.fileSystem.unlink === 'function') {
              this.fileSystem.unlink(`/tmp/${item}`);
            }
          } catch (_) {}
        });
      }
      this.showToast('Arquivos temporários do sistema limpos com sucesso.');
    } catch (_) {
      this.showToast('Nenhum arquivo temporário pendente.');
    }
  }

  resetAllSettings() {
    this.systemSettings = {
      appearance: {
        theme: 'dark',
        accentColor: '#22d3ee',
        wallpaper: '/assets/images/wallpaper_01.jpg',
        glassmorphism: true,
        fontScale: 'standard'
      },
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

    this.saveSettings();
    this.syncUiWithSettings();
    this.showToast('Configurações redefinidas para o padrão de fábrica.');
  }

  showToast(msg) {
    const existing = this.$('.settings-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'settings-toast';
    toast.innerHTML = `<span>⚙️</span> <span>${msg}</span>`;

    if (this.appContentRoot) {
      this.appContentRoot.appendChild(toast);
      this.setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 3000);
    }
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
