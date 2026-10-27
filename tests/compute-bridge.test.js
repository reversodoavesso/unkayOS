// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({getTier:vi.fn(),getToken:vi.fn(),getUser:vi.fn()}));
vi.mock('../core/sdk/unkay.js', () => ({ unkay: { auth } }));
import { ComputeBridge } from '../apps/terminal/compute-bridge.js';

describe('canonical compute authorization bridge', () => {
  const ticket = '11111111-1111-4111-8111-111111111111';
  beforeEach(() => {auth.getTier.mockReturnValue('sysadmin');auth.getToken.mockReturnValue('synthetic-bearer');auth.getUser.mockReturnValue({sub:'owner-a'});});
  afterEach(() => {vi.useRealTimers();vi.unstubAllGlobals();});
  it('denies guest and standard users before requesting a ticket', async () => {
    const fetch=vi.fn(),writeLine=vi.fn();vi.stubGlobal('fetch',fetch);
    for(const role of ['guest','standard']) {auth.getTier.mockReturnValue(role);await new ComputeBridge().connect({writeLine,confirmCompute:async()=> 'temporary'});}
    expect(fetch).not.toHaveBeenCalled();
    expect(writeLine).toHaveBeenCalledWith(expect.stringContaining('Acesso negado'));
  });
  it('keeps heartbeats and terminal input working and clears timers on disconnect', async () => {
    vi.useFakeTimers();
    const send=vi.fn();let socket;
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({ticket,success:true})));
    vi.stubGlobal('WebSocket',class {static OPEN=1;constructor(){this.readyState=1;this.send=send;socket=this;}close(){this.onclose();}});
    const bridge=new ComputeBridge();await bridge.connect({writeLine:vi.fn(),confirmCompute:async()=> 'temporary'});socket.onopen();
    expect(bridge.isConnected).toBe(false);
    socket.onmessage({data:JSON.stringify({type:'ready',sessionId:'synthetic-session'})});
    expect(bridge.isConnected).toBe(true);bridge.sendInput('pwd\n');
    expect(send).toHaveBeenCalledWith(JSON.stringify({type:'input',data:'pwd\n'}));
    await vi.advanceTimersByTimeAsync(25000);
    expect(send).toHaveBeenCalledWith(JSON.stringify({type:'ping'}));
    bridge.disconnect();expect(bridge.isConnected).toBe(false);expect(vi.getTimerCount()).toBe(0);
  });
  it('exchanges the bearer for a one-use ticket without exposing either credential in output', async () => {
    const lines = [], sockets = [];
    const fetch = vi.fn().mockResolvedValue(Response.json({ticket,success:true}));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('WebSocket', class { constructor(url) { this.url = url; sockets.push(this); } });
    const bridge = new ComputeBridge();
    await bridge.connect({writeLine: line => lines.push(line),confirmCompute:async()=> 'temporary'});
    expect(fetch).toHaveBeenCalledWith('/api/compute/ticket', expect.objectContaining({method:'POST',headers:{Authorization:'Bearer synthetic-bearer','Content-Type':'application/json'},body:JSON.stringify({mode:'temporary',confirmed:true})}));
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
    const bridge = new ComputeBridge();await bridge.connect({writeLine,confirmCompute:async()=> 'temporary'});
    expect(WebSocket).not.toHaveBeenCalled();
    expect(writeLine).toHaveBeenCalledWith(expect.stringContaining('MFA &lt;required&gt;'));
    expect(bridge.isConnecting).toBe(false);
  });
  it('refuses a foreign endpoint before requesting a ticket', async () => {
    const fetch = vi.fn();vi.stubGlobal('fetch',fetch);
    await new ComputeBridge().connect({writeLine:vi.fn()}, 'wss://foreign.invalid/ws/terminal');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not allocate after a setup confirmation is cancelled or superseded',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const bridge=new ComputeBridge();let resolve;
    const connecting=bridge.connect({writeLine:vi.fn(),confirmCompute:()=>new Promise(done=>{resolve=done;})});
    bridge.disconnect();resolve('retained');await connecting;
    expect(fetch).not.toHaveBeenCalled();expect(bridge.isConnected).toBe(false);
  });
  it('disconnects on account switches even if both accounts have the same privileged tier',async()=>{
    const fetch=vi.fn().mockResolvedValue(Response.json({ticket,success:true}));vi.stubGlobal('fetch',fetch);
    let socket;vi.stubGlobal('WebSocket',class {static OPEN=1;constructor(){this.readyState=1;socket=this;}close(){}});
    const bridge=new ComputeBridge();await bridge.connect({writeLine:vi.fn(),confirmCompute:async()=> 'retained'});
    socket.onmessage({data:JSON.stringify({type:'ready',sessionId:'synthetic'})});
    expect(bridge.disconnectIfIdentityChanged()).toBe(false);
    auth.getUser.mockReturnValue({sub:'owner-b'});
    expect(bridge.disconnectIfIdentityChanged()).toBe(true);expect(bridge.isConnected).toBe(false);expect(bridge.ownerId).toBeNull();
  });
});
