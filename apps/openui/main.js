// apps/openui/main.js - OpenUI Studio v2.0
// Native IDE & Generative Studio for unkayOS applications with @reversodoavesso/design-system

import { BaseApp } from '../../core/BaseApp.js';
import { unkay } from '../../core/sdk/unkay.js';
import { AppSandbox } from '../../core/sdk/AppSandbox.js';
import { AppPackageLoader } from '../../core/sdk/AppPackageLoader.js';

export default class OpenUIStudioApp extends BaseApp {
    constructor(CORE, standardAPIs) {
        super(CORE, standardAPIs);
        this.activeSandbox = null;
        this.currentSpec = '';
        this.currentMode = 'split'; // 'split' | 'canvas' | 'code'
        this.codeMode = 'spec';     // 'spec' | 'manifest'

        this.manifest = {
            id: 'openui-custom-app',
            name: 'Meu App Gerado',
            version: '1.0.0',
            type: 'openui',
            runtime_profile: 'client-only',
            category: 'ai',
            description: 'Aplicação declarativa gerada no OpenUI Studio com tokens do RDA Design System.',
            entrypoint: 'spec.openui',
            permissions: ['storage:local', 'ai:generate']
        };

        this.presets = {
            dashboard: {
                title: "Dashboard de Recursos",
                id: "system-dashboard",
                prompt: "Crie um painel escuro de monitoramento com cartões de status do servidor, indicadores de CPU, memória, cache Valkey e log de eventos usando tokens oficiais RDA.",
                spec: `<div style="display: flex; flex-direction: column; gap: var(--rda-spacing-4, 16px);">
  <!-- Header do Dashboard -->
  <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--rda-border-primary, #2d2d2d); padding-bottom: 12px;">
    <div>
      <h3 style="margin: 0; font-size: 16px; font-family: var(--rda-font-family-heading, 'Archivo', sans-serif); color: var(--rda-content-primary, #fafafa);">Status da Infraestrutura unkayOS</h3>
      <span style="font-size: 12px; color: var(--rda-content-muted, #737373);">Nó Local: x86_64 / Wasm Microkernel Ativo</span>
    </div>
    <span style="font-size: 11px; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 3px 10px; border-radius: var(--rda-radius-full, 9999px); font-weight: 700;">OPERACIONAL</span>
  </div>

  <!-- Grid de Métricas Principais -->
  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
    <div style="background: var(--rda-surface-secondary, #141414); border: 1px solid var(--rda-border-primary, #2d2d2d); border-radius: var(--rda-radius-lg, 8px); padding: 14px; text-align: center;">
      <div style="font-size: 11px; color: var(--rda-content-muted, #737373); text-transform: uppercase;">CPU Worker</div>
      <div style="font-size: 22px; font-weight: 800; color: var(--rda-content-brand, #22d3ee); margin: 6px 0;">18.4%</div>
      <div style="font-size: 10px; color: #10b981;">● 4 Threads Wasm</div>
    </div>
    <div style="background: var(--rda-surface-secondary, #141414); border: 1px solid var(--rda-border-primary, #2d2d2d); border-radius: var(--rda-radius-lg, 8px); padding: 14px; text-align: center;">
      <div style="font-size: 11px; color: var(--rda-content-muted, #737373); text-transform: uppercase;">Memória OPFS</div>
      <div style="font-size: 22px; font-weight: 800; color: #a855f7; margin: 6px 0;">2.4 / 16 MB</div>
      <div style="font-size: 10px; color: var(--rda-content-muted, #737373);">● VFS Sincronizado</div>
    </div>
    <div style="background: var(--rda-surface-secondary, #141414); border: 1px solid var(--rda-border-primary, #2d2d2d); border-radius: var(--rda-radius-lg, 8px); padding: 14px; text-align: center;">
      <div style="font-size: 11px; color: var(--rda-content-muted, #737373); text-transform: uppercase;">Latência IPC</div>
      <div style="font-size: 22px; font-weight: 800; color: #10b981; margin: 6px 0;">0.8 ms</div>
      <div style="font-size: 10px; color: #10b981;">● Zero-Copy Buffer</div>
    </div>
  </div>

  <!-- Log de Atividade do Sistema -->
  <div style="background: var(--rda-surface-secondary, #141414); border: 1px solid var(--rda-border-primary, #2d2d2d); border-radius: var(--rda-radius-lg, 8px); padding: 14px;">
    <div style="font-size: 12px; font-weight: 600; color: var(--rda-content-secondary, #e5e5e5); margin-bottom: 8px;">Log de Atividade Wasm:</div>
    <div style="background: #000000; border-radius: var(--rda-radius-md, 6px); padding: 10px; font-family: var(--rda-font-family-mono, monospace); font-size: 11px; color: var(--rda-content-muted, #737373); line-height: 1.6;">
      <span style="color: var(--rda-content-brand, #22d3ee);">[kernel]</span> OPFS driver mounted at /home/user/data<br/>
      <span style="color: #10b981;">[compute]</span> Local WASI runner ready for background tasks<br/>
      <span style="color: #a855f7;">[security]</span> Sandbox active with scoped VFS permissions
    </div>
  </div>
</div>`
            },
            kanban: {
                title: "Quadro Kanban de Tarefas",
                id: "task-kanban",
                prompt: "Crie um quadro de tarefas com colunas A Fazer, Em Progresso e Concluído com cartões e tags do Design System RDA.",
                spec: `<div style="display: flex; flex-direction: column; gap: var(--rda-spacing-3, 12px);">
  <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--rda-border-primary, #2d2d2d); padding-bottom: 8px;">
    <h3 style="margin: 0; font-size: 15px; font-family: var(--rda-font-family-heading, 'Archivo', sans-serif); color: var(--rda-content-primary, #fafafa);">Quadro Ágil unkayOS</h3>
    <button type="button" class="rda-button rda-button--sm" data-color="primary">+ Nova Tarefa</button>
  </div>
  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
    <!-- Coluna 1 -->
    <div style="background: var(--rda-surface-secondary, #141414); border: 1px solid var(--rda-border-primary, #2d2d2d); border-radius: 6px; padding: 10px;">
      <div style="font-size: 11px; font-weight: 700; color: var(--rda-content-muted, #737373); margin-bottom: 8px; text-transform: uppercase;">A Fazer (1)</div>
      <div style="background: var(--rda-surface-tertiary, #1e1e1e); border: 1px solid var(--rda-border-subtle, #262626); border-radius: 6px; padding: 10px;">
        <div style="font-size: 12px; font-weight: 600; color: var(--rda-content-primary, #fafafa);">Escrever docs de release</div>
        <span style="display: inline-block; font-size: 10px; color: var(--rda-content-brand, #22d3ee); background: rgba(6,182,212,0.1); padding: 1px 6px; border-radius: 4px; margin-top: 6px;">Docs</span>
      </div>
    </div>
    <!-- Coluna 2 -->
    <div style="background: var(--rda-surface-secondary, #141414); border: 1px solid var(--rda-border-primary, #2d2d2d); border-radius: 6px; padding: 10px;">
      <div style="font-size: 11px; font-weight: 700; color: var(--rda-content-brand, #22d3ee); margin-bottom: 8px; text-transform: uppercase;">Em Andamento (1)</div>
      <div style="background: var(--rda-surface-tertiary, #1e1e1e); border: 1px solid var(--rda-border-subtle, #262626); border-radius: 6px; padding: 10px;">
        <div style="font-size: 12px; font-weight: 600; color: var(--rda-content-primary, #fafafa);">Refatorar OpenUI Studio</div>
        <span style="display: inline-block; font-size: 10px; color: #f59e0b; background: rgba(245,158,11,0.1); padding: 1px 6px; border-radius: 4px; margin-top: 6px;">Design System</span>
      </div>
    </div>
    <!-- Coluna 3 -->
    <div style="background: var(--rda-surface-secondary, #141414); border: 1px solid var(--rda-border-primary, #2d2d2d); border-radius: 6px; padding: 10px;">
      <div style="font-size: 11px; font-weight: 700; color: #10b981; margin-bottom: 8px; text-transform: uppercase;">Concluído (2)</div>
      <div style="background: var(--rda-surface-tertiary, #1e1e1e); border: 1px solid var(--rda-border-subtle, #262626); border-radius: 6px; padding: 10px;">
        <div style="font-size: 12px; font-weight: 600; color: var(--rda-content-primary, #fafafa);">Padronização de Ícones</div>
        <span style="display: inline-block; font-size: 10px; color: #10b981; background: rgba(16,185,129,0.1); padding: 1px 6px; border-radius: 4px; margin-top: 6px;">Finalizado</span>
      </div>
    </div>
  </div>
</div>`
            },
            form: {
                title: "Painel de Configurações",
                id: "settings-panel",
                prompt: "Crie um painel de preferências com campos de chave de API, tema escuro, persistência no VFS e botão salvar.",
                spec: `<div style="display: flex; flex-direction: column; gap: var(--rda-spacing-3, 12px);">
  <div style="border-bottom: 1px solid var(--rda-border-primary, #2d2d2d); padding-bottom: 8px;">
    <h3 style="margin: 0; font-size: 15px; font-family: var(--rda-font-family-heading, 'Archivo', sans-serif); color: var(--rda-content-primary, #fafafa);">Preferências da Aplicação</h3>
    <span style="font-size: 11px; color: var(--rda-content-muted, #737373);">Configurações persistidas no armazenamento local do aplicativo</span>
  </div>
  <div style="display: flex; flex-direction: column; gap: 10px;">
    <div>
      <label style="display: block; font-size: 11px; font-weight: 600; color: var(--rda-content-secondary, #e5e5e5); margin-bottom: 4px;">Chave de API / Token JWT:</label>
      <input type="password" value="rda_sk_live_994827103" style="width: 100%; box-sizing: border-box; background: var(--rda-surface-secondary, #141414); border: 1px solid var(--rda-border-primary, #2d2d2d); border-radius: 6px; padding: 8px 10px; color: #fff; font-size: 12px;" />
    </div>
    <div>
      <label style="display: block; font-size: 11px; font-weight: 600; color: var(--rda-content-secondary, #e5e5e5); margin-bottom: 4px;">Diretório de Armazenamento VFS:</label>
      <input type="text" value="/home/user/apps/my-app/data" style="width: 100%; box-sizing: border-box; background: var(--rda-surface-secondary, #141414); border: 1px solid var(--rda-border-primary, #2d2d2d); border-radius: 6px; padding: 8px 10px; color: #fff; font-size: 12px;" />
    </div>
    <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;">
      <button type="button" class="rda-button rda-button--sm" data-color="secondary">Cancelar</button>
      <button type="button" class="rda-button rda-button--sm" data-color="primary">Salvar Configurações</button>
    </div>
  </div>
</div>`
            },
            "file-inspector": {
                title: "Inspetor de VFS",
                id: "vfs-inspector",
                prompt: "Crie uma tabela de inspeção de arquivos do sistema virtual com nome, tamanho, tipo e ações de download.",
                spec: `<div style="display: flex; flex-direction: column; gap: var(--rda-spacing-3, 12px);">
  <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--rda-border-primary, #2d2d2d); padding-bottom: 8px;">
    <h3 style="margin: 0; font-size: 15px; font-family: var(--rda-font-family-heading, 'Archivo', sans-serif); color: var(--rda-content-primary, #fafafa);">Explorador de Arquivos VFS</h3>
    <span style="font-size: 11px; color: var(--rda-content-brand, #22d3ee); font-family: var(--rda-font-family-mono, monospace);">/home/user/documents</span>
  </div>
  <table style="width: 100%; border-collapse: collapse; font-size: 12px; color: var(--rda-content-secondary, #e5e5e5);">
    <thead>
      <tr style="border-bottom: 1px solid var(--rda-border-primary, #2d2d2d); text-align: left; color: var(--rda-content-muted, #737373);">
        <th style="padding: 8px;">Nome do Arquivo</th>
        <th style="padding: 8px;">Tamanho</th>
        <th style="padding: 8px;">Formato</th>
        <th style="padding: 8px; text-align: right;">Ação</th>
      </tr>
    </thead>
    <tbody>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
        <td style="padding: 8px; font-weight: 500;"><rda-icon name="file-text"></rda-icon> notas_arquitetura.md</td>
        <td style="padding: 8px; color: var(--rda-content-muted, #737373);">4.2 KB</td>
        <td style="padding: 8px;"><span style="color: var(--rda-content-brand, #22d3ee);">Markdown</span></td>
        <td style="padding: 8px; text-align: right;"><button type="button" class="rda-button rda-button--sm" data-color="secondary">Abrir</button></td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
        <td style="padding: 8px; font-weight: 500;"><rda-icon name="bar-chart-3"></rda-icon> relatorio_q3.csv</td>
        <td style="padding: 8px; color: var(--rda-content-muted, #737373);">18.9 KB</td>
        <td style="padding: 8px;"><span style="color: #10b981;">Planilha</span></td>
        <td style="padding: 8px; text-align: right;"><button type="button" class="rda-button rda-button--sm" data-color="secondary">Abrir</button></td>
      </tr>
    </tbody>
  </table>
</div>`
            }
        };

        this.snippets = {
            'button-primary': '<button type="button" class="rda-button rda-button--md" data-color="primary"><rda-icon name="save"></rda-icon><span class="rda-button__content">Salvar</span></button>',
            'button-secondary': '<button type="button" class="rda-button rda-button--md" data-color="secondary"><span class="rda-button__content">Cancelar</span></button>',
            card: '<article class="rda-card" data-style="matte"><h3>Título do card</h3><p>Conteúdo</p></article>',
            badge: '<span class="rda-badge" data-color="success">Concluído</span>',
            metric: '<article class="rda-card"><h3>Arquivos</h3><p class="rda-typography">128</p></article>',
            input: '<label class="rda-label" for="title">Título</label><input class="rda-input rda-input--md" id="title" placeholder="Escreva um título">',
            table: '<table class="rda-table rda-table--md"><thead class="rda-table__head"><tr><th class="rda-table__header-cell">Item</th><th class="rda-table__header-cell">Estado</th></tr></thead><tbody class="rda-table__body"><tr class="rda-table__row"><td class="rda-table__cell">Serviço</td><td class="rda-table__cell">Ativo</td></tr></tbody></table>'
        };
    }

    async onRun(_terminalOutputCallback = null, appParams = {}) {
        console.log('[OpenUIStudio] Inicializando OpenUI Studio v2.0...');
        this.setupEventListeners();
        this.loadPreset('dashboard');
        if (appParams.previewSpec && appParams.manifest) {
            this.manifest = appParams.manifest;
            this.currentSpec = appParams.previewSpec;
            this.updateCodeEditor();
            this.renderLiveSandbox();
            this.setViewMode('canvas');
            const title = this.appContentRoot?.closest('.app')?.querySelector('.app__top_bar__app_name');
            if (title) title.textContent = `Prévia: ${this.manifest.name}`;
        }
    }

    setupEventListeners() {
        // Toolbar actions
        const newBtn = this.$('#newProjectBtn');
        const saveVfsBtn = this.$('#saveVfsBtn');
        const exportPkgBtn = this.$('#exportPkgBtn');
        const launchWindowBtn = this.$('#launchWindowBtn');

        if (newBtn) newBtn.addEventListener('click', () => this.createNewProject());
        if (saveVfsBtn) saveVfsBtn.addEventListener('click', () => this.saveToVfs());
        if (exportPkgBtn) exportPkgBtn.addEventListener('click', () => this.exportPackage());
        if (launchWindowBtn) launchWindowBtn.addEventListener('click', () => this.launchInOsWindow());

        // View Mode Toggles
        const splitBtn = this.$('#viewSplitBtn');
        const canvasBtn = this.$('#viewCanvasBtn');
        const codeBtn = this.$('#viewCodeBtn');

        if (splitBtn) splitBtn.addEventListener('click', () => this.setViewMode('split'));
        if (canvasBtn) canvasBtn.addEventListener('click', () => this.setViewMode('canvas'));
        if (codeBtn) codeBtn.addEventListener('click', () => this.setViewMode('code'));

        // Sidebar tabs
        this.$$('.sidebar-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.$$('.sidebar-tab').forEach(t => t.classList.remove('active'));
                this.$$('.sidebar-pane').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                const pane = this.$(`#pane${tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1)}`);
                if (pane) pane.classList.add('active');
            });
        });

        // Preset selector cards
        this.$$('.preset-card-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.$$('.preset-card-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.loadPreset(btn.dataset.preset);
            });
        });

        // AI generate button
        const genBtn = this.$('#generateActionBtn');
        if (genBtn) genBtn.addEventListener('click', () => this.generateWithAi());

        // Component Palette snippets
        this.$$('.component-item-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const snippetKey = btn.dataset.snippet;
                this.insertSnippet(snippetKey);
            });
        });

        // Manifest field sync
        const appIdInput = this.$('#manifestAppId');
        const appNameInput = this.$('#manifestAppName');
        const appVerInput = this.$('#manifestAppVersion');

        if (appIdInput) {
            appIdInput.addEventListener('input', (e) => {
                this.manifest.id = e.target.value.trim() || 'openui-custom-app';
                this.updateVfsPathDisplay();
            });
        }
        if (appNameInput) {
            appNameInput.addEventListener('input', (e) => {
                this.manifest.name = e.target.value.trim() || 'Meu App Gerado';
            });
        }
        if (appVerInput) {
            appVerInput.addEventListener('input', (e) => {
                this.manifest.version = e.target.value.trim() || '1.0.0';
            });
        }

        // Code editor input sync
        const codeEditor = this.$('#codeEditorInput');
        if (codeEditor) {
            codeEditor.addEventListener('input', (e) => {
                if (this.codeMode === 'spec') {
                    this.currentSpec = e.target.value;
                    this.renderLiveSandbox();
                } else {
                    try {
                        this.manifest = JSON.parse(e.target.value);
                    } catch {}
                }
            });
        }

        // Code tabs (Spec vs Manifest)
        const tabSpec = this.$('#codeTabSpec');
        const tabManifest = this.$('#codeTabManifest');
        if (tabSpec) {
            tabSpec.addEventListener('click', () => {
                tabSpec.classList.add('active');
                tabManifest.classList.remove('active');
                this.codeMode = 'spec';
                this.updateCodeEditor();
            });
        }
        if (tabManifest) {
            tabManifest.addEventListener('click', () => {
                tabManifest.classList.add('active');
                tabSpec.classList.remove('active');
                this.codeMode = 'manifest';
                this.updateCodeEditor();
            });
        }

        // Format and Copy buttons
        const copyBtn = this.$('#copyCodeBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const code = this.$('#codeEditorInput').value;
                navigator.clipboard?.writeText(code);
                this.notify(" Código copiado para a área de transferência");
            });
        }

        // Canvas resolution buttons
        this.$$('.canvas-control-btn[data-res]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.$$('.canvas-control-btn[data-res]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const res = btn.dataset.res;
                const host = this.$('#sandboxHost');
                if (host) {
                    host.classList.remove('res-medium', 'res-compact');
                    if (res === 'medium') host.classList.add('res-medium');
                    if (res === 'compact') host.classList.add('res-compact');
                }
            });
        });

        // Reload canvas button
        const reloadBtn = this.$('#reloadCanvasBtn');
        if (reloadBtn) reloadBtn.addEventListener('click', () => this.renderLiveSandbox());
    }

    setViewMode(mode) {
        this.currentMode = mode;
        const ws = this.$('#workspaceContainer');
        const splitBtn = this.$('#viewSplitBtn');
        const canvasBtn = this.$('#viewCanvasBtn');
        const codeBtn = this.$('#viewCodeBtn');

        splitBtn.classList.toggle('active', mode === 'split');
        canvasBtn.classList.toggle('active', mode === 'canvas');
        codeBtn.classList.toggle('active', mode === 'code');

        ws.classList.remove('canvas-only', 'code-only');
        if (mode === 'canvas') ws.classList.add('canvas-only');
        if (mode === 'code') ws.classList.add('code-only');
    }

    loadPreset(key) {
        const preset = this.presets[key];
        if (!preset) return;

        this.manifest.name = preset.title;
        this.manifest.id = `openui-${preset.id}`;
        this.currentSpec = preset.spec;

        const promptInput = this.$('#promptInput');
        if (promptInput) promptInput.value = preset.prompt;

        const idInput = this.$('#manifestAppId');
        const nameInput = this.$('#manifestAppName');
        if (idInput) idInput.value = this.manifest.id;
        if (nameInput) nameInput.value = this.manifest.name;

        this.updateVfsPathDisplay();
        this.updateCodeEditor();
        this.renderLiveSandbox();
    }

    updateCodeEditor() {
        const editor = this.$('#codeEditorInput');
        if (!editor) return;

        if (this.codeMode === 'spec') {
            editor.value = this.currentSpec;
        } else {
            editor.value = JSON.stringify(this.manifest, null, 2);
        }
    }

    renderLiveSandbox() {
        const host = this.$('#sandboxHost');
        if (!host) return;

        if (this.activeSandbox) {
            this.activeSandbox.unmount();
            this.activeSandbox = null;
        }

        host.innerHTML = '';
        const validation = AppPackageLoader.validateManifest(this.manifest);
        if (!validation.valid) {
            host.textContent = `Manifesto inválido: ${validation.errors.join('; ')}`;
            return;
        }

        const mockPkg = {
            id: this.manifest.id,
            name: this.manifest.name,
            version: this.manifest.version,
            type: 'openui',
            runtimeProfile: 'client-only',
            permissions: this.manifest.permissions || ['storage:local']
        };

        this.activeSandbox = new AppSandbox(host, mockPkg, unkay);
        this.activeSandbox.mount();
        this.activeSandbox.run(this.currentSpec);
    }

    insertSnippet(key) {
        const snippet = this.snippets[key];
        if (!snippet) return;

        this.currentSpec += snippet;
        this.updateCodeEditor();
        this.renderLiveSandbox();
        this.notify(` Componente '${key}' inserido no Canvas`);
    }

    async generateWithAi() {
        const promptInput = this.$('#promptInput');
        const promptText = promptInput ? promptInput.value.trim() : '';

        if (!promptText) {
            alert('Por favor, informe uma descrição da interface desejada.');
            return;
        }

        const btn = this.$('#generateActionBtn');
        btn.innerHTML = `<span class="btn-sparkle"><rda-icon name="loader-2"></rda-icon></span> Gerando Interface...`;
        this.notify('IA gerando componentes com tokens do RDA Design System...');

        try {
            // Check if unkay.ai is available
            if (unkay.ai && typeof unkay.ai.prompt === 'function') {
                const [guideResponse, iconsResponse] = await Promise.all([
                    fetch('/design-system/APP_GUIDE.md'),
                    fetch('/design-system/rda/icons/manifest.json')
                ]);
                if (!guideResponse.ok || !iconsResponse.ok) throw new Error('Guia ou catálogo oficial do DS indisponível.');
                const guide = await guideResponse.text();
                const catalog = await iconsResponse.json();
                const systemPrompt = `${guide}\n\nGere somente o HTML declarativo do conteúdo solicitado, sem scripts, documento HTML completo ou inicialização do shell. Use controles reais do DS e <rda-icon>; não use emojis como ícones. Catálogo disponível: ${Object.keys(catalog.icons).join(', ')}. Responda apenas com HTML.`;
                const response = await unkay.ai.prompt([
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: promptText }
                ]);
                if (response && response.content) {
                    this.currentSpec = response.content;
                    this.updateCodeEditor();
                    this.renderLiveSandbox();
                    btn.innerHTML = `<span class="btn-sparkle"><rda-icon name="sparkles"></rda-icon></span> Gerar Interface com IA`;
                    this.notify(" Interface gerada com sucesso pela IA!");
                    return;
                }
            }
        } catch (err) {
            console.warn('[OpenUIStudio] Falha ao invocar unkay.ai:', err);
        }

        // Procedural generation fallback
        this.setTimeout(() => {
            const title = promptText.length > 25 ? promptText.slice(0, 25) + '...' : promptText;
            this.currentSpec = `
<div style="display: flex; flex-direction: column; gap: var(--rda-spacing-3, 12px);">
  <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--rda-border-primary, #2d2d2d); padding-bottom: 8px;">
    <h3 style="margin: 0; font-size: 15px; color: var(--rda-content-brand, #22d3ee);">${title}</h3>
    <span class="rda-badge" style="background: rgba(6,182,212,0.15); color: var(--rda-content-brand, #22d3ee); padding: 2px 8px; border-radius: 9999px; font-size: 11px;">Prévia local</span>
  </div>
  <div style="background: var(--rda-surface-secondary, #141414); border: 1px solid var(--rda-border-primary, #2d2d2d); border-radius: var(--rda-radius-lg, 8px); padding: 14px;">
    <p style="margin: 0 0 10px 0; font-size: 13px; color: var(--rda-content-secondary, #e5e5e5);">${promptText}</p>
    <div style="display: flex; gap: 8px;">
      <button type="button" class="rda-button rda-button--sm" data-color="primary">Ação RDA</button>
      <button type="button" class="rda-button rda-button--sm" data-color="secondary">Detalhes</button>
    </div>
  </div>
</div>`;
            this.updateCodeEditor();
            this.renderLiveSandbox();
            btn.innerHTML = `<span class="btn-sparkle"><rda-icon name="sparkles"></rda-icon></span> Gerar Interface com IA`;
            this.notify(" Interface criada conforme prompt do usuário!");
        }, 600);
    }

    async saveToVfs() {
        const validation = AppPackageLoader.validateManifest(this.manifest);
        if (!validation.valid) {
            this.notify(`Manifesto inválido: ${validation.errors.join('; ')}`);
            return false;
        }
        try {
            await (this.unkay || unkay).packages.installLocal({
                format: 'unkayapp-v1', manifest: { ...this.manifest },
                files: { 'spec.openui': this.currentSpec }
            });
            this.notify('Aplicativo instalado e disponível no menu de aplicativos.');
            return true;
        } catch (err) {
            this.notify(`Erro ao instalar: ${err.message}`);
            return false;
        }
    }

    async exportPackage() {
        const pkgData = {
            format: 'unkayapp-v1',
            exportedAt: new Date().toISOString(),
            manifest: this.manifest,
            files: {
                'spec.openui': this.currentSpec,
                'package.json': JSON.stringify(this.manifest, null, 2)
            }
        };

        const jsonStr = JSON.stringify(pkgData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.manifest.id}.unkayapp`;
        a.click();
        URL.revokeObjectURL(url);

        this.notify(` Pacote '${this.manifest.id}.unkayapp' exportado`);
    }

    async launchInOsWindow() {
        this.notify('Iniciando janela nativa no unkayOS...');
        if (!await this.saveToVfs()) return;
        const manager = this.appManager || window.appManager;
        if (!manager?.runApp) {
            this.notify('Gerenciador de janelas indisponível. O projeto foi salvo no VFS.');
            return;
        }
        try { await (this.unkay || unkay).packages.open(this.manifest.id); }
        catch (error) { this.notify(`Erro ao abrir aplicativo: ${error.message}`); }
    }

    createNewProject() {
        this.manifest.id = `openui-app-${Date.now()}`;
        this.manifest.name = 'Novo Aplicativo OpenUI';
        this.currentSpec = `
<div style="padding: 16px; background: var(--rda-surface-secondary, #141414); border: 1px solid var(--rda-border-primary, #2d2d2d); border-radius: 8px;">
  <h3 style="margin: 0 0 8px 0; color: var(--rda-content-brand, #22d3ee);">Novo Aplicativo OpenUI</h3>
  <p style="color: var(--rda-content-secondary, #a3a3a3); font-size: 13px;">Insira componentes da paleta ou descreva a interface no prompt com IA.</p>
</div>`;
        this.updateVfsPathDisplay();
        this.updateCodeEditor();
        this.renderLiveSandbox();
        this.notify('Novo projeto criado');
    }

    updateVfsPathDisplay() {
        const el = this.$('#statusVfsPath');
        if (el) el.textContent = `/home/user/apps/${this.manifest.id}`;
    }

    notify(msg) {
        const notif = this.$('#statusNotification');
        if (notif) {
            notif.textContent = msg;
            this.setTimeout(() => {
                if (notif) notif.innerHTML = `<span class="status-ready"><rda-icon name="check"></rda-icon> Pronto</span>`;
            }, 3000);
        }
    }

    onCleanup() {
        if (this.activeSandbox) {
            this.activeSandbox.unmount();
            this.activeSandbox = null;
        }
    }
}
