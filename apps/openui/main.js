// apps/openui/main.js - OpenUI Generative Studio & Familiar AI Assistant
// Phase 6 deliverable: Declarative OpenUI Generator & One-Click .unkayapp Package Installation

import { BaseApp } from '../../core/BaseApp.js';
import { unkay } from '../../core/sdk/unkay.js';
import { AppSandbox } from '../../core/sdk/AppSandbox.js';

export default class OpenUIStudioApp extends BaseApp {
    constructor(CORE, standardAPIs) {
        super(CORE, standardAPIs);
        this.activeSandbox = null;
        this.currentAppPackage = null;
        this.presets = {
            monitor: {
                title: "Monitor de Recursos do Servidor",
                prompt: "Crie um painel escuro com cartões de status do servidor, indicadores de CPU, RAM e Valkey, e um botão de atualização com tokens RDA.",
                spec: `<div style="display: flex; flex-direction: column; gap: 14px;">
  <div style="display: flex; justify-content: space-between; align-items: center;">
    <h3 style="margin: 0; font-size: 16px; color: #f8fafc;">Status do Host Raspberry Pi 5</h3>
    <span style="font-size: 11px; background: rgba(16,185,129,0.2); color: #34d399; padding: 2px 8px; border-radius: 9999px; font-weight: 700;">ONLINE</span>
  </div>
  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
    <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px; text-align: center;">
      <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">CPU (4 Cores)</div>
      <div style="font-size: 20px; font-weight: 800; color: #38bdf8;">14.2%</div>
    </div>
    <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px; text-align: center;">
      <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">RAM Usada</div>
      <div style="font-size: 20px; font-weight: 800; color: #a855f7;">1.8 / 8 GB</div>
    </div>
    <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px; text-align: center;">
      <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">Containers</div>
      <div style="font-size: 20px; font-weight: 800; color: #10b981;">1 / 2 Max</div>
    </div>
  </div>
  <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 12px; font-family: monospace; font-size: 11px; color: #64748b;">
    [valkey-cache] PING -> PONG (0.4ms)<br/>
    [postgres-17] Conexões ativas: 6<br/>
    [egress-filter] 0 pacotes suspeitos bloqueados
  </div>
</div>`
            },
            converter: {
                title: "Conversor de Moedas & Câmbio",
                prompt: "Crie uma calculadora de conversão entre BRL, USD e EUR com campos de valor e resultado formatado.",
                spec: `<div style="display: flex; flex-direction: column; gap: 14px;">
  <h3 style="margin: 0; font-size: 15px; color: #f8fafc;">Conversão Instantânea de Moedas</h3>
  <div style="display: flex; gap: 10px;">
    <input type="number" id="convAmount" value="100" style="flex: 1; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 8px; color: #fff; font-size: 14px;" />
    <select id="convFrom" style="background: #1e293b; color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 8px;">
      <option value="BRL">BRL (R$)</option>
      <option value="USD">USD ($)</option>
      <option value="EUR">EUR (€)</option>
    </select>
  </div>
  <div style="background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); border-radius: 8px; padding: 16px; text-align: center;">
    <div style="font-size: 12px; color: #34d399; margin-bottom: 4px;">Resultado Estimado:</div>
    <div style="font-size: 24px; font-weight: 800; color: #fff;">$ 18.20 USD</div>
    <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Cotação de referência: 1 USD = 5.49 BRL</div>
  </div>
</div>`
            },
            pomodoro: {
                title: "Pomodoro Focus Timer",
                prompt: "Crie um temporizador de foco Pomodoro com 25 minutos, barra de progresso e controles de início e pausa.",
                spec: `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; text-align: center;">
  <span style="font-size: 11px; font-weight: 700; color: #f43f5e; letter-spacing: 0.1em;">SESSÃO DE FOCO PROFUNDO</span>
  <div style="font-size: 48px; font-weight: 800; font-family: monospace; color: #fff; text-shadow: 0 0 20px rgba(244,63,94,0.4);">25:00</div>
  <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 9999px; overflow: hidden;">
    <div style="width: 75%; height: 100%; background: #f43f5e;"></div>
  </div>
  <div style="display: flex; gap: 10px;">
    <button style="background: #f43f5e; color: #fff; border: none; border-radius: 6px; padding: 8px 20px; font-weight: 700; cursor: pointer;">Iniciar</button>
    <button style="background: rgba(255,255,255,0.1); color: #cbd5e1; border: none; border-radius: 6px; padding: 8px 16px; cursor: pointer;">Pausar</button>
    <button style="background: transparent; color: #94a3b8; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 8px 14px; cursor: pointer;">Zerar</button>
  </div>
</div>`
            }
        };
    }

    async onRun() {
        console.log('[OpenUIStudio] Inicializando OpenUI Studio...');
        this.setupEventListeners();
        // Load default preset
        this.loadPreset('monitor');
    }

    setupEventListeners() {
        // Preset buttons
        this.elements.all('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const presetKey = btn.dataset.preset;
                this.loadPreset(presetKey);
            });
        });

        // Generate button
        const genBtn = this.$('#generateBtn');
        if (genBtn) genBtn.addEventListener('click', () => this.generateFromPrompt());

        // Reload preview button
        const reloadBtn = this.$('#reloadPreviewBtn');
        if (reloadBtn) reloadBtn.addEventListener('click', () => this.updateLivePreview());

        // Live input on spec textarea
        const specInput = this.$('#specInput');
        if (specInput) {
            specInput.addEventListener('input', () => {
                this.updateLivePreview();
            });
        }

        // Install .unkayapp button
        const installBtn = this.$('#installGeneratedBtn');
        if (installBtn) installBtn.addEventListener('click', () => this.installAsUnkayApp());

        // Copy spec
        const copyBtn = this.$('#copySpecBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const spec = this.$('#specInput').value;
                navigator.clipboard.writeText(spec);
                copyBtn.textContent = 'Copiado!';
                setTimeout(() => { copyBtn.textContent = 'Copiar'; }, 2000);
            });
        }
    }

    loadPreset(presetKey) {
        const item = this.presets[presetKey];
        if (!item) return;

        const promptInput = this.$('#promptInput');
        const specInput = this.$('#specInput');

        if (promptInput) promptInput.value = item.prompt;
        if (specInput) specInput.value = item.spec;

        this.currentAppPackage = {
            id: `openui-${presetKey}`,
            name: item.title,
            version: '1.0.0',
            type: 'openui',
            runtimeProfile: 'client-only',
            description: item.prompt,
            category: 'utilities',
            requiredTier: 'guest',
            icon: '✨'
        };

        this.updateLivePreview();
    }

    async generateFromPrompt() {
        const promptInput = this.$('#promptInput');
        const btn = this.$('#generateBtn');
        const userPrompt = promptInput.value.trim();

        if (!userPrompt) {
            alert('Digite um prompt para gerar a aplicação.');
            return;
        }

        btn.disabled = true;
        btn.textContent = '✨ Gerando com Familiar AI...';

        try {
            // Match against predefined templates or synthesize dynamic UI
            let generatedSpec = '';
            let title = 'Aplicação Generative UI';
            let slug = 'custom-app';

            if (userPrompt.toLowerCase().includes('moeda') || userPrompt.toLowerCase().includes('câmbio')) {
                const p = this.presets.converter;
                generatedSpec = p.spec;
                title = p.title;
                slug = 'currency-converter';
            } else if (userPrompt.toLowerCase().includes('pomodoro') || userPrompt.toLowerCase().includes('tempo')) {
                const p = this.presets.pomodoro;
                generatedSpec = p.spec;
                title = p.title;
                slug = 'pomodoro-timer';
            } else if (userPrompt.toLowerCase().includes('monitor') || userPrompt.toLowerCase().includes('servidor')) {
                const p = this.presets.monitor;
                generatedSpec = p.spec;
                title = p.title;
                slug = 'server-monitor';
            } else {
                // Synthesize layout dynamically
                title = userPrompt.slice(0, 32);
                slug = 'genui-' + Date.now().toString(36);
                generatedSpec = `
<div style="display: flex; flex-direction: column; gap: 12px;">
  <h3 style="margin: 0; font-size: 16px; color: #38bdf8;">${title}</h3>
  <p style="font-size: 12px; color: #94a3b8; margin: 0;">Interface sintetizada a partir do prompt: "${userPrompt}"</p>
  <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 14px;">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span style="font-size: 13px; color: #e2e8f0;">Componente de Ação</span>
      <button style="background: #38bdf8; color: #0f172a; border: none; padding: 6px 14px; border-radius: 6px; font-weight: 700; cursor: pointer;">Executar</button>
    </div>
  </div>
</div>`;
            }

            this.$('#specInput').value = generatedSpec.trim();

            this.currentAppPackage = {
                id: slug,
                name: title,
                version: '1.0.0',
                type: 'openui',
                runtimeProfile: 'client-only',
                description: userPrompt,
                category: 'utilities',
                requiredTier: 'guest',
                icon: '✨'
            };

            this.updateLivePreview();
        } catch (err) {
            console.error('[OpenUIStudio] Erro na geração:', err);
        } finally {
            btn.disabled = false;
            btn.textContent = '✨ Gerar com IA (Familiar)';
        }
    }

    updateLivePreview() {
        const viewport = this.$('#previewViewport');
        const spec = this.$('#specInput').value.trim();
        const badge = this.$('#previewBadge');
        const installBtn = this.$('#installGeneratedBtn');

        if (!viewport || !spec) return;

        // Cleanup previous sandbox instance
        if (this.activeSandbox) {
            this.activeSandbox.unmount();
            this.activeSandbox = null;
        }

        viewport.innerHTML = '';
        const host = document.createElement('div');
        host.style.width = '100%';
        host.style.height = '100%';
        viewport.appendChild(host);

        const pkg = this.currentAppPackage || {
            id: 'preview-app',
            name: 'Preview App',
            version: '1.0.0',
            type: 'openui',
            runtimeProfile: 'client-only',
            description: 'Live preview',
            permissions: ['storage:local']
        };

        this.activeSandbox = new AppSandbox(host, pkg, unkay);
        this.activeSandbox.run(spec);

        if (badge) {
            badge.textContent = `Renderizado (Shadow DOM)`;
            badge.style.background = 'rgba(16,185,129,0.15)';
            badge.style.color = '#34d399';
        }

        if (installBtn) {
            installBtn.disabled = false;
        }
    }

    async installAsUnkayApp() {
        if (!this.currentAppPackage) return;

        const btn = this.$('#installGeneratedBtn');
        const pkg = this.currentAppPackage;
        const spec = this.$('#specInput').value;

        btn.disabled = true;
        btn.textContent = 'Gravando no VFS...';

        try {
            // 1. Create app folder in OPFS VFS
            const appDir = `/home/user/apps/${pkg.id}`;
            await unkay.fs.mkdir(appDir, true);

            // 2. Write manifest.json
            const manifest = {
                ...pkg,
                type: 'openui',
                runtime_profile: 'client-only',
                entrypoint: 'spec.openui',
                installedAt: new Date().toISOString()
            };
            await unkay.fs.writeFile(`${appDir}/manifest.json`, JSON.stringify(manifest, null, 2));

            // 3. Write declarative spec
            await unkay.fs.writeFile(`${appDir}/spec.openui`, spec);

            // 4. Create Desktop shortcut launcher
            const desktopPath = `/home/guest/Desktop/${pkg.name.replace(/[^a-zA-Z0-9]/g, '_')}.desktop`;
            await unkay.fs.mkdir('/home/guest/Desktop', true);
            const desktopContent = `[Desktop Entry]\nName=${pkg.name}\nExec=unkay run ${pkg.id}\nIcon=${pkg.icon || 'sparkles'}\nType=OpenUI\n`;
            await unkay.fs.writeFile(desktopPath, desktopContent);

            btn.textContent = '✓ Instalado com Sucesso!';
            console.log(`[OpenUIStudio] Aplicativo instalado no VFS em ${appDir}`);
            setTimeout(() => {
                btn.textContent = '🚀 Instalar como .unkayapp';
                btn.disabled = false;
            }, 3000);
        } catch (err) {
            console.error('[OpenUIStudio] Falha ao instalar no VFS:', err);
            btn.textContent = 'Erro na Instalação';
            btn.disabled = false;
        }
    }

    onCleanup() {
        if (this.activeSandbox) {
            this.activeSandbox.unmount();
            this.activeSandbox = null;
        }
    }
}
