import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const arg=name=>process.argv.find(value=>value.startsWith(name+'='))?.slice(name.length+1);
const base=arg('--base')||'http://127.0.0.1:5178',output=resolve(arg('--output')||'browser-proof/compute-setup');
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}});
const assert=(value,message)=>{if(!value)throw Error(message);};const errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));
let caps={authorized:true,canConnect:true,capacityAvailable:true,requiresMfa:false,instance:null,resources:{cpu:.5,memoryMiB:256,homeMiB:128,idleMinutes:10,retentionMinutes:60,maxTotal:2,maxPerUser:1,internet:false,durableStorage:true}};
try{
 await mkdir(output,{recursive:true});
 await page.route('**/api/compute/**',route=>{
  requests.push({method:route.request().method(),path:new URL(route.request().url()).pathname});
  return route.fulfill({contentType:'application/json',body:JSON.stringify(caps)});
 });
 await page.goto(base);await page.waitForFunction(()=>window.workspaceSession);
 if(await page.locator('.workspace-setup[open]').count())await page.locator('[data-setup="skip"]').click();
 const build=await(await page.request.get(base+'/build-info.json')).json();
 const confirm=()=>page.evaluate(async()=>{const {confirmComputeSetup}=await import('/core/workspace/ComputeSetup.js');return confirmComputeSetup({token:'synthetic-component-test'});});
 let pending=confirm();await page.locator('.compute-setup[open]').waitFor();
 assert(await page.locator('input[value="temporary"]').isChecked(),'Temporary mode is not the default');
 await page.locator('[data-compute="cancel"]').click();assert(await pending===null,'Cancel did not abort setup');
 assert(requests.every(request=>request.method==='GET'),'Opening/cancelling setup attempted an allocation');
 pending=confirm();await page.locator('.compute-setup[open]').waitFor();
 await page.locator('input[value="retained"]').check();await page.screenshot({path:resolve(output,'compute-confirmation-dark.png')});
 const centered=await page.locator('.compute-setup').evaluate(el=>{const rect=el.getBoundingClientRect();return Math.abs(rect.left+rect.width/2-innerWidth/2)<2&&Math.abs(rect.top+rect.height/2-innerHeight/2)<2;});assert(centered,'Compute confirmation is not centered');
 await page.locator('[data-compute="connect"]').click();assert(await pending==='retained','Retained consent was not returned');
 caps={...caps,canConnect:false,requiresMfa:true};pending=confirm();await page.locator('.compute-setup[open]').waitFor();
 assert(await page.locator('[data-compute="connect"]').isDisabled(),'Missing MFA did not block Connect');
 await page.locator('[data-compute="cancel"]').click();await pending;
 caps={...caps,canConnect:true,requiresMfa:false};
 await page.evaluate(()=>window.workspaceSession.update({appearance:{theme:'light'}}));await page.setViewportSize({width:390,height:844});
 pending=confirm();await page.locator('.compute-setup[open]').waitFor();
 const overflow=await page.locator('.compute-setup').evaluate(el=>el.scrollWidth>el.clientWidth);assert(!overflow,'Compute setup overflows on mobile');
 await page.screenshot({path:resolve(output,'compute-confirmation-mobile.png')});await page.locator('[data-compute="cancel"]').click();await pending;
 await page.evaluate(async()=>{
  const {ComputeInvitation}=await import('/core/workspace/ComputeSetup.js');window.__computeLaunches=[];
  window.__computeInvite=new ComputeInvitation({desktop:document.querySelector('#desktop'),auth:{getCurrentUser:()=>({id:'synthetic-owner',role:'archon'}),getAuthToken:()=> 'synthetic-component-test',on(){},off(){}},launch:(id,params)=>window.__computeLaunches.push({id,params})});window.__computeInvite.initialize();
 });
 await page.locator('.compute-invitation').waitFor();
 assert((await page.evaluate(()=>window.__computeLaunches.length))===0,'Login invitation started a terminal automatically');
 await page.locator('[data-compute-invite="connect"]').click();
 assert((await page.evaluate(()=>window.__computeLaunches[0]?.params.computeSetup))===true,'Invitation did not open setup');
 await page.evaluate(()=>window.__computeInvite.destroy());assert(!errors.length,'Unhandled browser errors: '+errors.join(';'));
 const report={status:'passed',base,revision:build.revision,version:build.version,identityFixture:true,runtimeVerifiedSeparately:true,
  confirmationBeforeAllocation:true,temporaryDefault:true,retainedConsent:true,cancelDoesNotAllocate:true,mfaBlocksConnect:true,loginInvitationDoesNotAllocate:true,mobileOverflow:overflow,errors};
 await writeFile(resolve(output,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
