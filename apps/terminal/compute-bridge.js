// apps/terminal/compute-bridge.js - unkayOS 2.0 Compute Bridge (Tier 2 SysAdmin/Demiurge)
// Line-oriented WebSocket bridge to an ephemeral Docker container on Pi.

import { unkay } from '../../core/sdk/unkay.js';
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

export class ComputeBridge {
    constructor({ onStateChange = () => {} } = {}) {
        this.onStateChange = onStateChange;
        this.readyTimer = null;
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
            terminal.writeLine('<span class="gray">O terminal permanece local. Comandos locais e módulos WASI continuam disponíveis.</span>');
            return;
        }

        const token = unkay.auth.getToken();
        if (!token) {
            terminal.writeLine('<span class="red">Entre com sua conta RDA antes de conectar ao Compute.</span>');
            return;
        }
        this.terminal = terminal;
        this.isConnecting = true;
        this.onStateChange();
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
            const socket = this.ws;
            this.readyTimer = setTimeout(() => {
                if (this.ws !== socket || this.isConnected) return;
                terminal.writeLine('<span class="red">Compute não confirmou a inicialização. Retornando ao modo local.</span>');
                this.disconnect();
            }, 20000);

            this.ws.onopen = () => {
                // An upgraded WebSocket is not proof of authorization or a running container.
            };

            this.ws.onmessage = (event) => {
                if (this.ws !== socket) return;
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'ready' && !this.isConnected) {
                        clearTimeout(this.readyTimer); this.readyTimer = null;
                        this.isConnected = true; this.isConnecting = false;
                        terminal.writeLine('<span class="green">[Compute] Linux remoto autorizado e iniciado. Digite exit ou mode local para desconectar.</span>');
                        this.heartbeatTimer = setInterval(() => {
                            if (this.ws === socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
                        }, 25000);
                        this.onStateChange(); return;
                    }
                    if (msg.type === 'pong') return;
                    if (msg.type === 'output') {
                        terminal.writeLine(escapeText(msg.data));
                    }
                } catch {
                    terminal.writeLine(escapeText(event.data));
                }
            };

            this.ws.onerror = (err) => {
                if (this.ws !== socket) return;
                terminal.writeLine(`<span class="red">[Compute Error] Conexão WebSocket recusada ou indisponível: ${escapeText(err.message || 'Host ocupado ou offline')}</span>`);
            };

            this.ws.onclose = () => {
                if (this.ws !== socket) return;
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
        const socket = this.ws;
        this.cleanup();
        socket?.close();
    }

    cleanup() {
        if (this.readyTimer) clearTimeout(this.readyTimer);
        this.readyTimer = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.abortController?.abort();
        this.abortController = null;
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        this.ws = null;
        this.onStateChange();
    }
}

export const computeBridge = new ComputeBridge();
