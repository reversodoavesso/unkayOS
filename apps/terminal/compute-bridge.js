// apps/terminal/compute-bridge.js - unkayOS 2.0 Compute Bridge (Tier 2 SysAdmin/Demiurge)
// Bidirectional WebSocket TTY bridge to ephemeral Docker compute container on Pi

import { unkay } from '../../core/sdk/unkay.js';

export class ComputeBridge {
    constructor() {
        this.ws = null;
        this.heartbeatTimer = null;
        this.isConnected = false;
        this.terminal = null;
    }

    /**
     * Connect terminal to remote Docker compute container
     * @param {object} terminal - TerminalApp instance
     * @param {string} wsUrl - WebSocket endpoint URL
     */
    async connect(terminal, wsUrl = null) {
        if (this.isConnected) {
            terminal.writeLine('<span class="yellow">Já conectado a uma sessão de compute.</span>');
            return;
        }

        const tier = unkay.auth.getTier();
        if (tier !== 'sysadmin' && tier !== 'demiurge') {
            terminal.writeLine('<span class="red">Acesso negado: Recursos de computação em nuvem (Tier 2) exigem permissão SysAdmin ou Demiurge.</span>');
            terminal.writeLine('<span class="gray">Você continuará operando no kernel WASI 100% local (custo zero).</span>');
            return;
        }

        const token = unkay.auth.getToken();
        this.terminal = terminal;

        const defaultUrl = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') +
            (window.location.host.includes('reversodoavesso.com') ? 'api.reversodoavesso.com' : 'localhost:4000') +
            `/ws/terminal?token=${token || ''}`;

        const targetUrl = wsUrl || defaultUrl;

        terminal.writeLine(`<span class="gray">Conectando ao container Docker no Raspberry Pi (${targetUrl})...</span>`);

        try {
            this.ws = new WebSocket(targetUrl);

            this.ws.onopen = () => {
                this.isConnected = true;
                terminal.writeLine('<span class="green">[Compute] Sessão TTY estabelecida com container Linux (cgroups: 256MB / 0.5 CPU).</span>');
                terminal.writeLine('<span class="gray">Comandos reais habilitados (node, git, rda). Digite `exit` para desconectar.</span>');

                // Heartbeat to keep Cloudflare Tunnel alive (25s ping)
                this.heartbeatTimer = setInterval(() => {
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send(JSON.stringify({ type: 'ping' }));
                    }
                }, 25000);
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'pong') return;
                    if (msg.type === 'output') {
                        terminal.writeLine(msg.data);
                    }
                } catch {
                    terminal.writeLine(event.data);
                }
            };

            this.ws.onerror = (err) => {
                terminal.writeLine(`<span class="red">[Compute Error] Conexão WebSocket recusada ou indisponível: ${err.message || 'Host ocupado ou offline'}</span>`);
            };

            this.ws.onclose = () => {
                this.cleanup();
                terminal.writeLine('<span class="yellow">[Compute] Conexão com o container encerrada. Retornando ao shell local.</span>');
            };

        } catch (err) {
            terminal.writeLine(`<span class="red">Falha ao iniciar conexão: ${err.message}</span>`);
            this.cleanup();
        }
    }

    sendInput(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'input', data }));
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
        this.cleanup();
    }

    cleanup() {
        this.isConnected = false;
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        this.ws = null;
    }
}

export const computeBridge = new ComputeBridge();
