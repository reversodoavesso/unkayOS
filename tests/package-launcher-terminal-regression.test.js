// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
const shared=vi.hoisted(()=>({workspace:null}));
vi.mock('../core/workspace/WorkspaceSession.js',()=>({getWorkspace:()=>shared.workspace}));
import eventBus from '../core/eventBus.js';
import {PackageManager} from '../core/sdk/PackageManager.js';
import TaskbarApp from '../apps/taskbar/main.js';
import TerminalApp from '../apps/terminal/main.js';
import {parseCommandLine,createTerminalFileSystem} from '../apps/terminal/session.js';
import {normalizeShell} from '../core/workspace/preferences.js';

const cleanups=[];
afterEach(async()=>{for(const work of cleanups.splice(0))await work();document.body.replaceChildren();delete window.appManager;delete window.loadedAppDetails;});
function memoryFs(){
 const tree=new Map();return {
  tree,exists:async p=>tree.has(p),mkdir:async p=>{for(let q=p;q;q=q.slice(0,q.lastIndexOf('/')))tree.set(q,tree.get(q)||null);},
  writeFile:async(p,v)=>tree.set(p,v),readText:async p=>tree.get(p),flush:async()=>{},
  list:async p=>[...tree.keys()].filter(k=>k.startsWith(p+'/')&&!k.slice(p.length+1).includes('/')).map(k=>({name:k.slice(p.length+1)})),
  remove:async p=>{for(const key of [...tree.keys()])if(key===p||key.startsWith(p+'/'))tree.delete(key);}
 };
}

describe('package changes reach the visible launcher and pinned bar',()=>{
 it('updates categories, search, pins and removal without reloading, including restored favorites',async()=>{
  const id='9_notes';
  shared.workspace={settings:{shell:{pinned:[id]},onboarding:{}},auth:{getCurrentUser:()=>null},launch:vi.fn()};
  const manager={loadedAppDetails:new Map(),runningApps:new Map(),runApp:vi.fn(),stopApp:vi.fn()};
  window.appManager=manager;window.loadedAppDetails=manager.loadedAppDetails;
  const root=document.createElement('div');root.innerHTML=readFileSync('apps/taskbar/index.html','utf8');document.body.append(root);
  const taskbar=new TaskbarApp({instanceId:'bar',app_name:'Taskbar'},{setInterval:()=>0,clearInterval:()=>{},appManager:manager});
  taskbar.appContentRoot=root;taskbar.desktopElement=document.body;await taskbar.onRun();cleanups.push(()=>taskbar.onCleanup());
  taskbar.menu.visibilityFlag=true;
  taskbar.menu.category='create';taskbar.menu.searchInput.value='caderno';taskbar.menu.searchInput.focus();
  const packages=new PackageManager({fs:memoryFs(),appManager:manager,auth:{getTier:()=> 'guest'},fetcher:vi.fn()});
  const manifest={id,name:'Caderno',version:'1.0.0',type:'openui',runtime_profile:'client-only',category:'productivity',required_tier:'guest',permissions:[]};
  await packages.installLocal({format:'unkayapp-v1',manifest,files:{'spec.openui':'<h3>Notas</h3>'}});
  expect(taskbar.menu.appsContainer.querySelector('[data-app="'+id+'"]')).not.toBeNull();
  expect(taskbar.menu.searchInput.value).toBe('caderno');expect(document.activeElement).toBe(taskbar.menu.searchInput);
  expect(root.querySelector('.taskbar__pinned [data-app-id="'+id+'"]')?.textContent).toContain('Caderno');
  expect(normalizeShell({pinned:[id]}).pinned).toEqual([id]);
  await packages.uninstall(id);
  expect(taskbar.menu.appsContainer.querySelector('[data-app="'+id+'"]')).toBeNull();
  expect(root.querySelector('.taskbar__pinned [data-app-id="'+id+'"]')).toBeNull();
  await packages.installLocal({format:'unkayapp-v1',manifest:{...manifest,name:'Caderno atualizado',version:'1.1.0'},files:{'spec.openui':'<p>Atualizado</p>'}});
  expect(root.querySelector('.taskbar__pinned').textContent).toContain('Caderno atualizado');
 });
});

describe('terminal runtime boundaries',()=>{
 function terminal(id='terminal-test') {
  const files=new Map(),dirs=new Set(['/','/home/user','/home/a','/home/b']);
  const fs={pwd:()=>'/home/user',stat:p=>({type:dirs.has(p)?'directory':'file'}),exists:p=>dirs.has(p)||files.has(p),touch:(p,v)=>files.set(p,v),cat:p=>files.get(p),rm:vi.fn(),ls:()=>[]};
  const app=new TerminalApp({instanceId:id,app_name:'Terminal'},{fs,auth:{getUserPrompt:()=> 'guest@unkayos'}});
  const root=document.createElement('div');root.innerHTML=readFileSync('apps/terminal/index.html','utf8');document.body.append(root);app.appContentRoot=root;
  app.terminalOutputElement=root.querySelector('.terminal-output');app.terminalPromptElement=root.querySelector('.terminal-prompt');app.initializeCommands();
  cleanups.push(()=>app.computeBridge.disconnect());return {app,files,fs,root};
 }
 it('keeps directories independent and supports quoted paths',async()=>{
  const a=terminal('a'),b=terminal('b');a.app.fs.cd('/home/a');b.app.fs.cd('/home/b');
  await a.app.processCommand('touch "my note.txt"');await b.app.processCommand('touch "my note.txt"');
  expect(a.files.has('/home/a/my note.txt')).toBe(true);expect(b.files.has('/home/b/my note.txt')).toBe(true);
  expect(a.app.fs.pwd()).toBe('/home/a');expect(b.app.fs.pwd()).toBe('/home/b');
  expect(parseCommandLine("echo '' 'a b' c\\ d")).toEqual(['echo','','a b','c d']);
  expect(()=>parseCommandLine("echo 'unterminated")).toThrow('Aspas');
 });
 it('routes remote commands only to that window and lets the other window stay local',async()=>{
  const a=terminal('a'),b=terminal('b');a.app.computeBridge.isConnected=true;a.app.computeBridge.sendInput=vi.fn();
  await a.app.processCommand('rm remote-file');await b.app.processCommand('echo local');
  expect(a.app.computeBridge.sendInput).toHaveBeenCalledWith('rm remote-file\n');expect(a.fs.rm).not.toHaveBeenCalled();
  expect(b.app.computeBridge.isConnected).toBe(false);expect(b.root.textContent).toContain('local');
  await a.app.processCommand('mode local');expect(a.app.computeBridge.isConnected).toBe(false);
 });
 it('does not execute markup from commands or module output',async()=>{
  const {app,root}=terminal();await app.processCommand('echo "<img src=x onerror=alert(1)>"');
  app.writeLine('<script>alert(1)</script><span onclick="alert(1)">output</span>');
  expect(root.querySelector('script,img,[onclick],[onerror]')).toBeNull();expect(root.textContent).toContain('<img');
 });
});
