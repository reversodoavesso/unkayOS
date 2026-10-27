// apps/terminal/compute-bridge.js - unkayOS 2.0 Compute Bridge (Tier 2 SysAdmin/Demiurge)
// Bidirectional WebSocket TTY bridge to ephemeral Docker compute container on Pi

import { unkay } from '../../core/sdk/unkay.js';
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

export class ComputeBridge {
    constructor() {
        this.ws = null;
        this.heartbeatTimer = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.abortController = null;
        this.terminal = null;
    }

    /**
     * Connect terminal to remote Docker compute container
     * @param {object} terminal - TerminalApp instance
     * @param {string} wsUrl - WebSocket endpoint URL
     */
    async connect(terminal, wsUrl = null) {
        if (this.isConnected || this.isConnecting) {
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
        if (!token) {
            terminal.writeLine('<span class="red">Entre com sua conta RDA antes de conectar ao Compute.</span>');
            return;
        }
        this.terminal = terminal;
        this.isConnecting = true;
        try {
            const expected = new URL('/ws/terminal', window.location.href);
            expected.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const target = wsUrl ? new URL(wsUrl, expected) : expected;
            if (target.origin !== expected.origin || target.pathname !== '/ws/terminal' || target.username || target.password || target.search || target.hash) throw Error('Use o endpoint de computação desta instalação.');
            this.abortController = new AbortController();
            const requestController = this.abortController;
            const timeout = setTimeout(() => requestController.abort(), 15000);
            let response;
            try {
                response = await fetch('/api/compute/ticket', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: requestController.signal });
            } finally { clearTimeout(timeout); }
            const result = await response.json();
            if (!response.ok) throw Error(typeof result.error === 'string' ? result.error : 'Não foi possível autorizar a sessão de computação.');
            if (requestController.signal.aborted || !/^[a-f0-9-]{36}$/i.test(result.ticket || '')) throw Error('Ticket de computação inválido ou expirado.');
            this.abortController = null;
            target.searchParams.set('ticket', result.ticket);
            terminal.writeLine('<span class="gray">Conectando ao container Docker no Raspberry Pi...</span>');
            this.ws = new WebSocket(target.href);

            this.ws.onopen = () => {
                this.isConnected = true;
                this.isConnecting = false;
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
                        terminal.writeLine(escapeText(msg.data));
                    }
                } catch {
                    terminal.writeLine(escapeText(event.data));
                }
            };

            this.ws.onerror = (err) => {
                terminal.writeLine(`<span class="red">[Compute Error] Conexão WebSocket recusada ou indisponível: ${escapeText(err.message || 'Host ocupado ou offline')}</span>`);
            };

            this.ws.onclose = () => {
                this.cleanup();
                terminal.writeLine('<span class="yellow">[Compute] Conexão com o container encerrada. Retornando ao shell local.</span>');
            };

        } catch (err) {
            terminal.writeLine(`<span class="red">Falha ao iniciar conexão: ${escapeText(err.name === 'AbortError' ? 'Solicitação cancelada ou tempo de conexão excedido.' : err.message)}</span>`);
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
        this.isConnecting = false;
        this.abortController?.abort();
        this.abortController = null;
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        this.ws = null;
    }
}

export const computeBridge = new ComputeBridge();
