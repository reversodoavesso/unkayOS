// apps/terminal/main.js - v2.1.0 (Com atalhos de sistema, cwd e menu de contexto)

import { BaseApp } from '../../core/BaseApp.js';
import { commands } from './commands.js';
import eventBus from '../../core/eventBus.js';
import { ComputeBridge } from './compute-bridge.js';
import { createFilesystemCommands } from './filesystem-commands.js';
import { createTerminalFileSystem, parseCommandLine } from './session.js';
import { escapeHtml } from '../../core/workspace/preferences.js';
import DOMPurify from '../../core/vendor/purify.es.mjs';
import { confirmComputeSetup } from '../../core/workspace/ComputeSetup.js';

export default class TerminalApp extends BaseApp {
    static parameters = {
        cwd: {
            type: 'string',
            required: false,
            description: 'Diretório inicial de trabalho ao abrir o terminal'
        }
    };

    constructor(CORE, standardAPIs) {
        super(CORE, standardAPIs);

        this.terminalAppElement = null;
        this.terminalOutputElement = null;
        this.inputElement = null;
        this.terminalInputLine = null;
        this.terminalPromptElement = null;

        this.commandHistory = [];
        this.historyIndex = -1;
        this.commands = {};

        this.fs = createTerminalFileSystem(standardAPIs?.fs || window.unkayFileSystem?.fs || {});
        this.computeBridge = new ComputeBridge({ onStateChange: () => this.updatePrompt() });
        this.commandBusy = false;

        this.writeLine = this.writeLine.bind(this);
        this.clearTerminal = this.clearTerminal.bind(this);
        this.processCommand = this.processCommand.bind(this);
        this.handleKeydown = this.handleKeydown.bind(this);
        this.scrollToBottom = this.scrollToBottom.bind(this);
        this.updatePrompt = this.updatePrompt.bind(this);
        this._focusInputOnClick = () => {
            const sel = typeof window !== 'undefined' ? String(window.getSelection()?.toString() || '') : '';
            if (!sel) this.inputElement?.focus();
        };
    }

    _getAuthApi() {
        return this.standardAPIs?.auth || (window.authSystem || this.standardAPIs?.authSystem)?.getAPI?.() || null;
    }

    /**
     * Atualiza o prompt do terminal com usuário e diretório atual
     */
    updatePrompt() {
        if (this.terminalPromptElement) {
            const promptText = this.computeBridge.isConnected ? 'sandbox@compute' : this._getAuthApi()?.getUserPrompt?.() || 'guest@unkayos';
            const currentDir = this.fs ? this.fs.pwd() : '~';
            const dirDisplay = currentDir === '/home/user' ? '~' : currentDir;
            this.terminalPromptElement.textContent = this.computeBridge.isConnected ? `${promptText}$` : `${promptText}:${dirDisplay}$`;
            this.terminalPromptElement.title = this.terminalPromptElement.textContent;
        }
        const state = this.computeBridge.isConnected ? 'Compute · Linux remoto' : this.computeBridge.isConnecting ? 'Conectando ao Compute…' : 'Local · arquivos deste navegador';
        const status = this.$('#terminalModeStatus'); if (status) status.textContent = state;
        const select = this.$('#terminalMode'); if (select) select.value = this.computeBridge.isConnected || this.computeBridge.isConnecting ? 'compute' : 'local';
    }

    registerCommand(name, func, description = 'Sem descrição.') {
        this.commands[name] = { action: func, description };
    }

    confirmCompute(signal) {
        this.computeSetupController?.abort();this.computeSetupController=new AbortController();
        return confirmComputeSetup({token:this.unkay.auth.getToken(),signal:AbortSignal.any([this.computeSetupController.signal,signal])});
    }

    startAppViaEventBus(appId, params = []) {
        eventBus.emit('app:start', { appId, params });
    }

    stopAppViaEventBus(instanceId) {
        eventBus.emit('app:stop', { instanceId });
    }

    writeLine(text, type = 'output') {
        if (this.terminalOutputElement) {
            const line = document.createElement('div');
            line.classList.add('terminal-line', `terminal-line--${type}`);
            if (DOMPurify.isSupported) {
                line.innerHTML = DOMPurify.sanitize(String(text), { ALLOWED_TAGS: ['span','br','kbd','pre','code','strong','b','div','textarea','button','input'], ALLOWED_ATTR: ['class','id','type','value','rows','cols','placeholder','data-action'] });
            } else {
                line.textContent = String(text);
            }
            this.terminalOutputElement.appendChild(line);
            this.scrollToBottom();
        } else {
            console.warn(`[${this.appName} - ${this.instanceId}] Terminal output element not found. Text: ${text}`);
        }
    }

    scrollToBottom() {
        if (this.terminalOutputElement) {
            this.terminalOutputElement.scrollTop = this.terminalOutputElement.scrollHeight;
        }
    }

    clearTerminal() {
        if (this.terminalOutputElement) {
            this.terminalOutputElement.innerHTML = '';
        }
    }

    async processCommand(commandLine) {
        if (!commandLine.trim() || this.commandBusy && !(this.computeBridge.isConnecting && /^mode\s+local\s*$/i.test(commandLine.trim()))) return;

        const control = /^(?:mode(?:\s|$)|unkay\s+compute\s+(?:disconnect|status)\s*$)/i.test(commandLine.trim());
        if (this.computeBridge.isConnected && !control) {
            this.writeLine(`<span class="terminal-prompt">sandbox@compute$</span> ${escapeHtml(commandLine)}`, 'input');
            this.commandHistory.unshift(commandLine); this.historyIndex = -1;
            this.computeBridge.sendInput(commandLine + '\n'); return;
        }
        if (this.computeBridge.isConnecting && !control) { this.writeLine('Aguarde a conexão ou use mode local para cancelar.', 'system');return; }

        const user = this._getAuthApi()?.getUserPrompt?.() || 'user@unkayos';
        const currentDir = this.fs ? this.fs.pwd() : '~';
        const dirDisplay = currentDir === '/home/user' ? '~' : currentDir;

        this.writeLine(`<span class="terminal-prompt">${escapeHtml(user)}:${escapeHtml(dirDisplay)}$</span> ${escapeHtml(commandLine)}`, 'input');
        this.commandHistory.unshift(commandLine);
        this.historyIndex = -1;

        let parts;
        try {parts = parseCommandLine(commandLine);} catch (error) {this.writeLine(escapeHtml(error.message), 'error');return;}
        const commandName = parts[0].toLowerCase();
        const args = parts.slice(1);
        if (['wasi','grep','jq'].includes(commandName)) {
            const index = commandName === 'wasi' ? 0 : 1;
            if (args[index]) args[index] = this.fs.resolve(args[index]);
        }

        if (this.commands[commandName]) {
            try {
                this.commandBusy = true;
                const result = await this.commands[commandName].action(
                    args,
                    this.writeLine,
                    this.terminalOutputElement,
                    null,
                    this.commands,
                    this.appManager,
                    { terminal: this, computeBridge: this.computeBridge }
                );
                if (result) {
                    this.writeLine(result);
                }
                this.updatePrompt();
            } catch (error) {
                console.error(`[${this.appName}] Erro ao executar comando ${commandName}:`, error);
                this.writeLine(`Erro ao executar '${escapeHtml(commandName)}': ${escapeHtml(error.message)}`, 'error');
            } finally {
                this.commandBusy = false;
            }
        } else {
            try {
                const appId = commandName;
                const appDetails = window.appManager?.loadedAppDetails?.get(appId);
                if (appDetails && appDetails.jsFile) {
                    const module = await import(appDetails.jsFile);
                    if (module.default && typeof module.default.runCli === 'function') {
                        await module.default.runCli(args, this.writeLine);
                        return;
                    }
                }
            } catch {
                // Se erro ao importar, ignora e mostra mensagem padrão
            }
            this.writeLine(`<span class="red">Comando ou app '${escapeHtml(commandName)}' não encontrado. Digite 'help' para ver os comandos.</span>`, 'error');
        }
    }

    initializeCommands() {
        this.commands = {};
        const localCommands = { ...commands, ...createFilesystemCommands(this.fs) };
        for (const cmdName in localCommands) {
            if (Object.prototype.hasOwnProperty.call(localCommands, cmdName)) {
                this.registerCommand(cmdName, localCommands[cmdName].action, localCommands[cmdName].description);
            }
        }
        this.registerCommand('mode', async args => {
            if (args[0] === 'local') { this.computeBridge.disconnect();this.updatePrompt();return 'Modo local ativo. Arquivos e pacotes pertencem a este navegador.'; }
            if (args[0] === 'compute') {await this.computeBridge.connect(this);this.updatePrompt();return '';}
            return `Modo: ${this.computeBridge.isConnected ? 'Compute remoto' : this.computeBridge.isConnecting ? 'Conectando' : 'Local'}. Use mode local ou mode compute. WASI: wasi &lt;arquivo.wasm&gt; [args], executado localmente. Compute exige perfil SysAdmin/Demiurge e MFA.`;
        }, 'Mostra ou alterna Local / Compute; módulos WASI executam no modo local.');
    }

    async onRun(terminalOutputCallback = null, appParams = {}) {
        super.onRun(terminalOutputCallback, appParams);

        if (appParams?.cwd && this.fs?.exists?.(appParams.cwd)) {
            try {
                this.fs.cd(appParams.cwd);
            } catch (err) {
                console.warn('[Terminal] Não foi possível mudar para cwd inicial:', err);
            }
        }

        this.terminalAppElement = this.$('#terminal-app');
        this.terminalOutputElement = this.$('#terminalOutput');
        this.inputElement = this.$('#terminalInput');
        this.terminalInputLine = this.$('.terminal-input-line');
        this.terminalPromptElement = this.$('#terminalPrompt');

        this.updatePrompt();

        const api = this._getAuthApi();
        if (api && typeof api.on === 'function') {
            this._authChangeHandler = () => {
                this.computeSetupController?.abort();
                const auth = this.unkay?.auth;
                if (!auth?.getToken() || !['sysadmin','demiurge'].includes(auth.getTier())) this.computeBridge.disconnect();
                this.updatePrompt();
            };
            api.on('change', this._authChangeHandler);
        }

        if (!this.terminalAppElement || !this.terminalOutputElement || !this.inputElement || !this.terminalInputLine || !this.terminalPromptElement) {
            console.error(`[${this.appName} - ${this.instanceId}] Erro: Um ou mais elementos do terminal não foram encontrados!`);
            return;
        }

        this.initializeCommands();
        this.modeController = new AbortController();
        this.$('#terminalMode')?.addEventListener('change', event => this.processCommand('mode ' + event.target.value), {signal:this.modeController.signal});
        this.inputElement.addEventListener('keydown', this.handleKeydown);

        await this.registerKeyboardShortcut('ctrl+l', () => this.clearTerminal());
        await this.setupContextMenu();

        this.writeLine('Terminal local. Digite "help" ou "mode". WASI roda neste navegador; Compute abre um Linux remoto autorizado.');
        this.inputElement.focus();
        this.scrollToBottom();
        if(appParams.computeSetup)void this.processCommand('mode compute');

        this.appContentRoot.addEventListener('click', this._focusInputOnClick);

        this._onAppStarted = ({ appId, instanceId }) => {
            this.writeLine(`<span class='green'>Aplicativo '${appId}' iniciado com sucesso. Instance ID: ${instanceId}</span>`);
        };
        this._onAppStartError = ({ appId, reason }) => {
            this.writeLine(`<span class='red'>Erro ao iniciar aplicativo '${appId}': ${reason}</span>`, 'error');
        };
        this._onKillAllDone = ({ count }) => {
            this.writeLine(`<span class='green'>Comando killall executado. ${count} aplicativo(s) encerrado(s).</span>`);
        };

        eventBus.on('app:started', this._onAppStarted);
        eventBus.on('app:start:error', this._onAppStartError);
        eventBus.on('app:killall:done', this._onKillAllDone);
    }

    async setupContextMenu() {
        await this.registerContextMenu('#terminal-app', (context) => {
            const hasSelection = Boolean(context.selectionText);
            const currentDir = this.fs ? this.fs.pwd() : '/home/user';
            return [
                { type: 'header', label: `Terminal · ${currentDir}` },
                {
                    label: 'Copiar seleção',
                    icon: 'copy',
                    shortcut: 'Ctrl+Shift+C',
                    disabled: !hasSelection,
                    action: async () => {
                        if (!context.selectionText) return;
                        await navigator.clipboard?.writeText?.(context.selectionText);
                    }
                },
                {
                    label: 'Colar no prompt',
                    icon: 'clipboard-paste',
                    shortcut: 'Ctrl+Shift+V',
                    action: async () => {
                        try {
                            const text = await navigator.clipboard?.readText?.();
                            if (typeof text === 'string' && this.inputElement) {
                                this.inputElement.value += text;
                                this.inputElement.focus();
                            }
                        } catch {
                            this.inputElement?.focus();
                        }
                    }
                },
                {
                    label: 'Limpar terminal',
                    icon: 'brush-cleaning',
                    shortcut: 'Ctrl+L',
                    action: () => this.clearTerminal()
                },
                { type: 'separator' },
                {
                    label: 'Listar atalhos de sistema (keybinds)',
                    icon: 'key',
                    action: () => this.processCommand('keybinds')
                },
                {
                    label: 'Abrir diretório atual no Gerenciador de Arquivos',
                    icon: 'folder-open',
                    action: () => this.appManager?.runApp('file-manager', { path: currentDir })
                },
                {
                    label: 'Nova janela do Terminal',
                    icon: 'plus',
                    shortcut: 'Ctrl+Alt+T',
                    action: () => this.appManager?.runApp('terminal', { cwd: currentDir })
                }
            ];
        });
    }

    handleKeydown(event) {
        if (event.key === 'Enter') {
            const command = this.inputElement.value;
            this.inputElement.value = '';
            this.processCommand(command);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (this.commandHistory.length > 0) {
                this.historyIndex = (this.historyIndex + 1) % this.commandHistory.length;
                this.inputElement.value = this.commandHistory[this.historyIndex];
            }
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (this.historyIndex > 0) {
                this.historyIndex--;
                this.inputElement.value = this.commandHistory[this.historyIndex];
            } else if (this.historyIndex === 0) {
                this.historyIndex = -1;
                this.inputElement.value = '';
            }
        }
    }

    async onCleanup() {
        this.computeSetupController?.abort();
        this.modeController?.abort();this.computeBridge.disconnect();
        if (this.inputElement) {
            this.inputElement.removeEventListener('keydown', this.handleKeydown);
        }
        if (this.appContentRoot) {
            this.appContentRoot.removeEventListener('click', this._focusInputOnClick);
        }
        if (this._onAppStarted) eventBus.off('app:started', this._onAppStarted);
        if (this._onAppStartError) eventBus.off('app:start:error', this._onAppStartError);
        if (this._onKillAllDone) eventBus.off('app:killall:done', this._onKillAllDone);

        this.terminalAppElement = null;
        this.terminalOutputElement = null;
        this.inputElement = null;
        this.terminalInputLine = null;
        this.terminalPromptElement = null;
        this.commandHistory = [];
        this.historyIndex = -1;
        this.commands = {};

        const api = this._getAuthApi();
        if (api && typeof api.off === 'function' && this._authChangeHandler) {
            api.off('change', this._authChangeHandler);
        }

        await super.onCleanup();
    }
}
