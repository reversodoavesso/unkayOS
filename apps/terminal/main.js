// apps/terminal/main.js - v2.1.0 (Com atalhos de sistema, cwd e menu de contexto)

import { BaseApp } from '../../core/BaseApp.js';
import { commands } from './commands.js';
import eventBus from '../../core/eventBus.js';

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

        this.fs = window.unkayFileSystem?.fs || standardAPIs?.fs || null;

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
        return (window.authSystem || this.standardAPIs?.authSystem)?.getAPI?.() || null;
    }

    /**
     * Atualiza o prompt do terminal com usuário e diretório atual
     */
    updatePrompt() {
        if (this.terminalPromptElement) {
            const promptText = this._getAuthApi()?.getUserPrompt?.() || 'user@unkayos';
            const currentDir = this.fs ? this.fs.pwd() : '~';
            const dirDisplay = currentDir === '/home/user' ? '~' : currentDir;
            this.terminalPromptElement.textContent = `${promptText}:${dirDisplay}$`;
        }
    }

    registerCommand(name, func, description = 'Sem descrição.') {
        this.commands[name] = { action: func, description };
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
            line.innerHTML = text;
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
        if (!commandLine.trim()) return;

        const user = this._getAuthApi()?.getUserPrompt?.() || 'user@unkayos';
        const currentDir = this.fs ? this.fs.pwd() : '~';
        const dirDisplay = currentDir === '/home/user' ? '~' : currentDir;

        this.writeLine(`<span class="terminal-prompt">${user}:${dirDisplay}$</span> ${commandLine}`, 'input');
        this.commandHistory.unshift(commandLine);
        this.historyIndex = -1;

        const parts = commandLine.trim().split(/\s+/);
        const commandName = parts[0].toLowerCase();
        const args = parts.slice(1);

        if (this.commands[commandName]) {
            try {
                const result = await this.commands[commandName].action(
                    args,
                    this.writeLine,
                    this.terminalOutputElement,
                    null,
                    this.commands,
                    this.appManager
                );
                if (result) {
                    this.writeLine(result);
                }
                this.updatePrompt();
            } catch (error) {
                console.error(`[${this.appName}] Erro ao executar comando ${commandName}:`, error);
                this.writeLine(`Erro ao executar '${commandName}': ${error.message}`, 'error');
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
            this.writeLine(`<span class="red">Comando ou app '${commandName}' não encontrado. Digite 'help' para ver os comandos.</span>`, 'error');
        }
    }

    initializeCommands() {
        this.commands = {};
        for (const cmdName in commands) {
            if (Object.prototype.hasOwnProperty.call(commands, cmdName)) {
                this.registerCommand(cmdName, commands[cmdName].action, commands[cmdName].description);
            }
        }
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
                this.updatePrompt();
            };
            api.on('change', this._authChangeHandler);
        }

        if (!this.terminalAppElement || !this.terminalOutputElement || !this.inputElement || !this.terminalInputLine || !this.terminalPromptElement) {
            console.error(`[${this.appName} - ${this.instanceId}] Erro: Um ou mais elementos do terminal não foram encontrados!`);
            return;
        }

        this.initializeCommands();
        this.inputElement.addEventListener('keydown', this.handleKeydown);

        await this.registerKeyboardShortcut('ctrl+l', () => this.clearTerminal());
        await this.setupContextMenu();

        this.writeLine('Bem-vindo ao Terminal OS! Digite "help" ou "keybinds" para começar.');
        this.inputElement.focus();
        this.scrollToBottom();

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
