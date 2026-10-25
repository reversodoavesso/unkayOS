// apps/user-profile/main.js - Painel do Usuário unkayOS 2.0 (SSO RDA & Identidade)

import { BaseApp } from '../../core/BaseApp.js';
import eventBus from '../../core/eventBus.js';

export default class UserProfileApp extends BaseApp {
  static get parameters() {
    return {
      tab: {
        type: 'string',
        required: false,
        description: 'Aba inicial a ser aberta (identity, sso, preferences, storage)'
      }
    };
  }

  constructor(CORE, standardAPIs, appContentRoot = null, desktopElement = null) {
    super(CORE, standardAPIs, appContentRoot, desktopElement);

    this.profileConfigPath = '/home/user/.config/user-profile.json';

    this.userData = {
      displayName: 'Convidado',
      username: 'guest',
      email: 'offline@unkayos.local',
      avatar: '/assets/icons/apps/generic_app_icon.svg',
      organization: 'Reverso do Avesso • Core Labs',
      bio: '',
      tier: 'guest',
      role: 'guest',
      circle: 'veil',
      preferences: {
        defaultShell: 'wasi-bash',
        promptStyle: 'standard',
        homeDir: '/home/user',
        timezone: 'America/Sao_Paulo',
        autoSaveClips: true,
        syncHistory: true
      }
    };

    // Bindings
    this.handleSaveIdentity = this.handleSaveIdentity.bind(this);
    this.handleSavePreferences = this.handleSavePreferences.bind(this);
    this.handleDevProfileClick = this.handleDevProfileClick.bind(this);
    this.handleLoginZitadel = this.handleLoginZitadel.bind(this);
    this.handleLogout = this.handleLogout.bind(this);
  }

  handleTabClick(tabName) {
    this.switchTab(tabName);
  }

  onRun(terminalOutputCallback = null, appParams = {}) {
    console.log(`[UserProfileApp - ${this.instanceId}] Inicializando Painel do Usuário...`);

    // Elementos do Header
    this.userAvatarImg = this.$('#userAvatarImg');
    this.userStatusDot = this.$('#userStatusDot');
    this.headerDisplayName = this.$('#headerDisplayName');
    this.headerTierBadge = this.$('#headerTierBadge');
    this.headerCircleBadge = this.$('#headerCircleBadge');
    this.headerUsername = this.$('#headerUsername');
    this.headerEmail = this.$('#headerEmail');
    this.ssoQuickActionBtn = this.$('#ssoQuickActionBtn');
    this.ssoQuickActionText = this.$('#ssoQuickActionText');

    // Inputs de Identidade
    this.inputDisplayName = this.$('#inputDisplayName');
    this.inputUsername = this.$('#inputUsername');
    this.inputEmail = this.$('#inputEmail');
    this.inputOrganization = this.$('#inputOrganization');
    this.inputBio = this.$('#inputBio');
    this.saveIdentityBtn = this.$('#saveIdentityBtn');
    this.resetIdentityBtn = this.$('#resetIdentityBtn');

    // Elementos SSO
    this.ssoStatusTitle = this.$('#ssoStatusTitle');
    this.ssoStatusDesc = this.$('#ssoStatusDesc');
    this.loginZitadelBtn = this.$('#loginZitadelBtn');
    this.logoutBtn = this.$('#logoutBtn');

    // Inputs de Preferências
    this.selectDefaultShell = this.$('#selectDefaultShell');
    this.selectPromptStyle = this.$('#selectPromptStyle');
    this.inputHomeDir = this.$('#inputHomeDir');
    this.selectTimezone = this.$('#selectTimezone');
    this.checkAutoSaveClips = this.$('#checkAutoSaveClips');
    this.checkSyncHistory = this.$('#checkSyncHistory');
    this.savePreferencesBtn = this.$('#savePreferencesBtn');

    // Armazenamento
    this.storageUsageText = this.$('#storageUsageText');
    this.storageMeterFill = this.$('#storageMeterFill');
    this.homeFilesCount = this.$('#homeFilesCount');
    this.webClipsCount = this.$('#webClipsCount');
    this.openFileManagerBtn = this.$('#openFileManagerBtn');
    this.cleanUserTmpBtn = this.$('#cleanUserTmpBtn');

    // Registra eventos
    this.registerEventListeners();

    // Carrega dados salvos
    this.loadProfile();

    // Atualiza contadores de armazenamento
    this.updateStorageStats();

    // Abre aba solicitada por parâmetro se houver
    if (appParams.tab) {
      this.switchTab(appParams.tab);
    }
  }

  registerEventListeners() {
    // Abas
    const tabBtns = this.$$('.profile-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        if (targetTab) this.switchTab(targetTab);
      });
    });

    // Ações de formulário
    if (this.saveIdentityBtn) {
      this.saveIdentityBtn.addEventListener('click', this.handleSaveIdentity);
    }
    if (this.resetIdentityBtn) {
      this.resetIdentityBtn.addEventListener('click', () => {
        this.resetToDefaults();
      });
    }

    if (this.savePreferencesBtn) {
      this.savePreferencesBtn.addEventListener('click', this.handleSavePreferences);
    }

    // SSO Ações
    if (this.loginZitadelBtn) {
      this.loginZitadelBtn.addEventListener('click', this.handleLoginZitadel);
    }
    if (this.ssoQuickActionBtn) {
      this.ssoQuickActionBtn.addEventListener('click', () => {
        if (this.userData.tier === 'guest') {
          this.switchTab('sso');
        } else {
          this.handleLogout();
        }
      });
    }
    if (this.logoutBtn) {
      this.logoutBtn.addEventListener('click', this.handleLogout);
    }

    // Perfis simulados de desenvolvimento
    const devBtns = this.$$('.dev-profile-btn');
    devBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tier = btn.getAttribute('data-tier');
        const role = btn.getAttribute('data-role');
        const name = btn.getAttribute('data-name');
        this.handleDevProfileClick(tier, role, name);
      });
    });

    // Presets de avatar
    const avatarBtns = this.$$('.avatar-preset-btn');
    avatarBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const avatarUrl = btn.getAttribute('data-avatar');
        if (avatarUrl) {
          this.userData.avatar = avatarUrl;
          if (this.userAvatarImg) this.userAvatarImg.src = avatarUrl;
          this.showToast('Avatar selecionado!');
        }
      });
    });

    // Ações de armazenamento
    if (this.openFileManagerBtn) {
      this.openFileManagerBtn.addEventListener('click', () => {
        eventBus.emit('app:start', { appId: 'file-manager', params: { path: '/home/user' } });
      });
    }

    if (this.cleanUserTmpBtn) {
      this.cleanUserTmpBtn.addEventListener('click', () => {
        this.cleanTmp();
      });
    }
  }

  switchTab(tabName) {
    const tabBtns = this.$$('.profile-tab-btn');
    tabBtns.forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const sections = {
      identity: this.$('#sectionIdentity'),
      sso: this.$('#sectionSso'),
      preferences: this.$('#sectionPreferences'),
      storage: this.$('#sectionStorage')
    };

    Object.entries(sections).forEach(([key, section]) => {
      if (section) {
        section.style.display = key === tabName ? 'block' : 'none';
      }
    });
  }

  loadProfile() {
    let loadedData = null;

    // 1. Tenta carregar do VFS
    try {
      if (this.fileSystem && typeof this.fileSystem.readFile === 'function') {
        const content = this.fileSystem.readFile(this.profileConfigPath);
        if (content) {
          loadedData = JSON.parse(content);
        }
      }
    } catch (_) {}

    // 2. Fallback pelo localStorage
    if (!loadedData) {
      try {
        const stored = localStorage.getItem('unkayos_user_profile');
        if (stored) {
          loadedData = JSON.parse(stored);
        }
      } catch (_) {}
    }

    // 3. Fallback pelo AuthSystem / unkay.auth
    if (!loadedData) {
      try {
        const authUser = this.standardAPIs?.auth?.getCurrentUser?.() || window.unkay?.auth?.getCurrentUser?.();
        if (authUser) {
          loadedData = {
            displayName: authUser.name || authUser.preferred_username || 'Operador RDA',
            username: authUser.preferred_username || 'operador',
            email: authUser.email || 'operador@reversodoavesso.com',
            tier: authUser.tier ? (authUser.tier > 10 ? 'sysadmin' : 'standard') : 'standard',
            role: authUser.role || 'member',
            circle: authUser.circle || 'practice'
          };
        }
      } catch (_) {}
    }

    if (loadedData) {
      this.userData = {
        ...this.userData,
        ...loadedData,
        preferences: {
          ...this.userData.preferences,
          ...(loadedData.preferences || {})
        }
      };
    }

    this.renderProfileToUI();
  }

  renderProfileToUI() {
    // Header
    if (this.headerDisplayName) this.headerDisplayName.textContent = this.userData.displayName;
    if (this.headerUsername) this.headerUsername.textContent = `@${this.userData.username}`;
    if (this.headerEmail) this.headerEmail.textContent = this.userData.email;
    if (this.userAvatarImg) this.userAvatarImg.src = this.userData.avatar || '/assets/icons/apps/generic_app_icon.svg';

    if (this.headerTierBadge) {
      this.headerTierBadge.className = `tier-pill tier-${this.userData.tier}`;
      this.headerTierBadge.textContent = this.userData.tier.toUpperCase();
    }

    if (this.headerCircleBadge) {
      const circleMap = {
        veil: 'Círculo Veil (Iniciado)',
        practice: 'Círculo Practice (Prática)',
        egregore: 'Círculo Egregore (Egrégora)',
        arcane: 'Círculo Arcane (Arcano)'
      };
      this.headerCircleBadge.textContent = circleMap[this.userData.circle] || 'Círculo Veil';
    }

    if (this.userStatusDot) {
      this.userStatusDot.className = `status-indicator ${this.userData.tier === 'guest' ? 'status-guest' : 'status-online'}`;
    }

    if (this.ssoQuickActionText) {
      this.ssoQuickActionText.textContent = this.userData.tier === 'guest' ? 'Entrar com SSO RDA' : 'Sair da Conta';
    }

    // Form Inputs: Identity
    if (this.inputDisplayName) this.inputDisplayName.value = this.userData.displayName;
    if (this.inputUsername) this.inputUsername.value = this.userData.username;
    if (this.inputEmail) this.inputEmail.value = this.userData.email;
    if (this.inputOrganization) this.inputOrganization.value = this.userData.organization;
    if (this.inputBio) this.inputBio.value = this.userData.bio || '';

    // Form Inputs: Preferences
    if (this.selectDefaultShell) this.selectDefaultShell.value = this.userData.preferences.defaultShell;
    if (this.selectPromptStyle) this.selectPromptStyle.value = this.userData.preferences.promptStyle;
    if (this.inputHomeDir) this.inputHomeDir.value = this.userData.preferences.homeDir;
    if (this.selectTimezone) this.selectTimezone.value = this.userData.preferences.timezone;
    if (this.checkAutoSaveClips) this.checkAutoSaveClips.checked = this.userData.preferences.autoSaveClips;
    if (this.checkSyncHistory) this.checkSyncHistory.checked = this.userData.preferences.syncHistory;

    // SSO Card
    if (this.ssoStatusTitle && this.ssoStatusDesc) {
      if (this.userData.tier !== 'guest') {
        this.ssoStatusTitle.textContent = `Sessão Autenticada (${this.userData.role.toUpperCase()})`;
        this.ssoStatusDesc.textContent = `Conectado como ${this.userData.email} no ecossistema Reverso do Avesso (Zitadel OIDC).`;
        if (this.loginZitadelBtn) this.loginZitadelBtn.style.display = 'none';
        if (this.logoutBtn) this.logoutBtn.style.display = 'inline-flex';
      } else {
        this.ssoStatusTitle.textContent = 'Sessão Local (Não Autenticado)';
        this.ssoStatusDesc.textContent = 'Conecte-se com Zitadel SSO para sincronizar seus dados e liberar recursos de computação.';
        if (this.loginZitadelBtn) this.loginZitadelBtn.style.display = 'inline-flex';
        if (this.logoutBtn) this.logoutBtn.style.display = 'none';
      }
    }
  }

  handleSaveIdentity() {
    if (this.inputDisplayName) this.userData.displayName = this.inputDisplayName.value.trim() || 'Convidado';
    if (this.inputUsername) this.userData.username = this.inputUsername.value.trim() || 'guest';
    if (this.inputEmail) this.userData.email = this.inputEmail.value.trim() || 'offline@unkayos.local';
    if (this.inputOrganization) this.userData.organization = this.inputOrganization.value.trim();
    if (this.inputBio) this.userData.bio = this.inputBio.value.trim();

    this.persistUserData();
    this.renderProfileToUI();
    this.showToast('Identidade atualizada com sucesso!');
  }

  handleSavePreferences() {
    this.userData.preferences = {
      defaultShell: this.selectDefaultShell ? this.selectDefaultShell.value : 'wasi-bash',
      promptStyle: this.selectPromptStyle ? this.selectPromptStyle.value : 'standard',
      homeDir: this.inputHomeDir ? this.inputHomeDir.value.trim() : '/home/user',
      timezone: this.selectTimezone ? this.selectTimezone.value : 'America/Sao_Paulo',
      autoSaveClips: this.checkAutoSaveClips ? this.checkAutoSaveClips.checked : true,
      syncHistory: this.checkSyncHistory ? this.checkSyncHistory.checked : true
    };

    this.persistUserData();
    eventBus.emit('user:preferences_updated', this.userData.preferences);
    this.showToast('Preferências salvas no VFS!');
  }

  handleDevProfileClick(tier, role, name) {
    const circleByRole = {
      guest: 'veil',
      acolyte: 'practice',
      member: 'egregore',
      sysadmin: 'arcane'
    };

    this.userData.tier = tier;
    this.userData.role = role;
    this.userData.displayName = name;
    this.userData.username = role;
    this.userData.email = `${role}@reversodoavesso.com`;
    this.userData.circle = circleByRole[role] || 'veil';

    localStorage.setItem('unkay_tier', tier);
    localStorage.setItem('unkay_auth_token', `dev-token-${tier}-${Date.now()}`);

    this.persistUserData();
    this.renderProfileToUI();

    eventBus.emit('auth:login', { user: this.userData, token: 'dev-token' });
    eventBus.emit('user:profile_updated', this.userData);

    this.showToast(`Perfil simulado ativado: ${name} (${tier.toUpperCase()})`);
  }

  handleLoginZitadel() {
    try {
      if (this.standardAPIs?.auth?.login) {
        this.standardAPIs.auth.login();
      } else if (window.unkay?.auth?.login) {
        window.unkay.auth.login();
      } else {
        // Fallback simulado para ambiente dev
        this.handleDevProfileClick('standard', 'member', 'Membro Zitadel SSO');
      }
    } catch (e) {
      console.warn(`[UserProfileApp] Erro ao iniciar login Zitadel:`, e);
      this.handleDevProfileClick('standard', 'member', 'Membro Zitadel SSO');
    }
  }

  handleLogout() {
    this.userData.tier = 'guest';
    this.userData.role = 'guest';
    this.userData.displayName = 'Convidado';
    this.userData.username = 'guest';
    this.userData.email = 'offline@unkayos.local';
    this.userData.circle = 'veil';

    localStorage.removeItem('unkay_tier');
    localStorage.removeItem('unkay_auth_token');
    localStorage.removeItem('unkayos_auth_token');

    this.persistUserData();
    this.renderProfileToUI();

    eventBus.emit('auth:logout');
    eventBus.emit('user:profile_updated', this.userData);

    this.showToast('Sessão encerrada com sucesso.');
  }

  resetToDefaults() {
    this.userData.displayName = 'Convidado';
    this.userData.username = 'guest';
    this.userData.email = 'offline@unkayos.local';
    this.userData.organization = 'Reverso do Avesso • Core Labs';
    this.userData.bio = '';
    this.userData.avatar = '/assets/icons/apps/generic_app_icon.svg';

    this.persistUserData();
    this.renderProfileToUI();
    this.showToast('Configurações redefinidas para o padrão.');
  }

  persistUserData() {
    const jsonString = JSON.stringify(this.userData, null, 2);

    // 1. VFS
    try {
      if (this.fileSystem && typeof this.fileSystem.mkdir === 'function') {
        try { this.fileSystem.mkdir('/home/user/.config', { recursive: true }); } catch (_) {}
      }
      if (this.fileSystem && typeof this.fileSystem.writeFile === 'function') {
        this.fileSystem.writeFile(this.profileConfigPath, jsonString);
      }
    } catch (e) {
      console.warn(`[UserProfileApp] Não foi possível gravar em ${this.profileConfigPath}:`, e);
    }

    // 2. localStorage
    try {
      localStorage.setItem('unkayos_user_profile', jsonString);
    } catch (_) {}

    // Notifica o sistema
    eventBus.emit('user:profile_updated', this.userData);
  }

  updateStorageStats() {
    let filesCount = 0;
    let webClipsCount = 0;

    try {
      if (this.fileSystem && typeof this.fileSystem.readdir === 'function') {
        const homeList = this.fileSystem.readdir('/home/user') || [];
        filesCount = homeList.length;

        const clipsList = this.fileSystem.readdir('/home/user/documents/web-clips') || [];
        webClipsCount = clipsList.length;
      }
    } catch (_) {}

    if (this.homeFilesCount) {
      this.homeFilesCount.textContent = `${filesCount} arquivo(s) e pastas`;
    }
    if (this.webClipsCount) {
      this.webClipsCount.textContent = `${webClipsCount} artigo(s) capturado(s)`;
    }
  }

  cleanTmp() {
    try {
      if (this.fileSystem && typeof this.fileSystem.readdir === 'function') {
        const tmpFiles = this.fileSystem.readdir('/tmp') || [];
        tmpFiles.forEach(file => {
          try {
            if (typeof this.fileSystem.unlink === 'function') {
              this.fileSystem.unlink(`/tmp/${file}`);
            }
          } catch (_) {}
        });
      }
      this.showToast('Cache temporário limpo com sucesso!');
    } catch (e) {
      this.showToast('Nenhum arquivo temporário pendente.');
    }
  }

  showToast(msg) {
    const existing = this.$('.profile-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'profile-toast';
    toast.innerHTML = `<span>👤</span> <span>${msg}</span>`;

    if (this.appContentRoot) {
      this.appContentRoot.appendChild(toast);
      this.setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 3000);
    }
  }

  static async runCli(args, writeLine) {
    let tab = 'identity';
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--tab' && args[i + 1]) {
        tab = args[i + 1];
        i++;
      } else if (args[i] === '--help' || args[i] === '-h') {
        writeLine('Uso: user-profile [--tab <identity|sso|preferences|storage>] [--help]');
        return;
      }
    }
    eventBus.emit('app:start', { appId: 'user-profile', params: { tab } });
    writeLine('Painel do Usuário iniciado.');
  }
}
