// apps/user-profile/main.js - Painel do Usuário unkayOS 2.0 (SSO RDA & Identidade)

import { BaseApp } from '../../core/BaseApp.js';
import eventBus from '../../core/eventBus.js';
import { readPreferences, writePreferences, clearTemporaryFiles } from '../../core/utils/appPreferences.js';

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
    this.fileSystem = this.wasmFileSystem || this.fileSystem;
    this.auth = standardAPIs.auth || this.unkay?.auth || window.unkay?.auth;
    this.isDev = Boolean(import.meta.env?.DEV) && ['localhost', '127.0.0.1'].includes(window.location.hostname);

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

  async onRun(terminalOutputCallback = null, appParams = {}) {
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
    await this.loadProfile();
    this.authChanged = () => { void this.loadProfile(); };
    this.auth?.on?.('change', this.authChanged);
    const devBox = this.$('.dev-auth-box');
    if (devBox && !this.isDev) devBox.style.display = 'none';

    // Atualiza contadores de armazenamento
    await this.updateStorageStats();

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

  async loadProfile() {
    let loadedData = await readPreferences(this.fileSystem, this.profileConfigPath, 'unkayos_user_profile');
    if (!loadedData || typeof loadedData !== 'object' || Array.isArray(loadedData)) loadedData = {};

    // A cached profile never grants an authenticated session.
    const authUser = this.auth?.getCurrentUser?.() || this.auth?.getUser?.();
    loadedData = { ...loadedData, tier: 'guest', role: 'guest', circle: 'veil' };
    if (authUser) {
      const claims = authUser.roles || authUser['urn:zitadel:iam:org:project:roles'] || [];
      const roles = Array.isArray(claims) ? claims : Object.keys(claims);
      const admin = roles.some(role => ['demiurge', 'sysadmin', 'architect'].includes(role));
      loadedData = {
        ...loadedData,
        displayName: authUser.name || authUser.preferred_username || 'Operador RDA',
        username: authUser.preferred_username || authUser.username || 'operador',
        email: authUser.email || '',
        tier: admin ? 'sysadmin' : 'standard',
        role: admin ? 'sysadmin' : 'member',
        circle: admin ? 'arcane' : 'practice'
      };
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

  async handleSaveIdentity() {
    if (this.inputDisplayName) this.userData.displayName = this.inputDisplayName.value.trim() || 'Convidado';
    if (this.inputUsername) this.userData.username = this.inputUsername.value.trim() || 'guest';
    if (this.inputEmail) this.userData.email = this.inputEmail.value.trim() || 'offline@unkayos.local';
    if (this.inputOrganization) this.userData.organization = this.inputOrganization.value.trim();
    if (this.inputBio) this.userData.bio = this.inputBio.value.trim();

    if (!await this.persistUserData()) return;
    this.renderProfileToUI();
    this.showToast('Identidade atualizada com sucesso!');
  }

  async handleSavePreferences() {
    this.userData.preferences = {
      defaultShell: this.selectDefaultShell ? this.selectDefaultShell.value : 'wasi-bash',
      promptStyle: this.selectPromptStyle ? this.selectPromptStyle.value : 'standard',
      homeDir: this.inputHomeDir ? this.inputHomeDir.value.trim() : '/home/user',
      timezone: this.selectTimezone ? this.selectTimezone.value : 'America/Sao_Paulo',
      autoSaveClips: this.checkAutoSaveClips ? this.checkAutoSaveClips.checked : true,
      syncHistory: this.checkSyncHistory ? this.checkSyncHistory.checked : true
    };

    if (!await this.persistUserData()) return;
    eventBus.emit('user:preferences_updated', this.userData.preferences);
    this.showToast('Preferências salvas no VFS!');
  }

  async handleDevProfileClick(tier, role, name) {
    if (!this.isDev) return;
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
    if (!await this.persistUserData()) return;
    this.renderProfileToUI();

    eventBus.emit('user:profile_updated', this.userData);

    this.showToast(`Perfil simulado ativado: ${name} (${tier.toUpperCase()})`);
  }

  async handleLoginZitadel() {
    try {
      if (!this.auth?.login) throw new Error('Serviço SSO indisponível.');
      await this.auth.login();
    } catch (e) {
      console.warn(`[UserProfileApp] Erro ao iniciar login Zitadel:`, e);
      this.showToast(`Não foi possível iniciar o SSO: ${e.message}`);
    }
  }

  async handleLogout() {
    try { await this.auth?.logout?.(); }
    catch (error) { this.showToast(`Erro ao encerrar sessão: ${error.message}`); return; }
    this.userData.tier = 'guest';
    this.userData.role = 'guest';
    this.userData.displayName = 'Convidado';
    this.userData.username = 'guest';
    this.userData.email = 'offline@unkayos.local';
    this.userData.circle = 'veil';

    localStorage.removeItem('unkay_tier');
    localStorage.removeItem('unkay_auth_token');
    localStorage.removeItem('unkayos_auth_token');

    if (!await this.persistUserData()) return;
    this.renderProfileToUI();

    eventBus.emit('auth:logout');
    eventBus.emit('user:profile_updated', this.userData);

    this.showToast('Sessão encerrada com sucesso.');
  }

  async resetToDefaults() {
    this.userData.displayName = 'Convidado';
    this.userData.username = 'guest';
    this.userData.email = 'offline@unkayos.local';
    this.userData.organization = 'Reverso do Avesso • Core Labs';
    this.userData.bio = '';
    this.userData.avatar = '/assets/icons/apps/generic_app_icon.svg';

    if (!await this.persistUserData()) return;
    this.renderProfileToUI();
    this.showToast('Configurações redefinidas para o padrão.');
  }

  async persistUserData() {
    try {
      await writePreferences(this.fileSystem, this.profileConfigPath, 'unkayos_user_profile', this.userData);
    } catch (e) {
      this.showToast(e.message);
      return false;
    }

    // Notifica o sistema
    eventBus.emit('user:profile_updated', this.userData);
    return true;
  }

  async updateStorageStats() {
    let filesCount = 0;
    let webClipsCount = 0;

    try {
      if (this.fileSystem && typeof this.fileSystem.readdir === 'function') {
        const homeList = await this.fileSystem.readdir('/home/user') || [];
        filesCount = homeList.length;

        const clipsList = await this.fileSystem.readdir('/home/user/documents/web-clips') || [];
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

  async cleanTmp() {
    try {
      const removed = await clearTemporaryFiles(this.fileSystem);
      this.showToast(`${removed} arquivo(s) temporário(s) removido(s).`);
    } catch (e) {
      this.showToast('Nenhum arquivo temporário pendente.');
    }
  }

  showToast(msg) {
    const existing = this.$('.profile-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'profile-toast';
    toast.textContent = ` ${msg}`;

    if (this.appContentRoot) {
      this.appContentRoot.appendChild(toast);
      this.setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 3000);
    }
  }

  async onCleanup() {
    this.auth?.off?.('change', this.authChanged);
    await super.onCleanup();
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
