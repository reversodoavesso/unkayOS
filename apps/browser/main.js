// apps/browser/main.js - The Orb Browser v2.0 (Adaptive Tiered Engine)

import { BaseApp } from '../../core/BaseApp.js';
import eventBus from '../../core/eventBus.js';

/**
 * The Orb Browser v2.0 - Navegador Web Adaptativo com Arquitetura de 3 Camadas:
 * 1. Convidado (Guest): Leitor RDA limpo + OEmbed nativo + Fallback anti-framing
 * 2. Membro Padrão: Streaming Proxy HTTP com injeção de <base> e remoção de CSP/X-Frame-Options
 * 3. Sysadmin: Remote Browser Isolation (RBI) 60 FPS com streaming via WebSocket
 */
export default class TheOrbApp extends BaseApp {
  /**
   * Schema de parâmetros aceitos pelo The Orb Browser
   */
  static get parameters() {
    return {
      url: {
        type: 'string',
        required: false,
        description: 'URL inicial a ser aberta pelo navegador'
      },
      incognito: {
        type: 'boolean',
        required: false,
        description: 'Abrir em modo privado'
      },
      mode: {
        type: 'string',
        required: false,
        description: 'Modo de visualização inicial: proxy, reader, fallback ou canvas'
      }
    };
  }

  constructor(CORE, standardAPIs, appContentRoot = null, desktopElement = null) {
    super(CORE, standardAPIs, appContentRoot, desktopElement);

    // Estado das abas
    this.tabs = [];
    this.activeTabId = null;
    this.tabCounter = 1;

    // Camada de autorização detectada ('guest' | 'standard' | 'sysadmin')
    this.currentTier = 'guest';

    // Endpoints de computação
    this.proxyServiceUrl = 'http://localhost:3005/api/proxy';
    this.rbiWsUrl = 'ws://localhost:3005/ws/browser';
    this.rbiSocket = null;

    // Domínios conhecidos com proteção anti-framing estrita (X-Frame-Options)
    this.antiFramingDomains = [
      'google.com',
      'google.com.br',
      'github.com',
      'twitter.com',
      'x.com',
      'facebook.com',
      'instagram.com',
      'linkedin.com',
      'reddit.com',
      'notion.so',
      'youtube.com'
    ];

    // Bindings de manipuladores
    this.handleUrlSubmit = this.handleUrlSubmit.bind(this);
    this.handleBackClick = this.handleBackClick.bind(this);
    this.handleForwardClick = this.handleForwardClick.bind(this);
    this.handleReloadClick = this.handleReloadClick.bind(this);
    this.handleHomeClick = this.handleHomeClick.bind(this);
    this.handleNewTabClick = this.handleNewTabClick.bind(this);
    this.handleReaderToggle = this.handleReaderToggle.bind(this);
    this.handleSaveClip = this.handleSaveClip.bind(this);
  }

  /**
   * Ciclo de vida: inicialização com o DOM montado
   */
  onRun(terminalOutputCallback = null, appParams = {}) {
    console.log(`[TheOrbApp - ${this.instanceId}] Inicializando Orb Browser v2.0...`);

    // Elementos da barra de ferramentas
    this.urlInput = this.$('#urlInput');
    this.goBtn = this.$('#goBtn');
    this.backBtn = this.$('#backBtn');
    this.forwardBtn = this.$('#forwardBtn');
    this.reloadBtn = this.$('#reloadBtn');
    this.homeBtn = this.$('#homeBtn');
    this.newTabBtn = this.$('#newTabBtn');
    this.readerModeBtn = this.$('#readerModeBtn');
    this.saveClipBtn = this.$('#saveClipBtn');
    this.browserTierBadge = this.$('#browserTierBadge');
    this.tabsContainer = this.$('#tabsContainer');

    // Visualizações (views)
    this.welcomeView = this.$('#welcomeView');
    this.proxyView = this.$('#proxyView');
    this.browserProxyIframe = this.$('#browserProxyIframe');
    this.readerView = this.$('#readerView');
    this.guestFallbackView = this.$('#guestFallbackView');
    this.canvasView = this.$('#canvasView');

    // Elementos do Leitor RDA
    this.readerArticleTitle = this.$('#readerArticleTitle');
    this.readerArticleSource = this.$('#readerArticleSource');
    this.readerArticleDate = this.$('#readerArticleDate');
    this.readerArticleBody = this.$('#readerArticleBody');

    // Elementos do Fallback de Convidado
    this.restrictedDomainName = this.$('#restrictedDomainName');
    this.openExternalTabBtn = this.$('#openExternalTabBtn');
    this.activateReaderFallbackBtn = this.$('#activateReaderFallbackBtn');
    this.loginToProxyBtn = this.$('#loginToProxyBtn');

    // Elementos do Canvas Sysadmin (RBI)
    this.orbRemoteCanvas = this.$('#orbRemoteCanvas');
    this.rbiLatency = this.$('#rbiLatency');

    // Detecta o nível de acesso do usuário (Guest / Standard / Sysadmin)
    this.detectUserTier();

    // Registra listeners de controle
    this.registerEventListeners();

    // Inicializa a primeira aba
    const initialUrl = appParams.url || null;
    this.createTab(initialUrl);

    if (initialUrl) {
      this.navigateToUrl(initialUrl);
    } else {
      this.switchView('welcome');
    }
  }

  /**
   * Detecta o nível de permissão do usuário
   */
  detectUserTier() {
    let tier = 'guest';

    try {
      // 1. Tenta API do SDK unkay
      if (this.standardAPIs?.auth?.getTier) {
        tier = this.standardAPIs.auth.getTier();
      } else if (window.unkay?.auth?.getTier) {
        tier = window.unkay.auth.getTier();
      } else if (window.unkay?.auth?.getCurrentUser) {
        const user = window.unkay.auth.getCurrentUser();
        if (user?.role === 'sysadmin' || user?.role === 'admin') {
          tier = 'sysadmin';
        } else if (user?.role === 'standard' || user?.role === 'member') {
          tier = 'standard';
        }
      }

      // 2. Fallback por storage local
      if (tier === 'guest') {
        const storedTier = localStorage.getItem('unkay_tier') || sessionStorage.getItem('unkay_tier');
        if (storedTier) {
          tier = storedTier;
        } else {
          const token = localStorage.getItem('unkay_auth_token') || sessionStorage.getItem('unkay_auth_token');
          if (token) {
            tier = 'standard';
          }
        }
      }
    } catch (e) {
      console.warn(`[TheOrbApp] Erro ao detectar tier do usuário:`, e);
      tier = 'guest';
    }

    this.currentTier = tier;
    this.updateTierBadgeUI();
  }

  /**
   * Atualiza os elementos visuais do tier badge e banners
   */
  updateTierBadgeUI() {
    if (!this.browserTierBadge) return;

    this.browserTierBadge.classList.remove('tier-guest', 'tier-standard', 'tier-sysadmin');
    this.browserTierBadge.classList.add(`tier-${this.currentTier}`);

    const tierTextEl = this.browserTierBadge.querySelector('.tier-text');
    if (tierTextEl) {
      tierTextEl.textContent = this.currentTier.toUpperCase();
    }

    // Atualiza banner na tela de boas-vindas
    const bannerTitle = this.$('#tierBannerTitle');
    const bannerDesc = this.$('#tierBannerDesc');

    if (bannerTitle && bannerDesc) {
      if (this.currentTier === 'sysadmin') {
        bannerTitle.textContent = 'Modo Sysadmin Ativo';
        bannerDesc.textContent = 'Acesso irrestrito com Streaming Proxy acelerado e Remote Browser Isolation (RBI) de baixa latência.';
      } else if (this.currentTier === 'standard') {
        bannerTitle.textContent = 'Modo Membro Ativo';
        bannerDesc.textContent = 'Navegação contínua com Streaming Proxy, contornando X-Frame-Options e CSP sem consumo excessivo de RAM no servidor.';
      } else {
        bannerTitle.textContent = 'Modo Convidado (Guest) Ativo';
        bannerDesc.textContent = 'Sites que proíbem frames externos abrem em Modo Leitor RDA ou no navegador hospedeiro. Faça login para Streaming Proxy completo.';
      }
    }
  }

  /**
   * Registra os eventos da interface
   */
  registerEventListeners() {
    if (this.goBtn) {
      this.goBtn.addEventListener('click', this.handleUrlSubmit);
    }
    if (this.urlInput) {
      this.urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.handleUrlSubmit();
        }
      });
    }

    if (this.backBtn) this.backBtn.addEventListener('click', this.handleBackClick);
    if (this.forwardBtn) this.forwardBtn.addEventListener('click', this.handleForwardClick);
    if (this.reloadBtn) this.reloadBtn.addEventListener('click', this.handleReloadClick);
    if (this.homeBtn) this.homeBtn.addEventListener('click', this.handleHomeClick);
    if (this.newTabBtn) this.newTabBtn.addEventListener('click', this.handleNewTabClick);
    if (this.readerModeBtn) this.readerModeBtn.addEventListener('click', this.handleReaderToggle);
    if (this.saveClipBtn) this.saveClipBtn.addEventListener('click', this.handleSaveClip);

    // Ações do Fallback Card
    if (this.openExternalTabBtn) {
      this.openExternalTabBtn.addEventListener('click', () => {
        const activeTab = this.getActiveTab();
        if (activeTab?.url) {
          window.open(activeTab.url, '_blank', 'noopener,noreferrer');
        }
      });
    }

    if (this.activateReaderFallbackBtn) {
      this.activateReaderFallbackBtn.addEventListener('click', () => {
        const activeTab = this.getActiveTab();
        if (activeTab?.url) {
          this.loadReaderMode(activeTab.url);
        }
      });
    }

    if (this.loginToProxyBtn) {
      this.loginToProxyBtn.addEventListener('click', () => {
        eventBus.emit('auth:request_login', { source: 'orb_browser' });
        this.showToast('Faça login no unkayOS para liberar o modo Streaming Proxy sem limites.');
      });
    }

    // Ações dos cards do Speed Dial
    const speedDialCards = this.$$('.speed-dial-card');
    speedDialCards.forEach(card => {
      card.addEventListener('click', () => {
        const targetUrl = card.getAttribute('data-url');
        if (targetUrl) {
          this.navigateToUrl(targetUrl);
        }
      });
    });

    // Atalhos de teclado comuns em browsers
    this.registerKeyboardShortcut('Control+t', (e) => {
      e.preventDefault();
      this.handleNewTabClick();
    });
    this.registerKeyboardShortcut('Control+w', (e) => {
      e.preventDefault();
      if (this.activeTabId) this.closeTab(this.activeTabId);
    });
    this.registerKeyboardShortcut('Alt+ArrowLeft', (e) => {
      e.preventDefault();
      this.handleBackClick();
    });
    this.registerKeyboardShortcut('Alt+ArrowRight', (e) => {
      e.preventDefault();
      this.handleForwardClick();
    });
  }

  /**
   * Retorna o objeto da aba ativa
   */
  getActiveTab() {
    return this.tabs.find(t => t.id === this.activeTabId) || null;
  }

  /**
   * Cria uma nova aba
   */
  createTab(url = null) {
    const tabId = `orb-tab-${this.tabCounter++}`;
    const newTab = {
      id: tabId,
      url: url || '',
      title: url ? this.getHostname(url) : 'Nova Aba',
      view: url ? 'proxy' : 'welcome',
      history: url ? [url] : [],
      historyIndex: url ? 0 : -1,
      readerData: null
    };

    this.tabs.push(newTab);

    // Cria o elemento da aba
    if (this.tabsContainer) {
      const tabEl = document.createElement('div');
      tabEl.className = 'tab';
      tabEl.dataset.tabId = tabId;
      tabEl.innerHTML = `
        <span class="tab-title">${newTab.title}</span>
        <button class="tab-close" title="Fechar aba">✕</button>
      `;

      tabEl.addEventListener('click', (e) => {
        if (!e.target.classList.contains('tab-close')) {
          this.setActiveTab(tabId);
        }
      });

      const closeBtn = tabEl.querySelector('.tab-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closeTab(tabId);
        });
      }

      this.tabsContainer.appendChild(tabEl);
    }

    this.setActiveTab(tabId);
    return tabId;
  }

  /**
   * Ativa uma aba específica
   */
  setActiveTab(tabId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    this.activeTabId = tabId;

    // Atualiza classes CSS nas abas
    if (this.tabsContainer) {
      this.tabsContainer.querySelectorAll('.tab').forEach(el => {
        if (el.dataset.tabId === tabId) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      });
    }

    // Atualiza barra de endereço
    if (this.urlInput) {
      this.urlInput.value = tab.url || '';
    }

    // Atualiza botões voltar/avançar
    this.updateNavigationButtons();

    // Restaura a visualização da aba
    this.switchView(tab.view);

    // Se estiver em modo proxy e o iframe não estiver com a URL correta
    if (tab.view === 'proxy' && tab.url && this.browserProxyIframe) {
      const proxyTarget = `${this.proxyServiceUrl}?url=${encodeURIComponent(tab.url)}`;
      if (this.browserProxyIframe.src !== proxyTarget) {
        this.browserProxyIframe.src = proxyTarget;
      }
    }
  }

  /**
   * Fecha uma aba
   */
  closeTab(tabId) {
    const tabIndex = this.tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    this.tabs.splice(tabIndex, 1);

    if (this.tabsContainer) {
      const tabEl = this.tabsContainer.querySelector(`[data-tab-id="${tabId}"]`);
      if (tabEl) tabEl.remove();
    }

    // Se a aba fechada era a ativa, troca para outra
    if (this.activeTabId === tabId) {
      if (this.tabs.length > 0) {
        const nextIndex = Math.max(0, tabIndex - 1);
        this.setActiveTab(this.tabs[nextIndex].id);
      } else {
        // Se fechou todas as abas, cria uma nova em branco
        this.createTab();
      }
    }
  }

  /**
   * Alterna entre as visualizações internas
   */
  switchView(viewName) {
    const views = {
      welcome: this.welcomeView,
      proxy: this.proxyView,
      reader: this.readerView,
      fallback: this.guestFallbackView,
      canvas: this.canvasView
    };

    Object.entries(views).forEach(([name, el]) => {
      if (el) {
        el.style.display = name === viewName ? 'flex' : 'none';
      }
    });

    const activeTab = this.getActiveTab();
    if (activeTab) {
      activeTab.view = viewName;
    }

    if (this.readerModeBtn) {
      if (viewName === 'reader') {
        this.readerModeBtn.classList.add('active');
      } else {
        this.readerModeBtn.classList.remove('active');
      }
    }
  }

  /**
   * Navega para a URL digitada ou pesquisada
   */
  navigateToUrl(input) {
    if (!input || !input.trim()) {
      this.switchView('welcome');
      return;
    }

    let url = input.trim();

    // Se não contiver protocolo e não tiver espaços, trata como URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.includes('.') && !url.includes(' ')) {
        url = 'https://' + url;
      } else {
        // Trata como termo de busca via DuckDuckGo
        url = `https://duckduckgo.com/html/?q=${encodeURIComponent(url)}`;
      }
    }

    const activeTab = this.getActiveTab();
    if (!activeTab) return;

    activeTab.url = url;
    activeTab.title = this.getHostname(url);

    // Atualiza histórico
    if (activeTab.historyIndex === -1 || activeTab.history[activeTab.historyIndex] !== url) {
      activeTab.history.push(url);
      activeTab.historyIndex = activeTab.history.length - 1;
    }

    if (this.urlInput) {
      this.urlInput.value = url;
    }

    // Atualiza título da aba no DOM
    this.updateTabTitle(activeTab.id, activeTab.title);
    this.updateNavigationButtons();

    // Roteamento baseado no nível (Tier) do usuário
    this.routeByTier(url);
  }

  /**
   * Roteia a exibição conforme o nível do usuário e as características do site
   */
  routeByTier(url) {
    const hostname = this.getHostname(url);

    // 1. GUEST TIER: Verifica se o domínio possui proteção de frame
    if (this.currentTier === 'guest') {
      const isRestricted = this.antiFramingDomains.some(d => hostname.endsWith(d));

      if (isRestricted) {
        // Exibe o painel de fallback limpo para convidados
        if (this.restrictedDomainName) {
          this.restrictedDomainName.textContent = hostname;
        }
        this.switchView('fallback');
        return;
      }
    }

    // 2. STANDARD / SYSADMIN TIER: Utiliza Streaming Proxy
    if (this.currentTier === 'standard' || this.currentTier === 'sysadmin') {
      const proxyUrl = `${this.proxyServiceUrl}?url=${encodeURIComponent(url)}`;

      if (this.browserProxyIframe) {
        this.browserProxyIframe.src = proxyUrl;
      }
      this.switchView('proxy');
      return;
    }

    // Se for guest mas o site não for anti-framing restrito, tenta iframe ou fallback
    const proxyUrl = `${this.proxyServiceUrl}?url=${encodeURIComponent(url)}`;
    if (this.browserProxyIframe) {
      this.browserProxyIframe.src = proxyUrl;
    }
    this.switchView('proxy');
  }

  /**
   * Extrai e renderiza o conteúdo no Modo Leitor RDA
   */
  async loadReaderMode(url) {
    this.switchView('reader');

    if (this.readerArticleTitle) this.readerArticleTitle.textContent = 'Carregando modo leitor...';
    if (this.readerArticleBody) this.readerArticleBody.innerHTML = '<p>Extraindo tipografia e limpando elementos desnecessários...</p>';

    try {
      const proxyUrl = `${this.proxyServiceUrl}?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl);
      const htmlText = await res.text();

      // Analisa o DOM da página
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');

      // Extrai metadados
      const title = doc.querySelector('title')?.innerText || doc.querySelector('h1')?.innerText || this.getHostname(url);
      const hostname = this.getHostname(url);
      const dateStr = new Date().toLocaleDateString('pt-BR');

      // Limpeza de tags desnecessárias
      const tagsToRemove = ['script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe', 'svg', 'noscript', 'button'];
      tagsToRemove.forEach(tag => {
        doc.querySelectorAll(tag).forEach(el => el.remove());
      });

      // Extrai parágrafos e títulos principais
      const contentNodes = doc.querySelectorAll('p, h2, h3, h4, blockquote, pre, img');
      let cleanHtml = '';
      let markdownLines = [];

      contentNodes.forEach(node => {
        if (node.tagName === 'IMG') {
          const src = node.getAttribute('src');
          if (src && !src.startsWith('data:')) {
            cleanHtml += `<p><img src="${src}" alt="Imagem do artigo" /></p>`;
            markdownLines.push(`![Imagem](${src})\n`);
          }
        } else {
          const text = node.innerText.trim();
          if (text.length > 20) {
            cleanHtml += `<p>${text}</p>`;
            if (node.tagName.startsWith('H')) {
              markdownLines.push(`\n## ${text}\n`);
            } else {
              markdownLines.push(`${text}\n`);
            }
          }
        }
      });

      if (!cleanHtml) {
        cleanHtml = `<p>Conteúdo simplificado para ${hostname}. Para visualizar a experiência interativa original completa, acesse pelo modo Streaming Proxy ou abra em uma aba externa.</p>`;
        markdownLines.push(`Conteúdo de ${url}`);
      }

      // Atualiza visualização do leitor
      if (this.readerArticleTitle) this.readerArticleTitle.textContent = title;
      if (this.readerArticleSource) this.readerArticleSource.textContent = `Fonte: ${hostname}`;
      if (this.readerArticleDate) this.readerArticleDate.textContent = `Data: ${dateStr}`;
      if (this.readerArticleBody) this.readerArticleBody.innerHTML = cleanHtml;

      // Armazena na aba ativa para exportação VFS
      const activeTab = this.getActiveTab();
      if (activeTab) {
        activeTab.readerData = {
          title,
          source: url,
          date: new Date().toISOString(),
          markdown: markdownLines.join('\n')
        };
      }
    } catch (err) {
      console.error(`[TheOrbApp] Erro ao carregar modo leitor:`, err);
      if (this.readerArticleTitle) this.readerArticleTitle.textContent = this.getHostname(url);
      if (this.readerArticleBody) {
        this.readerArticleBody.innerHTML = `
          <p>Não foi possível carregar a visualização leitor deste site diretamente.</p>
          <p>Você pode tentar recarregar via streaming proxy ou abrir o site externamente.</p>
        `;
      }
    }
  }

  /**
   * Salva o artigo ou página atual como Web Clip Markdown no Virtual File System (VFS)
   */
  async handleSaveClip() {
    const activeTab = this.getActiveTab();
    if (!activeTab || !activeTab.url) {
      this.showToast('Nenhuma página ativa para salvar.');
      return;
    }

    const title = activeTab.readerData?.title || activeTab.title || 'web-clip';
    const sourceUrl = activeTab.url;
    const dateIso = new Date().toISOString();
    const content = activeTab.readerData?.markdown || `Conteúdo capturado da página ${sourceUrl}`;

    // Monta o arquivo Markdown com Frontmatter YAML
    const markdownDocument = `---
title: "${title.replace(/"/g, '\\"')}"
source: "${sourceUrl}"
saved_at: "${dateIso}"
clipped_by: "The Orb Browser v2.0"
tier: "${this.currentTier}"
---

# ${title}

> Fonte original: [${sourceUrl}](${sourceUrl})
> Salvo via The Orb Browser no unkayOS 2.0

${content}
`;

    // Normaliza nome do arquivo
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 40) || 'artigo';

    const targetDir = '/home/user/documents/web-clips';
    const targetFile = `${targetDir}/${slug}.md`;

    try {
      // 1. Cria o diretório de destino se não existir
      if (this.fileSystem && typeof this.fileSystem.mkdir === 'function') {
        try {
          this.fileSystem.mkdir(targetDir, { recursive: true });
        } catch (_) {}
      }

      // 2. Grava o arquivo Markdown
      if (this.fileSystem && typeof this.fileSystem.writeFile === 'function') {
        this.fileSystem.writeFile(targetFile, markdownDocument);
      } else if (this.fs && typeof this.fs.writeFile === 'function') {
        this.fs.writeFile(targetFile, markdownDocument);
      } else if (this.unkay?.vfs && typeof this.unkay.vfs.writeFile === 'function') {
        await this.unkay.vfs.writeFile(targetFile, markdownDocument);
      } else if (window.unkay?.vfs && typeof window.unkay.vfs.writeFile === 'function') {
        await window.unkay.vfs.writeFile(targetFile, markdownDocument);
      } else {
        console.warn(`[TheOrbApp] VFS não disponível para escrita direta. Salvando em memória.`);
      }

      this.showToast(`Clip salvo com sucesso em: ${targetFile}`);
      console.log(`[TheOrbApp] Web Clip gravado com sucesso em ${targetFile}`);
    } catch (e) {
      console.error(`[TheOrbApp] Erro ao salvar Web Clip no VFS:`, e);
      this.showToast(`Erro ao salvar no VFS: ${e.message}`);
    }
  }

  /**
   * Conecta à sessão WebSocket de Remote Browser Isolation (Sysadmin)
   */
  setupRbiSession(url) {
    if (!this.orbRemoteCanvas) return;

    this.switchView('canvas');

    if (this.rbiSocket) {
      try { this.rbiSocket.close(); } catch (_) {}
    }

    try {
      const socket = new WebSocket(`${this.rbiWsUrl}?session=${encodeURIComponent(this.activeTabId)}`);
      this.rbiSocket = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'navigate', url }));
        if (this.rbiLatency) this.rbiLatency.textContent = 'Conectado (RBI 60fps)';
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ping' && this.rbiLatency) {
            this.rbiLatency.textContent = `Latência: ${msg.time ? Date.now() - msg.time : 1}ms`;
          }
        } catch (_) {}
      };

      socket.onerror = () => {
        if (this.rbiLatency) this.rbiLatency.textContent = 'Erro na conexão RBI';
      };
    } catch (err) {
      console.warn(`[TheOrbApp] WebSocket RBI não disponível:`, err);
    }
  }

  /**
   * Exibe uma notificação toast temporária
   */
  showToast(message) {
    const existing = this.$('.browser-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'browser-toast';
    toast.innerHTML = `<span>💾</span> <span>${message}</span>`;

    if (this.appContentRoot) {
      this.appContentRoot.appendChild(toast);
      this.setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 3500);
    }
  }

  // --- Handlers de navegação da Toolbar ---

  handleUrlSubmit() {
    if (this.urlInput) {
      this.navigateToUrl(this.urlInput.value);
    }
  }

  handleBackClick() {
    const activeTab = this.getActiveTab();
    if (activeTab && activeTab.historyIndex > 0) {
      activeTab.historyIndex--;
      const prevUrl = activeTab.history[activeTab.historyIndex];
      this.navigateToUrl(prevUrl);
    }
  }

  handleForwardClick() {
    const activeTab = this.getActiveTab();
    if (activeTab && activeTab.historyIndex < activeTab.history.length - 1) {
      activeTab.historyIndex++;
      const nextUrl = activeTab.history[activeTab.historyIndex];
      this.navigateToUrl(nextUrl);
    }
  }

  handleReloadClick() {
    const activeTab = this.getActiveTab();
    if (activeTab?.url) {
      if (activeTab.view === 'proxy' && this.browserProxyIframe) {
        this.browserProxyIframe.src = `${this.proxyServiceUrl}?url=${encodeURIComponent(activeTab.url)}&_t=${Date.now()}`;
      } else if (activeTab.view === 'reader') {
        this.loadReaderMode(activeTab.url);
      }
    }
  }

  handleHomeClick() {
    this.switchView('welcome');
    if (this.urlInput) this.urlInput.value = '';
    const activeTab = this.getActiveTab();
    if (activeTab) {
      activeTab.url = '';
      activeTab.title = 'Início';
      this.updateTabTitle(activeTab.id, 'Início');
    }
  }

  handleNewTabClick() {
    this.createTab();
  }

  handleReaderToggle() {
    const activeTab = this.getActiveTab();
    if (!activeTab || !activeTab.url) return;

    if (activeTab.view === 'reader') {
      this.routeByTier(activeTab.url);
    } else {
      this.loadReaderMode(activeTab.url);
    }
  }

  updateNavigationButtons() {
    const activeTab = this.getActiveTab();
    if (!activeTab) return;

    if (this.backBtn) {
      this.backBtn.disabled = activeTab.historyIndex <= 0;
    }
    if (this.forwardBtn) {
      this.forwardBtn.disabled = activeTab.historyIndex >= activeTab.history.length - 1;
    }
  }

  updateTabTitle(tabId, title) {
    if (!this.tabsContainer) return;
    const tabEl = this.tabsContainer.querySelector(`[data-tab-id="${tabId}"] .tab-title`);
    if (tabEl) {
      tabEl.textContent = title;
    }
  }

  getHostname(url) {
    try {
      return new URL(url).hostname;
    } catch (_) {
      return url;
    }
  }

  /**
   * Suporte CLI: executa comandos diretamente do terminal
   */
  static async runCli(args, writeLine) {
    let params = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--url' && args[i + 1]) {
        params.url = args[i + 1];
        i++;
      } else if (args[i] === '--incognito') {
        params.incognito = true;
      } else if (args[i] === '--mode' && args[i + 1]) {
        params.mode = args[i + 1];
        i++;
      } else if (args[i] === '--help' || args[i] === '-h') {
        writeLine('Uso: theorb [--url <endereço>] [--mode <proxy|reader>] [--incognito] [--help]');
        return;
      }
    }
    eventBus.emit('app:start', { appId: 'browser', params });
    writeLine('The Orb Browser iniciado com sucesso.');
  }

  /**
   * Limpeza de recursos ao fechar o app
   */
  async onCleanup() {
    if (this.rbiSocket) {
      try {
        this.rbiSocket.close();
      } catch (_) {}
      this.rbiSocket = null;
    }
    await super.onCleanup();
  }
}
