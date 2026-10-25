// apps/store/main.js - unkayOS 2.0 Official Marketplace Application
// Implements M4 from docs/plans/unkayos-marketplace-app-curation.md

import { BaseApp } from '../../core/BaseApp.js';
import { unkay } from '../../core/sdk/unkay.js';

export default class StoreApp extends BaseApp {
    constructor(CORE, standardAPIs) {
        super(CORE, standardAPIs);
        this.apps = [];
        this.installedAppIds = new Set();
        this.currentCategory = 'all';
        this.searchQuery = '';
        this.onlyCompatible = false;
        this.userTier = 'guest';
    }

    async onRun() {
        console.log('[Marketplace] Inicializando unkayOS Store...');
        this.userTier = unkay.auth.getTier();
        this.updateTierUI();
        await this.loadInstalledApps();
        await this.fetchCatalog();
        this.setupEventListeners();
        this.render();
    }

    updateTierUI() {
        const pill = this.$('#userTierPill');
        if (pill) {
            pill.textContent = `Perfil: ${this.userTier.toUpperCase()}`;
            pill.className = `user-tier-pill tier-${this.userTier}`;
        }
    }

    async loadInstalledApps() {
        try {
            const appsDir = '/home/user/apps';
            const exists = await unkay.fs.exists(appsDir);
            if (exists) {
                const list = await unkay.fs.list(appsDir);
                for (const item of list) {
                    this.installedAppIds.add(item.name || item);
                }
            }
        } catch {
            // No installed apps yet
        }
    }

    async fetchCatalog() {
        try {
            // Attempt fetching from compute-service or BFF gateway
            const res = await fetch('/api/marketplace/apps');
            if (res.ok) {
                const data = await res.json();
                this.apps = data.apps || [];
                return;
            }
        } catch {}

        // Fallback curated seed catalogue
        this.apps = [
            {
                id: "euterpe-bpm",
                name: "Euterpe BPM & Key Detector",
                summary: "Detector local de andamento e tonalidade harmônica com Web Audio DSP",
                description: "Ferramenta rápida e de alta precisão para analisar faixas de áudio diretamente no navegador com AudioWorklet. Compatível com a esteira de curadoria do Euterpe.",
                authorName: "Ordem RDA / Euterpe Core",
                category: "audio",
                appType: "native",
                runtimeProfile: "client-only",
                requiredTier: "guest",
                icon: "🎵",
                version: "1.0.0",
                permissions: ["storage:local", "audio:worklet"]
            },
            {
                id: "cine-notes",
                name: "Cine Quick Reviews & Curadoria",
                summary: "Bloco de notas rápidas e curadoria comunitária de cinema sincronizado com o Cine",
                description: "Aplicativo oficial para redigir críticas, listas de filmes e sincronizar anotações com o Cine Social via API GraphQL do RDA BFF.",
                authorName: "Cine Community",
                category: "media",
                appType: "native",
                runtimeProfile: "client-server",
                requiredTier: "standard",
                icon: "🎬",
                version: "1.2.0",
                permissions: ["auth:session", "network:bff"]
            },
            {
                id: "cloud-shell-pro",
                name: "Cloud Shell Pro (Compute Sandbox)",
                summary: "Terminal Linux interativo no Raspberry Pi com Docker sob demanda",
                description: "Estação de linha de comando com acesso aos utilitários reais da infraestrutura RDA (git, node, rda CLI) em container isolado.",
                authorName: "RDA Infra Team",
                category: "utilities",
                appType: "native",
                runtimeProfile: "containerized",
                requiredTier: "sysadmin",
                icon: "⚡",
                version: "2.0.0",
                permissions: ["compute:websocket", "auth:stepup-mfa"]
            },
            {
                id: "openui-studio",
                name: "OpenUI Declarative Studio",
                summary: "Gerador e playground de interfaces Generative UI com o Design System RDA",
                description: "Ambiente declarativo para prototipar telas e componentes com tokens oficiais do @reversodoavesso/design-system a partir de prompts em linguagem natural.",
                authorName: "RDA Design Ops",
                category: "ai",
                appType: "openui",
                runtimeProfile: "client-only",
                requiredTier: "guest",
                icon: "✨",
                version: "1.0.0",
                permissions: ["storage:local"]
            }
        ];
    }

    setupEventListeners() {
        const searchInput = this.$('#storeSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase().trim();
                this.render();
            });
        }

        const compatToggle = this.$('#compatFilterCheckbox');
        if (compatToggle) {
            compatToggle.addEventListener('change', (e) => {
                this.onlyCompatible = e.target.checked;
                this.render();
            });
        }

        const categoryTabs = this.$('#categoryTabs');
        if (categoryTabs) {
            categoryTabs.addEventListener('click', (e) => {
                const btn = e.target.closest('.tab-btn');
                if (!btn) return;
                this.elements.all('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentCategory = btn.dataset.category;
                this.render();
            });
        }

        const modalBackdrop = this.$('#modalBackdrop');
        const modalCloseBtn = this.$('#modalCloseBtn');
        if (modalBackdrop) modalBackdrop.addEventListener('click', () => this.closeModal());
        if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => this.closeModal());
    }

    isTierCompatible(requiredTier) {
        const tiersHierarchy = ['guest', 'standard', 'adept', 'sysadmin', 'demiurge'];
        const userLevel = tiersHierarchy.indexOf(this.userTier);
        const reqLevel = tiersHierarchy.indexOf(requiredTier || 'guest');
        return userLevel >= reqLevel;
    }

    getProfileBadge(profile) {
        switch (profile) {
            case 'client-only':
                return '<span class="profile-badge profile-client-only">🟢 100% Offline / Standalone</span>';
            case 'client-server':
                return '<span class="profile-badge profile-client-server">🔵 Nuvem RDA</span>';
            case 'containerized':
                return '<span class="profile-badge profile-containerized">🟣 Compute Dedicado</span>';
            case 'external-gateway':
                return '<span class="profile-badge profile-external-gateway">🟡 Integração Externa</span>';
            default:
                return `<span class="profile-badge">${profile}</span>`;
        }
    }

    render() {
        const grid = this.$('#appsGrid');
        if (!grid) return;

        let filtered = this.apps.filter(app => {
            // Category filter
            if (this.currentCategory !== 'all' && app.category !== this.currentCategory) {
                return false;
            }
            // Search filter
            if (this.searchQuery) {
                const q = this.searchQuery;
                const matchName = app.name.toLowerCase().includes(q);
                const matchDesc = (app.summary || app.description || '').toLowerCase().includes(q);
                if (!matchName && !matchDesc) return false;
            }
            // Compatibility filter
            if (this.onlyCompatible && !this.isTierCompatible(app.requiredTier)) {
                return false;
            }
            return true;
        });

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #64748b;">
                    <div style="font-size: 32px; margin-bottom: 8px;">📦</div>
                    <p style="margin: 0; font-size: 14px;">Nenhum aplicativo encontrado com os filtros atuais.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = filtered.map(app => {
            const isInstalled = this.installedAppIds.has(app.id);
            return `
                <div class="app-card" data-app-id="${app.id}">
                    <div class="card-top">
                        <div class="card-icon">${app.icon || '📦'}</div>
                        <div class="card-title">
                            <h3>${app.name}</h3>
                            <span class="author">${app.authorName || 'Comunidade RDA'} • v${app.version || '1.0.0'}</span>
                        </div>
                    </div>
                    ${this.getProfileBadge(app.runtimeProfile)}
                    <div class="card-summary">${app.summary || app.description || ''}</div>
                    <div class="card-bottom">
                        <span style="font-size: 11px; color: #64748b;">Tier: ${app.requiredTier || 'guest'}</span>
                        <button class="install-btn ${isInstalled ? 'installed' : ''}" data-action="install" data-app-id="${app.id}">
                            ${isInstalled ? '✓ Instalado' : 'Instalar'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Attach card and install click events
        grid.querySelectorAll('.app-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('button')) {
                    const btn = e.target.closest('button');
                    const appId = btn.dataset.appId;
                    this.handleInstall(appId, btn);
                    return;
                }
                const appId = card.dataset.appId;
                this.openDetailModal(appId);
            });
        });
    }

    async handleInstall(appId, btn) {
        const appItem = this.apps.find(a => a.id === appId);
        if (!appItem) return;

        if (this.installedAppIds.has(appId)) {
            console.log(`[Marketplace] Aplicativo ${appId} já instalado.`);
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Instalando...';

        try {
            // 1. Create app directory in VFS
            const appPath = `/home/user/apps/${appId}`;
            await unkay.fs.mkdir(appPath, true);

            // 2. Save manifest.json in VFS
            await unkay.fs.writeFile(`${appPath}/manifest.json`, JSON.stringify(appItem, null, 2));

            // 3. Create desktop shortcut launcher in VFS
            const desktopPath = `/home/guest/Desktop/${appItem.name.replace(/[^a-zA-Z0-9]/g, '_')}.desktop`;
            const desktopEntry = `[Desktop Entry]\nName=${appItem.name}\nExec=unkay run ${appId}\nIcon=${appItem.icon || 'app'}\nType=Application\n`;
            try {
                await unkay.fs.mkdir('/home/guest/Desktop', true);
                await unkay.fs.writeFile(desktopPath, desktopEntry);
            } catch {}

            this.installedAppIds.add(appId);
            btn.textContent = '✓ Instalado';
            btn.className = 'install-btn installed';
            btn.disabled = false;
            console.log(`[Marketplace] Aplicativo ${appItem.name} instalado com sucesso em ${appPath}`);
        } catch (err) {
            btn.disabled = false;
            btn.textContent = 'Instalar';
            console.error('[Marketplace] Falha ao instalar aplicativo:', err);
            alert(`Falha ao instalar aplicativo: ${err.message}`);
        }
    }

    openDetailModal(appId) {
        const appItem = this.apps.find(a => a.id === appId);
        if (!appItem) return;

        const modal = this.$('#appDetailModal');
        const body = this.$('#modalBody');
        const isInstalled = this.installedAppIds.has(appId);

        body.innerHTML = `
            <div style="display: flex; gap: 16px; align-items: flex-start; margin-bottom: 16px;">
                <div style="font-size: 36px; background: #0f172a; padding: 12px; border-radius: 10px;">${appItem.icon || '📦'}</div>
                <div>
                    <h2 style="margin: 0 0 4px 0; font-size: 18px; color: #f8fafc;">${appItem.name}</h2>
                    <span style="font-size: 12px; color: #94a3b8;">Por ${appItem.authorName || 'Comunidade RDA'} • Versão ${appItem.version || '1.0.0'}</span>
                    <div style="margin-top: 8px;">${this.getProfileBadge(appItem.runtimeProfile)}</div>
                </div>
            </div>
            <p style="font-size: 13px; color: #cbd5e1; line-height: 1.5; margin-bottom: 16px;">${appItem.description || appItem.summary}</p>
            <div style="background: rgba(0,0,0,0.25); border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 12px;">
                <div style="font-weight: 600; color: #94a3b8; margin-bottom: 6px;">Permissões do SDK:</div>
                <div style="color: #e2e8f0;">${(appItem.permissions || ['Nenhuma']).join(', ')}</div>
            </div>
            <div style="display: flex; justify-content: flex-end;">
                <button class="install-btn ${isInstalled ? 'installed' : ''}" id="modalInstallBtn">
                    ${isInstalled ? '✓ Instalado' : 'Instalar no unkayOS'}
                </button>
            </div>
        `;

        const modalBtn = body.querySelector('#modalInstallBtn');
        if (modalBtn && !isInstalled) {
            modalBtn.addEventListener('click', () => {
                this.handleInstall(appId, modalBtn);
                this.render();
            });
        }

        modal.style.display = 'flex';
    }

    closeModal() {
        const modal = this.$('#appDetailModal');
        if (modal) modal.style.display = 'none';
    }
}
