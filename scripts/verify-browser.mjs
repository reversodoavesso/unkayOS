import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const value = name => args.find(arg => arg.startsWith(name + '='))?.slice(name.length + 1);
const base = (value('--base') || 'http://127.0.0.1:5178').replace(/\/$/, '');
const output = value('--output');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const capture = async filename => { if (output) await page.screenshot({ path: resolve(output, filename) }); };
try {
  if (output) await mkdir(output, { recursive: true });
  const response = await page.goto(base);
  assert(response.status() === 200, 'Desktop did not return HTTP 200');
  const module = await page.request.get(base + '/core/vendor/purify.es.mjs');
  const moduleType = module.headers()['content-type'] || '';
  assert(module.status() === 200 && /(?:java|ecma)script/.test(moduleType), 'Sanitizer ES module has invalid MIME: ' + moduleType);
  assert((await module.text()).includes('DOMPurify'), 'Sanitizer module content missing');
  const release = await (await page.request.get(base + '/release.json')).json();
  const build = await (await page.request.get(base + '/build-info.json')).json();
  if (value('--expect-version')) assert(release.releases[0].version === value('--expect-version'), 'Release mismatch');
  if (value('--expect-revision')) assert(build.revision === value('--expect-revision'), 'Build revision mismatch');
  await page.waitForFunction(() => window.workspaceSession);
  if (await page.locator('.workspace-setup[open]').count()) await page.locator('[data-setup="skip"]').click();
  await page.waitForFunction(() => !document.querySelector('.workspace-setup[open]'));
  const apps = await page.evaluate(() => [...window.loadedAppDetails.values()].filter(app => app.mode === 'system_window' && !app.hidden).map(app => app.id));
  const initialized = [];
  for (const id of apps) {
    const instanceId = await page.evaluate(id => window.appManager.runApp(id), id);
    const state = await page.evaluate(instanceId => {
      const app = window.appManager.runningApps.get(instanceId);
      return { instance: !!app?.CORE.appInstance, initialized: app?.CORE.initialized, failed: !!(app?.CORE.launchFailed || app?.CORE.moduleError || app?.UI.loadError || app?.UI.startError), error: String(app?.CORE.moduleError || app?.UI.loadError || app?.UI.startError || ''), preview: app?.CORE.id === 'openui' ? !!app.CORE.appInstance?.activeSandbox?.shadowRoot?.querySelector('#openui-body > div')?.textContent.trim() : true };
    }, instanceId);
    assert(instanceId && state.instance && state.initialized && !state.failed && state.preview, `${id} did not initialize: ${JSON.stringify(state)}`);
    initialized.push(id);
    console.log(`Initialized: ${id}`);
    if (id === 'openui') await capture('openui-ready.png');
    await page.evaluate(id => window.appManager.stopApp(id), instanceId);
  }

  let recovery = false;
  let moduleRecovery = false, startupRecovery = false;
  if (args.includes('--exercise-failures')) {
    let cssAttempts = 0;
    await page.route('**/apps/text-editor/style.css', route => ++cssAttempts === 1 ? route.fulfill({ status: 503, contentType: 'text/plain', body: 'Temporary test failure' }) : route.continue());
    const failedId = await page.evaluate(() => window.appManager.runApp('text-editor'));
    const failedWindow = page.locator(`.app[data-instance-id="${failedId}"]`).first();
    await failedWindow.getByRole('button', { name: 'Tentar novamente' }).waitFor();
    assert(await page.locator(`.taskbar__apps_on [data-instance-id="${failedId}"]`).count(), 'Failed window cannot be restored from taskbar');
    assert(await failedWindow.locator('details').getAttribute('open') === null, 'Diagnostics must start collapsed');
    await capture('app-error-dark.png');
    await failedWindow.getByText('Detalhes técnicos', { exact: true }).click();
    assert((await failedWindow.locator('details').textContent()).includes('APP_RESOURCE_LOAD_FAILED'), 'Resource diagnostic missing');
    await page.evaluate(() => window.workspaceSession.update({ appearance: { theme: 'light', accent: 'violet' } }));
    await capture('app-error-light.png');
    await page.setViewportSize({ width: 390, height: 844 });
    // Reopen after changing viewport so the window uses the mobile work area.
    await page.evaluate(id => window.appManager.stopApp(id), failedId);
    cssAttempts = 0;
    const mobileId = await page.evaluate(() => window.appManager.runApp('text-editor'));
    const mobileWindow = page.locator(`.app[data-instance-id="${mobileId}"]`).first();
    await mobileWindow.getByText('Detalhes técnicos', { exact: true }).click();
    const overflow = await mobileWindow.locator('.rda-unkay-app-error').evaluate(el => el.scrollWidth > el.clientWidth);
    assert(!overflow, 'Error panel overflows on mobile');
    await capture('app-error-mobile.png');
    await mobileWindow.getByRole('button', { name: 'Tentar novamente' }).click();
    await page.waitForFunction(oldId => {
      const app = [...window.appManager.runningApps.values()].find(app => app.CORE.id === 'text-editor');
      return app && app.CORE.instanceId !== oldId && app.CORE.initialized && !app.CORE.launchFailed && !!app.CORE.appInstance?.appContentRoot;
    }, mobileId);
    await page.waitForFunction(() => !document.querySelector('.rda-unkay-app-error'));
    assert(cssAttempts >= 2, 'Retry did not fetch the resource again');
    await page.unroute('**/apps/text-editor/style.css');
    recovery = true;
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const kind of ['module', 'startup']) {
      const id = `recovery-${kind}`;
      let requests = 0;
      await page.route(`**/apps/${id}/main.js*`, route => {
        requests++;
        if (kind === 'module' && requests === 1) return route.fulfill({ status: 503, contentType: 'application/javascript', body: 'Temporary module failure' });
        const failsOnStart = kind === 'startup' && requests === 1;
        return route.fulfill({ contentType: 'application/javascript', body: `const BaseApp = Object.getPrototypeOf([...window.appManager.runningApps.values()].find(app => app.CORE.initialized && app.CORE.appInstance).CORE.appInstance.constructor); export default class Probe extends BaseApp { onRun() { if (${failsOnStart}) { this.setInterval(()=>{},1000); throw new Error('Startup probe'); } this.appContentRoot.textContent='Aplicativo recuperado'; } onCleanup() { window.__recoveryCleanups=(window.__recoveryCleanups||0)+1; } }` });
      });
      await page.evaluate(id => window.appManager.loadedAppDetails.set(id, { id, app_name: id, mode: 'system_window', jsFile: `/apps/${id}/main.js`, width: '600px', height: '520px', x_position: '10vw', y_position: '10vh' }), id);
      const failed = await page.evaluate(id => window.appManager.runApp(id), id);
      const target = page.locator(`.app[data-instance-id="${failed}"]`);
      await target.getByRole('button', { name: 'Tentar novamente' }).waitFor();
      const diagnostic = await page.evaluate(failed => {
        const app = window.appManager.runningApps.get(failed);
        return { code: app.UI.failure.code, initialized: app.CORE.initialized, timers: app.CORE.managedIntervals.size };
      }, failed);
      assert(diagnostic.code === (kind === 'module' ? 'APP_MODULE_LOAD_FAILED' : 'APP_START_FAILED') && !diagnostic.initialized && !diagnostic.timers, 'Failure stage or cleanup is incorrect: ' + JSON.stringify(diagnostic));
      await target.getByRole('button', { name: 'Tentar novamente' }).click();
      await page.waitForFunction(id => [...window.appManager.runningApps.values()].some(app => app.CORE.id === id && app.CORE.initialized && !app.CORE.launchFailed), id, { timeout: 5000 }).catch(async error => { console.error(await page.evaluate(id => [...window.appManager.runningApps.values()].filter(app => app.CORE.id === id).map(app => ({ id: app.CORE.instanceId, module: String(app.CORE.moduleError), start: String(app.UI.startError), failure: app.UI.failure, initialized: app.CORE.initialized, retry: app.CORE.reloadModule })), id)); throw error; });
      assert(requests === 2, 'Retry reused a rejected module instead of a fresh entry');
      const recovered = await page.evaluate(id => [...window.appManager.runningApps.keys()].find(key => window.appManager.runningApps.get(key).CORE.id === id), id);
      await page.evaluate(id => window.appManager.stopApp(id), recovered);
      await page.unroute(`**/apps/${id}/main.js*`);
      if (kind === 'module') moduleRecovery = true; else startupRecovery = true;
    }
  }
  assert(!errors.length, 'Unhandled browser errors: ' + errors.join('\n'));
  const report = { base, version: release.releases[0].version, release: release.releases[0].number, revision: build.revision, moduleType, initialized, openuiPreview: true, recovery, moduleRecovery, startupRecovery, errors };
  if (output) await writeFile(resolve(output, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
