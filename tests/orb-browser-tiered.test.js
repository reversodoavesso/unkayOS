// @vitest-environment happy-dom
// tests/orb-browser-tiered.test.js - unkayOS 2.0 Tiered Orb Browser Test Suite
// Verifies multi-tier engine, streaming proxy routing, guest fallback, tabs, and VFS web clip export

import { describe, it, expect, beforeEach, vi } from 'vitest';
import TheOrbApp from '../apps/browser/main.js';

describe('The Orb Browser v2.0 - Adaptive Tiered Engine', () => {
  let mockCORE;
  let mockStandardAPIs;
  let rootElement;
  let vfsStorage;

  beforeEach(() => {
    mockCORE = {
      instanceId: 'theorb-test-instance',
      app_name: 'The Orb Browser',
      mode: 'system_window'
    };

    vfsStorage = new Map();

    mockStandardAPIs = {
      setTimeout: (fn) => setTimeout(fn, 0),
      setInterval: () => 1,
      clearTimeout: () => {},
      clearInterval: () => {},
      appManager: {},
      fileSystem: {
        mkdir: vi.fn((path) => {}),
        writeFile: vi.fn((path, content) => {
          vfsStorage.set(path, content);
        })
      },
      auth: {
        getTier: vi.fn(() => 'standard')
      }
    };

    // Cria o DOM da aplicação simulando apps/browser/index.html
    rootElement = document.createElement('div');
    rootElement.innerHTML = `
      <div id="theorb-app" class="browser-container">
        <header class="browser-toolbar">
          <div class="nav-button-group">
            <button id="backBtn" class="browser-btn"></button>
            <button id="forwardBtn" class="browser-btn"></button>
            <button id="reloadBtn" class="browser-btn"></button>
            <button id="homeBtn" class="browser-btn"></button>
          </div>
          <div class="browser-address-bar">
            <span class="security-indicator" id="securityIndicator">🔒</span>
            <input type="text" id="urlInput" class="browser-url-input" />
            <button id="goBtn" class="browser-btn-go">➜</button>
          </div>
          <div class="browser-tools-group">
            <button id="readerModeBtn" class="browser-btn tool-btn"></button>
            <button id="saveClipBtn" class="browser-btn tool-btn"></button>
            <button id="newTabBtn" class="browser-btn"></button>
            <div class="user-tier-badge" id="browserTierBadge">
              <span class="tier-dot"></span>
              <span class="tier-text">GUEST</span>
            </div>
          </div>
        </header>
        <nav id="tabsContainer" class="browser-tabs-container"></nav>
        <main id="contentArea" class="browser-content-area">
          <div id="welcomeView" class="browser-view welcome-view">
            <h4 id="tierBannerTitle"></h4>
            <p id="tierBannerDesc"></p>
            <button class="speed-dial-card" data-url="https://github.com/trending"></button>
          </div>
          <div id="proxyView" class="browser-view proxy-view" style="display: none;">
            <iframe id="browserProxyIframe" class="browser-viewport-frame"></iframe>
          </div>
          <div id="readerView" class="browser-view reader-view" style="display: none;">
            <h1 id="readerArticleTitle" class="reader-title"></h1>
            <span id="readerArticleSource"></span>
            <span id="readerArticleDate"></span>
            <div id="readerArticleBody" class="reader-body"></div>
          </div>
          <div id="guestFallbackView" class="browser-view fallback-view" style="display: none;">
            <strong id="restrictedDomainName"></strong>
            <button id="openExternalTabBtn"></button>
            <button id="activateReaderFallbackBtn"></button>
            <button id="loginToProxyBtn"></button>
          </div>
          <div id="canvasView" class="browser-view canvas-view" style="display: none;">
            <span id="rbiLatency"></span>
            <canvas id="orbRemoteCanvas"></canvas>
          </div>
        </main>
      </div>
    `;
    document.body.appendChild(rootElement);
  });

  it('should initialize and detect Standard Member tier correctly', () => {
    const app = new TheOrbApp(mockCORE, mockStandardAPIs, rootElement);
    app.onRun();

    expect(app.currentTier).toBe('standard');
    expect(app.tabs.length).toBe(1);
    expect(app.browserTierBadge.classList.contains('tier-standard')).toBe(true);
    expect(rootElement.querySelector('#tierBannerTitle').textContent).toContain('Membro Ativo');
  });

  it('should detect Guest tier and route restricted anti-framing domains to Fallback View', () => {
    mockStandardAPIs.auth.getTier.mockReturnValue('guest');
    const app = new TheOrbApp(mockCORE, mockStandardAPIs, rootElement);
    app.onRun();

    expect(app.currentTier).toBe('guest');
    expect(app.browserTierBadge.classList.contains('tier-guest')).toBe(true);

    // Navega para um domínio com proteção anti-framing conhecida (GitHub)
    app.navigateToUrl('https://github.com/trending');

    expect(app.guestFallbackView.style.display).toBe('flex');
    expect(app.proxyView.style.display).toBe('none');
    expect(rootElement.querySelector('#restrictedDomainName').textContent).toBe('github.com');
  });

  it('should route unrestricted or member sessions through the streaming proxy endpoint', () => {
    mockStandardAPIs.auth.getTier.mockReturnValue('standard');
    const app = new TheOrbApp(mockCORE, mockStandardAPIs, rootElement);
    app.onRun();

    app.navigateToUrl('https://github.com/trending');

    expect(app.proxyView.style.display).toBe('flex');
    expect(app.browserProxyIframe.src).toBe('http://localhost:3005/api/proxy?url=https%3A%2F%2Fgithub.com%2Ftrending');
  });

  it('should manage multiple tabs (create, switch, close)', () => {
    const app = new TheOrbApp(mockCORE, mockStandardAPIs, rootElement);
    app.onRun();

    expect(app.tabs.length).toBe(1);
    const firstTabId = app.activeTabId;

    // Cria segunda aba
    const tab2Id = app.createTab('https://news.ycombinator.com');
    expect(app.tabs.length).toBe(2);
    expect(app.activeTabId).toBe(tab2Id);
    expect(app.urlInput.value).toBe('https://news.ycombinator.com');

    // Alterna de volta para a primeira aba
    app.setActiveTab(firstTabId);
    expect(app.activeTabId).toBe(firstTabId);

    // Fecha a segunda aba
    app.closeTab(tab2Id);
    expect(app.tabs.length).toBe(1);
    expect(app.activeTabId).toBe(firstTabId);
  });

  it('should extract RDA Reader Mode data and export Markdown web clips to VFS', async () => {
    const app = new TheOrbApp(mockCORE, mockStandardAPIs, rootElement);
    app.onRun();

    const activeTab = app.getActiveTab();
    activeTab.url = 'https://news.ycombinator.com';
    activeTab.title = 'Hacker News Show';
    activeTab.readerData = {
      title: 'Show HN: unkayOS 2.0 WebAssembly Desktop',
      source: 'https://news.ycombinator.com',
      date: new Date().toISOString(),
      markdown: 'unkayOS 2.0 is a complete WebAssembly-powered operating system for the browser.'
    };

    await app.handleSaveClip();

    expect(mockStandardAPIs.fileSystem.mkdir).toHaveBeenCalledWith('/home/user/documents/web-clips', { recursive: true });
    expect(mockStandardAPIs.fileSystem.writeFile).toHaveBeenCalled();

    const savedFiles = Array.from(vfsStorage.keys());
    expect(savedFiles.some(f => f.startsWith('/home/user/documents/web-clips/'))).toBe(true);

    const savedContent = vfsStorage.get(savedFiles[0]);
    expect(savedContent).toContain('title: "Show HN: unkayOS 2.0 WebAssembly Desktop"');
    expect(savedContent).toContain('tier: "standard"');
    expect(savedContent).toContain('unkayOS 2.0 is a complete WebAssembly-powered');
  });
});
