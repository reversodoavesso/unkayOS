// apps/terminal/commands.js - v1.2.0 (Com sistema de arquivos, fullscreen e keybinds)
import { filesystemCommands } from './filesystem-commands.js';
import { wasmTerminalCommands } from './wasm-commands.js';
import { fullscreenManager } from '../../core/FullscreenManager.js';
import { keyboardManager } from '../../core/KeyboardManager.js';

function formatKeybindsOutput() {
    const mgr = (typeof window !== 'undefined' && window.keyboardManager) || keyboardManager;
    const list = mgr?.getSystemShortcuts?.() || [];
    if (list.length === 0) {
        return '<span class="yellow">Nenhum atalho global de sistema registrado.</span>';
    }
    let output = '<span class="yellow">Atalhos Globais do Sistema (unkayOS Keybinds):</span><br>';
    for (const item of list) {
        const combos = item.keys.map((k) => `<kbd>${k}</kbd>`).join(' ou ');
        output += `  <span class="cyan">${combos}</span> — ${item.description || item.id}<br>`;
    }
    return output;
}

export const commands = {
    // Comandos do sistema de arquivos
    ...filesystemCommands,
    ...wasmTerminalCommands,
    help: {
        description: "Exibe a lista de comandos disponíveis.",
        action: (args, appendToTerminal, terminalOutput, displayInitialMessages, allCommands) => {
            let output = '<span class="yellow">Comandos disponíveis:</span><br>';
            for (const commandName in allCommands) {
                if (Object.prototype.hasOwnProperty.call(allCommands, commandName)) {
                    output += `<span class="green">${commandName}</span><br>`;
                    output += `  ${allCommands[commandName].description}<br><br>`;
                }
            }
            appendToTerminal(output);
            return '';
        }
    },
    fullscreen: {
        description: "Alterna ou controla o modo de tela cheia do navegador (fullscreen [on|off|status]).",
        action: async (args) => {
            const mgr = (typeof window !== 'undefined' && window.fullscreenManager) || fullscreenManager;
            const sub = (args[0] || 'toggle').toLowerCase();
            if (sub === 'status') {
                const state = mgr?.isFullscreen?.() ? 'ATIVO' : 'INATIVO';
                return `<span class="cyan">Modo Tela Cheia:</span> ${state}`;
            }
            if (sub === 'on' || sub === 'enter') {
                await mgr?.enterFullscreen?.();
                return '<span class="green">Tela cheia ativada (F11 para alternar).</span>';
            }
            if (sub === 'off' || sub === 'exit') {
                await mgr?.exitFullscreen?.();
                return '<span class="yellow">Modo janela restaurado.</span>';
            }
            const active = await mgr?.toggleFullscreen?.();
            return active
                ? '<span class="green">Tela cheia ativada (F11 para alternar).</span>'
                : '<span class="yellow">Modo janela restaurado.</span>';
        }
    },
    keybinds: {
        description: "Lista todos os atalhos globais de teclado do sistema (WM, lançador, apps e tela cheia).",
        action: () => formatKeybindsOutput()
    },
    shortcuts: {
        description: "Alias para 'keybinds' — exibe os atalhos globais do sistema.",
        action: () => formatKeybindsOutput()
    },
    echo: {
        description: "Exibe o texto digitado.",
        action: (args) => {
            return args.join(' ');
        }
    },
    clear: {
        description: "Limpa a tela do terminal.",
        action: (args, appendToTerminal, terminalOutput) => {
            terminalOutput.innerHTML = '';
            return '';
        }
    },
    date: {
        description: "Exibe a data e hora atuais.",
        action: () => {
            const now = new Date();
            return now.toLocaleString();
        }
    },
    ps: {
        description: "Lista os processos (aplicativos) em execução.",
        action: (args, appendToTerminal, terminalOutput, displayInitialMessages, allCommands, appManager) => {
            if (!appManager) {
                return '<span class="red">Erro: Gerenciador de aplicativos não disponível.</span>';
            }

            let output = '<span class="yellow">Processos em execução:</span><br>';

            // appManager.runningApps é um Map, não um Array. Precisa iterar sobre os valores.
            if (appManager.runningApps && appManager.runningApps.size > 0) {
                // Separa apps por tipo
                const systemApps = [];
                const userApps = [];
                const headlessApps = [];

                for (const [instanceId, appInfo] of appManager.runningApps.entries()) {
                    const app = appInfo.CORE;
                    if (app.mode === 'desktop_ui' || app.mode === 'custom_ui') {
                        systemApps.push({ instanceId, app });
                    } else if (app.mode === 'system_window') {
                        userApps.push({ instanceId, app });
                    } else if (app.mode === 'headless') {
                        headlessApps.push({ instanceId, app });
                    }
                }

                // Apps de Sistema (não podem ser fechados)
                if (systemApps.length > 0) {
                    output += '<span class="purple">--- Aplicativos de Sistema (não podem ser fechados) ---</span><br>';
                    for (const { instanceId, app } of systemApps) {
                        output += `  PID: ${instanceId} | Nome: ${app.app_name || 'N/A'} | Modo: ${app.mode} | <span class="orange">Sistema</span><br>`;
                    }
                    output += '<br>';
                }

                // Apps de Usuário (podem ser fechados)
                if (userApps.length > 0) {
                    output += '<span class="cyan">--- Aplicativos de Usuário (podem ser fechados) ---</span><br>';
                    for (const { instanceId, app } of userApps) {
                        output += `  PID: ${instanceId} | Nome: ${app.app_name || 'N/A'} | Modo: ${app.mode} | <span class="green">Terminável</span><br>`;
                    }
                    output += '<br>';
                }

                // Apps Headless
                if (headlessApps.length > 0) {
                    output += '<span class="cyan">--- Aplicativos Headless ---</span><br>';
                    for (const { instanceId, app } of headlessApps) {
                        output += `  PID: ${instanceId} | Nome: ${app.app_name || 'N/A'} | Modo: ${app.mode} | <span class="green">Terminável</span><br>`;
                    }
                    output += '<br>';
                }

                // Resumo
                output += `<span class="yellow">Resumo:</span> ${systemApps.length} sistema, ${userApps.length} usuário, ${headlessApps.length} headless<br>`;
            } else {
                output += '  Nenhum aplicativo em execução.<br>';
            }

            return output;
        }
    },  
    login: {
        description: "Inicia o processo de login SSO.",
        action: async () => {
            const authSystem = window.authSystem?.getAPI();
            if (!authSystem) {
                return '<span class="red">Erro: Sistema de autenticação não disponível.</span>';
            }
            
            if (authSystem.isAuthenticated()) {
                return '<span class="yellow">Você já está autenticado.</span>';
            }
            
            try {
                await authSystem.login();
                return '<span class="green">Redirecionando para autenticação SSO...</span>';
            } catch (error) {
                return `<span class="red">Erro ao iniciar login: ${error.message}</span>`;
            }
        }
    },
    logout: {
        description: "Realiza logout do sistema.",
        action: () => {
            const authSystem = window.authSystem?.getAPI();
            if (!authSystem) {
                return '<span class="red">Erro: Sistema de autenticação não disponível.</span>';
            }
            
            if (!authSystem.isAuthenticated()) {
                return '<span class="yellow">Você não está autenticado.</span>';
            }
            
            try {
                authSystem.logout();
                return '<span class="green">Logout realizado com sucesso.</span>';
            } catch (error) {
                return `<span class="red">Erro ao fazer logout: ${error.message}</span>`;
            }
        }
    },
    auth: {
        description: "Exibe informações sobre o status de autenticação.",
        action: () => {
            const authSystem = window.authSystem?.getAPI();
            if (!authSystem) {
                return '<span class="red">Erro: Sistema de autenticação não disponível.</span>';
            }
            
            let output = '<span class="yellow">Status de Autenticação:</span><br>';
            
            if (authSystem.isAuthenticated()) {
                const user = authSystem.getCurrentUser();
                output += `<span class="green"><rda-icon name="check"></rda-icon> Autenticado</span><br>`;
                output += `<span class="cyan">Usuário:</span> ${user.name || user.username || 'N/A'}<br>`;
                output += `<span class="cyan">Email:</span> ${user.email || 'N/A'}<br>`;
                output += `<span class="cyan">ID:</span> ${user.sub || user.id || 'N/A'}<br>`;
                
                if (user.permissions && user.permissions.length > 0) {
                    output += `<span class="cyan">Permissões:</span> ${user.permissions.join(', ')}<br>`;
                }
                
                if (user.roles && user.roles.length > 0) {
                    output += `<span class="cyan">Roles:</span> ${user.roles.join(', ')}<br>`;
                }
            } else {
                output += `<span class="red"><rda-icon name="x"></rda-icon> Não autenticado</span><br>`;
                output += 'Use o comando <span class="green">login</span> para autenticar.<br>';
            }
            
            return output;
        }
    }
};
