// @vitest-environment happy-dom
// tests/user-profile-and-settings.test.js - unkayOS 2.0 User Profile & Settings Test Suite

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import UserProfileApp from '../apps/user-profile/main.js';
import SettingsApp from '../apps/settings/main.js';
import eventBus from '../core/eventBus.js';
import fs from 'fs';
import path from 'path';

describe('unkayOS 2.0 User Profile & System Settings Apps', () => {
  let mockCORE;
  let mockStandardAPIs;
  let vfsStorage;

  beforeEach(() => {
    mockCORE = {
      instanceId: 'test-inst',
      app_name: 'Test App',
      mode: 'system_window'
    };

    vfsStorage = new Map();

    mockStandardAPIs = {
      setTimeout: (fn) => setTimeout(fn, 0),
      clearTimeout: () => {},
      appManager: {},
      fileSystem: {
        mkdir: vi.fn(),
        readFile: vi.fn((filePath) => vfsStorage.get(filePath) || null),
        writeFile: vi.fn((filePath, content) => {
          vfsStorage.set(filePath, content);
        }),
        readdir: vi.fn((dirPath) => {
          const files = [];
          for (const key of vfsStorage.keys()) {
            if (key.startsWith(dirPath + '/')) {
              files.push(key.replace(dirPath + '/', ''));
            }
          }
          return files;
        }),
        unlink: vi.fn((filePath) => vfsStorage.delete(filePath))
      },
      auth: {
        getCurrentUser: vi.fn(() => null),
        login: vi.fn(),
        logout: vi.fn()
      }
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '';
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  describe('User Profile Panel (apps/user-profile)', () => {
    let profileRoot;

    beforeEach(() => {
      profileRoot = document.createElement('div');
      profileRoot.innerHTML = `
        <div id="user-profile-app">
          <img id="userAvatarImg" src="" />
          <span id="userStatusDot" class="status-indicator"></span>
          <h2 id="headerDisplayName"></h2>
          <span id="headerTierBadge"></span>
          <span id="headerCircleBadge"></span>
          <span id="headerUsername"></span>
          <span id="headerEmail"></span>
          <button id="ssoQuickActionBtn"><span id="ssoQuickActionText"></span></button>

          <input id="inputDisplayName" type="text" />
          <input id="inputUsername" type="text" />
          <input id="inputEmail" type="text" />
          <input id="inputOrganization" type="text" />
          <textarea id="inputBio"></textarea>
          <button id="saveIdentityBtn"></button>
          <button id="resetIdentityBtn"></button>

          <h4 id="ssoStatusTitle"></h4>
          <p id="ssoStatusDesc"></p>
          <button id="loginZitadelBtn"></button>
          <button id="logoutBtn"></button>

          <select id="selectDefaultShell"><option value="wasi-bash">WASI Bash</option></select>
          <select id="selectPromptStyle"><option value="standard">Standard</option></select>
          <input id="inputHomeDir" type="text" />
          <select id="selectTimezone"><option value="America/Sao_Paulo">SP</option></select>
          <input type="checkbox" id="checkAutoSaveClips" />
          <input type="checkbox" id="checkSyncHistory" />
          <button id="savePreferencesBtn"></button>

          <span id="storageUsageText"></span>
          <div id="storageMeterFill"></div>
          <p id="homeFilesCount"></p>
          <p id="webClipsCount"></p>
          <button id="openFileManagerBtn"></button>
          <button id="cleanUserTmpBtn"></button>

          <section id="sectionIdentity" class="profile-section"></section>
          <section id="sectionSso" class="profile-section" style="display:none;"></section>
          <section id="sectionPreferences" class="profile-section" style="display:none;"></section>
          <section id="sectionStorage" class="profile-section" style="display:none;"></section>
        </div>
      `;
      document.body.appendChild(profileRoot);
    });

    it('should initialize with default Guest state and render headers', async () => {
      const app = new UserProfileApp(mockCORE, mockStandardAPIs, profileRoot);
      await app.onRun();

      expect(app.userData.tier).toBe('guest');
      expect(app.userData.displayName).toBe('Convidado');
      expect(profileRoot.querySelector('#headerDisplayName').textContent).toBe('Convidado');
      expect(profileRoot.querySelector('#headerTierBadge').textContent).toBe('GUEST');
    });

    it('should save identity changes to VFS and localStorage', async () => {
      const app = new UserProfileApp(mockCORE, mockStandardAPIs, profileRoot);
      await app.onRun();

      profileRoot.querySelector('#inputDisplayName').value = 'Arquiteto Demiurgo';
      profileRoot.querySelector('#inputUsername').value = 'arquiteto';
      profileRoot.querySelector('#inputEmail').value = 'arquiteto@reversodoavesso.com';

      await app.handleSaveIdentity();

      expect(app.userData.displayName).toBe('Arquiteto Demiurgo');
      expect(app.userData.username).toBe('arquiteto');
      expect(mockStandardAPIs.fileSystem.writeFile).toHaveBeenCalledWith(
        '/home/user/.config/user-profile.json',
        expect.stringContaining('Arquiteto Demiurgo')
      );
      expect(localStorage.getItem('unkayos_user_profile')).toContain('Arquiteto Demiurgo');
    });

    it('should simulate SSO dev profiles (Guest, Acolyte, Member, Sysadmin) and emit events', async () => {
      const app = new UserProfileApp(mockCORE, mockStandardAPIs, profileRoot);
      await app.onRun();

      const profileUpdatedSpy = vi.fn();
      eventBus.on('user:profile_updated', profileUpdatedSpy);

      await app.handleDevProfileClick('sysadmin', 'sysadmin', 'Demiurgo Supremo');

      expect(app.userData.tier).toBe('sysadmin');
      expect(app.userData.role).toBe('sysadmin');
      expect(app.userData.circle).toBe('arcane');
      expect(localStorage.getItem('unkay_tier')).toBe('sysadmin');
      expect(profileUpdatedSpy).toHaveBeenCalled();
    });

    it('loads async VFS preferences without trusting a cached tier', async () => {
      mockStandardAPIs.fileSystem.readFile.mockResolvedValue(JSON.stringify({ displayName: 'Persistido', tier: 'sysadmin', preferences: { autoSaveClips: false } }));
      const app = new UserProfileApp(mockCORE, mockStandardAPIs, profileRoot);
      await app.onRun();
      expect(app.userData.displayName).toBe('Persistido');
      expect(app.userData.tier).toBe('guest');
      expect(app.userData.preferences.autoSaveClips).toBe(false);
    });

    it('uses the actual SSO identity before a cached guest profile', async () => {
      localStorage.setItem('unkayos_user_profile', JSON.stringify({ username: 'guest', tier: 'guest' }));
      mockStandardAPIs.auth.getCurrentUser.mockReturnValue({ name: 'SSO User', email: 'user@example.org', roles: { sysadmin: {} } });
      const app = new UserProfileApp(mockCORE, mockStandardAPIs, profileRoot);
      await app.onRun();
      expect(app.userData.displayName).toBe('SSO User');
      expect(app.userData.tier).toBe('sysadmin');
      await app.handleLogout();
      expect(mockStandardAPIs.auth.logout).toHaveBeenCalledOnce();
    });

    it('never simulates a successful session after SSO failure', async () => {
      mockStandardAPIs.auth.login.mockRejectedValue(new Error('SSO offline'));
      const app = new UserProfileApp(mockCORE, mockStandardAPIs, profileRoot);
      await app.onRun();
      await app.handleLoginZitadel();
      expect(app.userData.tier).toBe('guest');
      expect(localStorage.getItem('unkay_auth_token')).toBeNull();
      expect(profileRoot.querySelector('.profile-toast').textContent).toContain('SSO offline');
      app.isDev = false;
      await app.handleDevProfileClick('sysadmin', 'sysadmin', 'Fake');
      expect(app.userData.tier).toBe('guest');
    });

    it('should logout cleanly and reset user identity to Guest', async () => {
      const app = new UserProfileApp(mockCORE, mockStandardAPIs, profileRoot);
      await app.onRun();

      await app.handleDevProfileClick('standard', 'member', 'Membro Ativo');
      expect(app.userData.tier).toBe('standard');

      await app.handleLogout();
      expect(app.userData.tier).toBe('guest');
      expect(app.userData.displayName).toBe('Convidado');
      expect(localStorage.getItem('unkay_tier')).toBeNull();
    });
  });

  describe('General System Settings (apps/settings)', () => {
    let settingsRoot;
    let desktopElement;

    beforeEach(() => {
      desktopElement = document.createElement('div');
      desktopElement.id = 'desktop';
      document.body.appendChild(desktopElement);

      settingsRoot = document.createElement('div');
      settingsRoot.innerHTML = `
        <div id="settings-app">
          <input id="settingsSearchInput" type="text" />
          <nav class="sidebar-nav">
            <button class="nav-item active" data-panel="appearance"></button>
            <button class="nav-item" data-panel="windowing"></button>
            <button class="nav-item" data-panel="storage"></button>
            <button class="nav-item" data-panel="services"></button>
            <button class="nav-item" data-panel="security"></button>
            <button class="nav-item" data-panel="about"></button>
          </nav>

          <main class="settings-content">
            <div id="panelAppearance" class="settings-panel active">
              <label class="theme-option active" data-theme="dark"></label>
              <label class="theme-option" data-theme="light"></label>
              <button class="wallpaper-thumb active" data-wp="/assets/images/wallpaper_01.jpg"></button>
              <input type="text" id="customWallpaperUrl" />
              <button id="applyCustomWallpaperBtn"></button>
              <input type="checkbox" id="toggleGlassmorphism" checked />
              <select id="selectFontScale"><option value="standard" selected>Padrão</option></select>
            </div>
            <div id="panelWindowing" class="settings-panel" style="display:none;">
              <input type="checkbox" id="toggleAeroSnap" checked />
              <input type="checkbox" id="toggleCenterWindows" checked />
              <select id="selectTaskbarPosition"><option value="bottom">Inferior</option></select>
              <input type="checkbox" id="toggleAutoHideTaskbar" />
            </div>
            <div id="panelStorage" class="settings-panel" style="display:none;">
              <span id="vfsUsageText"></span>
              <div id="vfsMeterFill"></div>
              <input type="text" id="inputMinioUrl" />
              <input type="text" id="inputMinioBucket" />
              <button id="syncMinioNowBtn"></button>
              <button id="exportBackupBtn"></button>
              <button id="cleanTmpBtn"></button>
            </div>
            <div id="panelServices" class="settings-panel" style="display:none;">
              <span id="computeLatency"></span>
              <span id="authLatency"></span>
              <span id="userLatency"></span>
              <button id="checkServicesHealthBtn"></button>
              <input type="checkbox" id="toggleOfflineMode" />
            </div>
            <div id="panelSecurity" class="settings-panel" style="display:none;">
              <input type="checkbox" id="toggleStrictSandbox" checked />
              <input type="checkbox" id="toggleSecureHostDrop" checked />
            </div>
            <div id="panelAbout" class="settings-panel" style="display:none;">
              <button id="checkUpdatesBtn"></button>
              <button id="resetAllSettingsBtn"></button>
            </div>
          </main>
        </div>
      `;
      document.body.appendChild(settingsRoot);
    });

    it('should initialize with the canonical identity and apply the selected theme', async () => {
      const app = new SettingsApp(mockCORE, mockStandardAPIs, settingsRoot, desktopElement);
      await app.onRun();

      expect(app.systemSettings.appearance.theme).toBe('dark');
      expect(app.systemSettings.appearance).not.toHaveProperty('accentColor');
      expect(document.documentElement.style.getPropertyValue('--rda-color-primary-400')).toBe('');
    });

    it('should migrate a saved accent without losing other appearance preferences', async () => {
      localStorage.setItem('unkayos_system_settings', JSON.stringify({ appearance: {
        theme: 'light', accentColor: '#a855f7', wallpaper: '#0a0a0a', fontScale: 'large'
      } }));
      const app = new SettingsApp(mockCORE, mockStandardAPIs, settingsRoot, desktopElement);
      await app.onRun();
      await app.saveSettings();
      const persisted = JSON.parse(localStorage.getItem('unkayos_system_settings'));
      expect(persisted.appearance).not.toHaveProperty('accentColor');
      expect(persisted.appearance.theme).toBe('light');
      expect(persisted.appearance.wallpaper).toBe('#0a0a0a');
      expect(persisted.appearance.fontScale).toBe('large');
      expect(document.documentElement.style.getPropertyValue('--rda-color-primary-400')).toBe('');
      expect(mockStandardAPIs.fileSystem.writeFile).toHaveBeenCalledWith(
        '/etc/unkay-settings.json',
        expect.not.stringContaining('accentColor')
      );
    });

    it('should update wallpaper and apply immediately to desktop element', async () => {
      const app = new SettingsApp(mockCORE, mockStandardAPIs, settingsRoot, desktopElement);
      await app.onRun();

      await app.handleWallpaperClick('radial-gradient(circle, #164e63, #0a0a0a)');

      expect(app.systemSettings.appearance.wallpaper).toContain('radial-gradient');
      expect(desktopElement.style.backgroundImage).toContain('radial-gradient');
    });

    it('should export full VFS backup to /home/user/documents/unkayos-backup-*.json', async () => {
      const app = new SettingsApp(mockCORE, mockStandardAPIs, settingsRoot, desktopElement);
      await app.onRun();

      await app.exportVfsBackup();

      expect(mockStandardAPIs.fileSystem.mkdir).toHaveBeenCalledWith('/home/user/documents', { recursive: true });
      expect(mockStandardAPIs.fileSystem.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\/home\/user\/documents\/unkayos-backup-\d+\.json/),
        expect.stringContaining('"version": "2.0.0-alpha.2"')
      );
    });
  });

  describe('Apps Registration in apps.json', () => {
    it('should contain both user-profile and settings in apps.json', async () => {
      const appsJsonPath = path.resolve('apps/apps.json');
      const appsJson = JSON.parse(fs.readFileSync(appsJsonPath, 'utf8'));

      const userProfileApp = appsJson.app_configs.find(a => a.id === 'user-profile');
      const settingsApp = appsJson.app_configs.find(a => a.id === 'settings');

      expect(userProfileApp, 'user-profile should be registered').toBeTruthy();
      expect(userProfileApp.path).toBe('/apps/user-profile/');

      expect(settingsApp, 'settings should be registered').toBeTruthy();
      expect(settingsApp.path).toBe('/apps/settings/');
    });
  });
});
