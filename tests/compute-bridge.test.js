// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../core/sdk/unkay.js', () => ({ unkay: { auth: { getTier: () => 'sysadmin', getToken: () => 'synthetic-bearer' } } }));
import { ComputeBridge } from '../apps/terminal/compute-bridge.js';

describe('canonical compute authorization bridge', () => {
  const ticket = '11111111-1111-4111-8111-111111111111';
  afterEach(() => vi.unstubAllGlobals());
  it('exchanges the bearer for a one-use ticket without exposing either credential in output', async () => {
    const lines = [], sockets = [];
    const fetch = vi.fn().mockResolvedValue(Response.json({ticket,success:true}));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('WebSocket', class { constructor(url) { this.url = url; sockets.push(this); } });
    const bridge = new ComputeBridge();
    await bridge.connect({writeLine: line => lines.push(line)});
    expect(fetch).toHaveBeenCalledWith('/api/compute/ticket', expect.objectContaining({method:'POST',headers:{Authorization:'Bearer synthetic-bearer'}}));
    expect(sockets).toHaveLength(1);
    expect(new URL(sockets[0].url).searchParams.get('ticket')).toBe(ticket);
    expect(sockets[0].url).not.toContain('synthetic-bearer');
    expect(lines.join('')).not.toContain(ticket);
    sockets[0].onmessage({data:JSON.stringify({type:'output',data:'<img src=x onerror=alert(1)>'})});
    expect(lines.at(-1)).toContain('&lt;img');
    bridge.cleanup();
  });
  it('reports an MFA denial without opening a socket or rendering upstream HTML', async () => {
    const writeLine = vi.fn(), WebSocket = vi.fn();
    vi.stubGlobal('WebSocket', WebSocket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({error:'MFA <required>'}, {status:403})));
    const bridge = new ComputeBridge();await bridge.connect({writeLine});
    expect(WebSocket).not.toHaveBeenCalled();
    expect(writeLine).toHaveBeenCalledWith(expect.stringContaining('MFA &lt;required&gt;'));
    expect(bridge.isConnecting).toBe(false);
  });
  it('refuses a foreign endpoint before requesting a ticket', async () => {
    const fetch = vi.fn();vi.stubGlobal('fetch',fetch);
    await new ComputeBridge().connect({writeLine:vi.fn()}, 'wss://foreign.invalid/ws/terminal');
    expect(fetch).not.toHaveBeenCalled();
  });
});
