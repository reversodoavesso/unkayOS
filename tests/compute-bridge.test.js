import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ComputeBridge } from '../apps/terminal/compute-bridge.js';

describe('unkayOS 2.0 Compute Bridge (Tier 2 SysAdmin/Demiurge)', () => {
    let bridge;

    beforeEach(() => {
        bridge = new ComputeBridge();
        vi.useFakeTimers();
    });

    afterEach(() => {
        bridge.cleanup();
        vi.useRealTimers();
    });

    it('should deny compute container access to guest or standard users', async () => {
        globalThis.window = {
            authSystem: {
                getCurrentUser: () => ({ username: 'regular_user', roles: ['standard'] }),
                getAuthToken: () => 'token'
            }
        };

        const terminalOutput = [];
        const mockTerminal = {
            writeLine: (txt) => terminalOutput.push(txt)
        };

        await bridge.connect(mockTerminal);
        expect(bridge.isConnected).toBe(false);
        expect(terminalOutput.some(t => t.includes('Acesso negado'))).toBe(true);
    });

    it('should initiate WebSocket connection and heartbeat for SysAdmin or Demiurge', async () => {
        globalThis.window = {
            location: { protocol: 'https:', host: 'unkayos.reversodoavesso.com' },
            authSystem: {
                getCurrentUser: () => ({ username: 'demiurge_user', roles: ['demiurge'] }),
                getAuthToken: () => 'secret-jwt'
            }
        };

        let sentMessages = [];
        let closed = false;

        class MockWebSocket {
            static OPEN = 1;
            constructor(url) {
                this.url = url;
                this.readyState = 1; // OPEN
                // Trigger onopen on next tick after listeners are attached
                setTimeout(() => {
                    if (this.onopen) this.onopen();
                }, 0);
            }
            send(data) {
                sentMessages.push(data);
            }
            close() {
                closed = true;
                if (this.onclose) this.onclose();
            }
        }
        globalThis.WebSocket = MockWebSocket;

        const terminalOutput = [];
        const mockTerminal = {
            writeLine: (txt) => terminalOutput.push(txt)
        };

        await bridge.connect(mockTerminal);

        // Run timer for onopen
        await vi.advanceTimersByTimeAsync(10);
        expect(bridge.isConnected).toBe(true);
        expect(terminalOutput.some(t => t.includes('Sessão TTY estabelecida'))).toBe(true);

        // Advance 25s for heartbeat ping
        await vi.advanceTimersByTimeAsync(25000);
        expect(sentMessages.some(m => m.includes('ping'))).toBe(true);

        // Disconnect
        bridge.disconnect();
        expect(bridge.isConnected).toBe(false);
    });
});
