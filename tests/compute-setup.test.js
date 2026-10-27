// @vitest-environment jsdom
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {confirmComputeSetup,ComputeInvitation} from '../core/workspace/ComputeSetup.js';
const capabilities={authorized:true,canConnect:true,capacityAvailable:true,requiresMfa:false,instance:null,resources:{cpu:.5,memoryMiB:256,homeMiB:128,idleMinutes:10,maxTotal:2,retentionMinutes:60}};
// jsdom does not implement native modal dialog methods; Chromium verification uses the real methods.
beforeAll(()=>{HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};});
afterEach(()=>{vi.unstubAllGlobals();document.body.replaceChildren();});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
describe('Compute consent and login setup',()=>{
 it('opens without allocation, defaults to temporary, cancels safely, and returns retained only after confirmation',async()=>{
  const fetch=vi.fn().mockImplementation(async()=>Response.json(capabilities));vi.stubGlobal('fetch',fetch);
  let pending=confirmComputeSetup({token:'synthetic'});await tick();
  expect(document.querySelector('input[value="temporary"]').checked).toBe(true);expect(fetch).toHaveBeenCalledTimes(1);
  document.querySelector('[data-compute="cancel"]').click();expect(await pending).toBeNull();
  pending=confirmComputeSetup({token:'synthetic'});await tick();
  document.querySelector('input[value="retained"]').click();document.querySelector('[data-compute="connect"]').click();
  expect(await pending).toBe('retained');expect(fetch.mock.calls.every(([url])=>url==='/api/compute/capabilities')).toBe(true);
 });
 it('disables allocation for missing MFA and aborts the dialog on logout',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({...capabilities,canConnect:false,requiresMfa:true})));
  const controller=new AbortController(),pending=confirmComputeSetup({token:'synthetic',signal:controller.signal});await tick();
  expect(document.querySelector('[data-compute="connect"]').disabled).toBe(true);expect(document.body.textContent).toContain('MFA');
  controller.abort();expect(await pending).toBeNull();expect(document.querySelector('dialog')).toBeNull();
 });
 it('offers configuration once after an eligible login without creating a container',async()=>{
  const fetch=vi.fn().mockResolvedValue(Response.json(capabilities));vi.stubGlobal('fetch',fetch);
  const auth={getCurrentUser:()=>({id:'canonical-a',role:'archon'}),getAuthToken:()=> 'synthetic',on:vi.fn(),off:vi.fn()};
  const session={auth,desktop:document.body,launch:vi.fn()},invitation=new ComputeInvitation(session);
  invitation.initialize();await tick();expect(document.querySelector('.compute-invitation')).not.toBeNull();
  expect(session.launch).not.toHaveBeenCalled();document.querySelector('[data-compute-invite="connect"]').click();
  expect(session.launch).toHaveBeenCalledWith('terminal',{computeSetup:true});
  await invitation.refresh();expect(document.querySelector('.compute-invitation')).toBeNull();expect(fetch).toHaveBeenCalledTimes(1);invitation.destroy();
 });
});
