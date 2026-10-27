import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const value = name => process.argv.find(arg => arg.startsWith(name + '='))?.slice(name.length + 1);
const base = value('--base') || 'http://127.0.0.1:5178';
const output = resolve(value('--output') || 'browser-proof/store');
const remoteId = value('--install-id');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir(output, { recursive: true });
const ready = async () => {
    await page.waitForFunction(() => window.workspaceSession && window.systemManager?.getSystem('packageManager'));
    if (await page.locator('.workspace-setup[open]').count()) await page.locator('[data-setup="skip"]').click();
};
const startStore = async () => {
    const id = await page.evaluate(() => window.appManager.runApp('store'));
    assert(id, 'Store did not launch');
    const root = page.locator(`.app[data-instance-id="${id}"] .store-app`);
    await root.locator('#appsGrid[aria-busy="false"]').waitFor({ state: 'attached' });
    return { id, root };
};
try {
    await page.goto(base); await ready();
    const api = await page.request.get(base + '/api/marketplace/apps');
    assert(api.ok() && (await api.json()).success, 'Marketplace proxy/API unavailable');
    let store = await startStore();
    assert(await store.root.locator('.app-card[data-app-id="openui"]').count() === 1, 'Bundled Studio is duplicated');
    await page.locator(`.app[data-instance-id="${store.id}"]`).getByRole('button', { name: 'Maximizar/Restaurar', exact: true }).click();
    const maximizedLayout = await store.root.evaluate(element => {
        const width = node => Math.round(node.getBoundingClientRect().width);
        return { storeWidth: width(element), contentWidth: width(element.parentElement),
            headerWidth: width(element.querySelector('.store-header')),
            columns: getComputedStyle(element.querySelector('.apps-grid')).gridTemplateColumns.split(/\s+/).length };
    });
    assert(Math.abs(maximizedLayout.storeWidth - maximizedLayout.contentWidth) <= 2 &&
        Math.abs(maximizedLayout.headerWidth - maximizedLayout.storeWidth) <= 2 && maximizedLayout.columns >= 3,
        'Maximized Store does not fill its window: ' + JSON.stringify(maximizedLayout));
    await page.screenshot({ path: resolve(output, 'store-dark.png') });
    await store.root.locator('[data-view="blocked"]').click();
    const blocked = store.root.locator('.app-card').first();
    assert(await blocked.locator('[data-action="blocked"]').isDisabled(), 'Unavailable app can be installed');
    await blocked.locator('[data-action="details"]').first().click();
    assert(await store.root.locator('.detail-warning li').count() > 0, 'Restriction reasons are missing');
    await page.keyboard.press('Escape');
    assert(await store.root.locator('#appDetailModal').isHidden(), 'Escape does not close details');
    await store.root.locator('[data-view="all"]').click();

    if (remoteId) {
        const card = store.root.locator(`.app-card[data-app-id="${remoteId}"]`);
        await card.locator('[data-action="install"]').click();
        await page.waitForFunction(id => window.unkay.packages.status(id).canOpen, remoteId);
        assert(await page.evaluate(id => window.unkay.packages.status(id).installedVersion, remoteId), 'API installation has no version');
    }

    const localId = 'store-browser-test';
    const pkg = { format: 'unkayapp-v1', manifest: { id: localId, name: 'Caderno de teste', version: '1.0.0', type: 'openui',
        runtime_profile: 'client-only', required_tier: 'guest', category: 'productivity', permissions: ['storage:local'], description: 'Interface instalada para validação.' },
        files: { 'spec.openui': '<h3>Caderno restaurado</h3><p>Meu conteúdo local</p><script>throw new Error("unsafe")</script><img src=x onerror="alert(1)">' } };
    await page.locator('.taskbar__start_menu').click();
    const launcher = page.locator('#menu_apps');
    await launcher.locator('[data-category="create"]').click();
    await launcher.locator('input[type="search"]').fill('caderno');
    await store.root.locator('#importPackage').setInputFiles({ name: 'caderno.unkayapp', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pkg)) });
    await page.waitForFunction(id => window.unkay.packages.status(id).canOpen, localId);
    await launcher.locator(`[data-app="${localId}"]`).waitFor();
    assert(await launcher.locator('input[type="search"]').inputValue() === 'caderno', 'Package change cleared launcher search');
    await launcher.locator(`[data-pin="${localId}"]`).click();
    await page.locator(`.taskbar__pinned [data-app-id="${localId}"]`).waitFor();
    await launcher.locator('[data-launcher-action="close"]').click();
    await page.evaluate(async id => { await window.unkay.fs.writeFile(`/home/user/apps/${id}/data/note.txt`, 'Dados preservados'); await window.unkay.fs.flush(); }, localId);
    await store.root.locator('#storeSearchInput').fill('caderno de teste');
    await store.root.locator(`[data-action="open"][data-app-id="${localId}"]`).click();
    await page.waitForFunction(id => [...window.appManager.runningApps.values()].some(app => app.CORE.id === id && app.CORE.initialized), localId);
    const packageState = await page.evaluate(id => {
        const app = [...window.appManager.runningApps.values()].find(app => app.CORE.id === id);
        const root = app.CORE.appInstance.sandbox.shadowRoot;
        return { text: root.textContent, unsafe: !!root.querySelector('script, [onerror]'), instanceId: app.CORE.instanceId };
    }, localId);
    assert(packageState.text.includes('Caderno restaurado') && !packageState.unsafe, 'Installed app was not safely rendered');
    await page.screenshot({ path: resolve(output, 'installed-app.png') });
    await page.evaluate(id => window.appManager.stopApp(id), packageState.instanceId);
    await page.reload(); await ready();
    assert(await page.evaluate(id => window.unkay.packages.status(id).canOpen, localId), 'Installation did not survive a reload');
    await page.locator(`.taskbar__pinned [data-app-id="${localId}"]`).waitFor();
    store = await startStore();
    await store.root.locator('#storeSearchInput').fill('caderno de teste');
    await store.root.locator('[data-action="details"]').first().click();
    await store.root.locator('[data-action="uninstall"]').click();
    await store.root.locator('[data-action="confirm-remove"]').click();
    await page.waitForFunction(id => !window.unkay.packages.status(id).installed, localId);
    assert(await page.evaluate(id => window.unkay.fs.readText(`/home/user/apps/${id}/data/note.txt`), localId) === 'Dados preservados', 'Uninstall erased personal data');
    assert(!await page.evaluate(id => window.loadedAppDetails.has(id), localId), 'Uninstalled app is still registered');
    assert(await page.locator(`.taskbar__pinned [data-app-id="${localId}"]`).count() === 0, 'Removed package is still pinned visibly');
    await page.locator('.taskbar__start_menu').click();
    assert(await launcher.locator(`[data-app="${localId}"]`).count() === 0, 'Removed package is still in the launcher');
    await launcher.locator('[data-launcher-action="close"]').click();
    await store.root.locator('#storeSearchInput').fill('');
    await page.evaluate(() => window.workspaceSession.update({ appearance: { theme: 'light' } }));
    await page.waitForTimeout(250); // allow the theme transition to finish before capture
    await page.screenshot({ path: resolve(output, 'store-light.png') });
    await page.evaluate(id => window.appManager.stopApp(id), store.id);
    await page.setViewportSize({ width: 390, height: 844 });
    store = await startStore();
    const overflow = await store.root.evaluate(element => ({ root: element.scrollWidth > element.clientWidth, content: element.querySelector('.store-content').scrollWidth > element.querySelector('.store-content').clientWidth }));
    assert(!overflow.root && !overflow.content, 'Store overflows a narrow window');
    await page.screenshot({ path: resolve(output, 'store-mobile.png') });
    await store.root.locator('[data-action="details"]').first().click();
    await page.screenshot({ path: resolve(output, 'store-mobile-details.png') });
    assert(!errors.length, 'Unhandled browser errors: ' + errors.join('; '));
    const report = { api: true, remoteInstall: remoteId || null, localImport: true, sanitized: true, restoredAfterReload: true,
        uninstallPreservesData: true, liveLauncherCategories: true, livePins: true, restoredPins: true, removedFromMenus: true, maximizedLayout, narrowOverflow: overflow, errors };
    await writeFile(resolve(output, 'validation.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
} finally { await browser.close(); }
