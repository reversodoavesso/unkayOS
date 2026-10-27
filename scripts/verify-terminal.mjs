import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const value = name => process.argv.find(arg => arg.startsWith(name + '='))?.slice(name.length + 1);
const base = value('--base') || 'http://127.0.0.1:5178';
const output = resolve(value('--output') || 'browser-proof/terminal');
const assert = (condition, message) => { if (!condition) throw Error(message); };
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const command = (id, line) => page.evaluate(async ({ id, line }) => {
    await window.appManager.runningApps.get(id).CORE.appInstance.processCommand(line);
}, { id, line });
try {
    await mkdir(output, { recursive: true }); await page.goto(base);
    await page.waitForFunction(() => window.workspaceSession);
    if (await page.locator('.workspace-setup[open]').count()) await page.locator('[data-setup="skip"]').click();
    const a = await page.evaluate(() => window.appManager.runApp('terminal'));
    const b = await page.evaluate(() => window.appManager.runApp('terminal'));
    const root = id => page.locator(`.app[data-instance-id="${id}"]`);
    assert(a && b && a !== b, 'Two terminal instances did not initialize');
    await command(a, 'mkdir /tmp/terminal-a'); await command(b, 'mkdir /tmp/terminal-b');
    await command(a, 'cd /tmp/terminal-a'); await command(b, 'cd /tmp/terminal-b');
    await command(a, 'touch "my note.txt"'); await command(b, 'touch "other note.txt"');
    const state = await page.evaluate(([a, b]) => {
        const first = window.appManager.runningApps.get(a).CORE.appInstance, second = window.appManager.runningApps.get(b).CORE.appInstance;
        return { directories: [first.fs.pwd(), second.fs.pwd()], shared: first.fs.exists('/tmp/terminal-b/other note.txt'), own: first.fs.exists('my note.txt'), separateBridges: first.computeBridge !== second.computeBridge };
    }, [a, b]);
    assert(state.directories[0] === '/tmp/terminal-a' && state.directories[1] === '/tmp/terminal-b' && state.shared && state.own && state.separateBridges, 'Terminal windows share mutable session state: ' + JSON.stringify(state));
    await root(b).locator('#terminalMode').selectOption('compute');
    await page.waitForFunction(id => !window.appManager.runningApps.get(id).CORE.appInstance.commandBusy, b);
    assert((await root(b).locator('#terminalOutput').textContent()).includes('Acesso negado'), 'Guest Compute access was not explained');
    assert(await root(b).locator('#terminalMode').inputValue() === 'local', 'Denied Compute remained selected');
    await root(b).locator('#terminalInput').fill('mode'); await root(b).locator('#terminalInput').press('Enter');
    await root(b).locator('#terminalOutput').getByText(/WASI: wasi/).waitFor();
    await command(a, 'echo "<img src=x onerror=window.__terminalUnsafe=1>"');
    await page.evaluate(id => window.appManager.runningApps.get(id).CORE.appInstance.writeLine('<script>window.__terminalUnsafe=1</script><span onclick="window.__terminalUnsafe=1">safe output</span>'), a);
    assert(await root(a).locator('#terminalOutput script,#terminalOutput img,#terminalOutput [onclick],#terminalOutput [onerror]').count() === 0, 'Terminal rendered executable markup');
    assert(!await page.evaluate(() => window.__terminalUnsafe), 'Terminal executed untrusted output');
    const promptStyle = await root(b).locator('#terminalPrompt').evaluate(el => getComputedStyle(el).whiteSpace);
    assert(promptStyle === 'nowrap', 'Terminal prompt can wrap across lines');
    await page.screenshot({ path: resolve(output, 'independent-terminal-modes.png') });
    await page.evaluate(id => window.appManager.stopApp(id), a);
    await command(b, 'pwd');
    assert((await root(b).locator('#terminalOutput').textContent()).includes('/tmp/terminal-b'), 'Closing one terminal affected the other');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(id => window.appManager.stopApp(id), b);
    const narrow = await page.evaluate(() => window.appManager.runApp('terminal'));
    const overflow = await root(narrow).locator('#terminal-app').evaluate(el => el.scrollWidth > el.clientWidth);
    assert(!overflow, 'Terminal mode controls overflow on mobile');
    await page.screenshot({ path: resolve(output, 'terminal-mobile.png') });
    assert(!errors.length, 'Unhandled browser errors: ' + errors.join('; '));
    const report = { status: 'passed', independentDirectories: true, independentComputeBridges: true, quotedPaths: true,
        guestComputeDenied: true, localWasiModeExplained: true, outputSanitized: true, independentCleanup: true, mobileOverflow: overflow, errors };
    await writeFile(resolve(output, 'validation.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally { await browser.close(); }
