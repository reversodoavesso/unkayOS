import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const args = process.argv.slice(2);
const value = name => args.find(arg => arg.startsWith(name + '='))?.slice(name.length + 1);
const base = (value('--base') || 'http://127.0.0.1:5178').replace(/\/$/, '');
const output = value('--output');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const check = (condition, message) => { if (!condition) throw new Error(message); };
const capture = async name => { if (output) await page.screenshot({ path: resolve(output, name) }); };
try {
  if (output) await mkdir(output, { recursive: true });
  await page.addInitScript(() => {
    window.__wallpaperFrames = [];
    const tick = () => { const el = document.getElementById('desktop'); if (el && window.__wallpaperFrames.length < 30) window.__wallpaperFrames.push({ cached: el.style.backgroundImage.includes('data:image/'), accent: el.dataset.unkayAccent }); if (window.__wallpaperFrames.length < 30) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await page.goto(base); await page.waitForFunction(() => window.workspaceSession);
  if (await page.locator('.workspace-setup[open]').count()) await page.locator('[data-setup="skip"]').click();
  const images = await page.evaluate(async () => {
    const { WALLPAPERS } = await import('/core/workspace/preferences.js');
    return WALLPAPERS.filter(wallpaper => wallpaper.value.startsWith('/assets/images/wallpapers/')).map(wallpaper => wallpaper.value);
  });
  check(images.length === 7, 'Wallpaper collection incomplete');
  const timings = [];
  for (const wallpaper of images) {
    const start = Date.now();
    await page.evaluate(wallpaper => window.workspaceSession.update({ appearance: { wallpaper, theme: 'dark', accent: 'violet', adaptWallpaper: true, wallpaperRemapPresetMode: 'auto' } }), wallpaper);
    await page.waitForFunction(wallpaper => {
      const cached = JSON.parse(localStorage.getItem('unkayos_remapped_wallpaper_cache') || 'null');
      return cached?.wallpaper === wallpaper && cached.accent === 'violet' && document.getElementById('desktop').style.backgroundImage.includes(cached.dataUrl);
    }, wallpaper);
    timings.push(Date.now() - start);
  }
  await capture('wallpaper-desktop.png');
  let releaseMain;
  const gate = new Promise(resolve => { releaseMain = resolve; });
  const main = /\/main\.js(?:\?|$)/;
  await page.route(main, async route => { await gate; await route.continue(); });
  await page.reload({ waitUntil: 'commit' });
  await page.waitForFunction(() => window.__wallpaperFrames.length >= 3);
  const early = await page.evaluate(() => window.__wallpaperFrames);
  check(early.every(frame => frame.cached && frame.accent === 'violet'), 'Selected remapped wallpaper not restored before initialization');
  releaseMain(); await page.waitForFunction(() => window.workspaceSession); await page.unroute(main);
  const settingsId = await page.evaluate(() => window.appManager.runApp('settings', { panel: 'appearance' }));
  await page.locator('#panelAppearance').waitFor({ state: 'visible' });
  await page.locator('#oklabAdvancedMenu summary').click();
  await capture('wallpaper-settings.png');
  // Real VFS binary input and the original/adapted confirmation flow.
  await page.evaluate(async wallpaper => {
    const bytes = new Uint8Array(await (await fetch(wallpaper)).arrayBuffer());
    await window.wasmFileSystem.mkdir('/home/user/pictures', { recursive: true });
    await window.wasmFileSystem.writeFile('/home/user/pictures/review.jpg', bytes);
    await window.wasmFileSystem.flush();
  }, images[0]);
  await page.locator('#customWallpaperUrl').fill('/home/user/pictures/review.jpg');
  await page.locator('#applyCustomWallpaperBtn').click();
  await page.locator('#wallpaperRemapPrompt').waitFor({ state: 'visible' });
  await page.locator('#confirmOriginalWallpaperBtn').click();
  await page.waitForFunction(() => window.workspaceSession.settings.appearance.wallpaper.startsWith('data:image/jpeg') && window.workspaceSession.settings.appearance.adaptWallpaper === false);
  const file = await (await page.request.get(base + images[1])).body();
  await page.locator('#uploadCustomWallpaperInput').setInputFiles({ name: 'review.jpg', mimeType: 'image/jpeg', buffer: file });
  await page.locator('#wallpaperRemapPrompt').waitFor({ state: 'visible' });
  await capture('wallpaper-comparison.png');
  await page.locator('#confirmOriginalWallpaperBtn').click();
  await page.evaluate(id => window.appManager.stopApp(id), settingsId);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.appManager.runApp('settings', { panel: 'appearance' }));
  await page.locator('#oklabAdvancedMenu summary').click();
  const windowBounds = await page.locator('.app').last().boundingBox();
  check(windowBounds.x >= 0 && windowBounds.x + windowBounds.width <= 391, 'Settings window falls outside the mobile viewport: ' + JSON.stringify(windowBounds));
  const overflow = await page.locator('#panelAppearance').evaluate(el => el.scrollWidth > el.clientWidth);
  check(!overflow, 'Appearance panel overflows on mobile');
  await capture('wallpaper-mobile.png');
  check(!errors.length, errors.join('\n'));
  const build = await (await page.request.get(base + '/build-info.json')).json();
  const report = { base, revision: build.revision, images: images.length, renderTimesMs: timings, cachedBeforeMain: true, binaryVfsImage: true, upload: true, mobileOverflow: overflow, errors };
  if (output) await writeFile(resolve(output, 'wallpaper-validation.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
