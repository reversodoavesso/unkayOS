import { chromium } from '@playwright/test';
import { createDeployment } from '../core/host/config/deployment.js';

const base = (process.argv.find(arg => arg.startsWith('--base='))?.slice(7) || 'http://127.0.0.1:5178').replace(/\/$/, '');
const browser = await chromium.launch({ headless: true });
const results = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function scenario(name, configure, check) {
    const context = await browser.newContext();
    context.setDefaultTimeout(15000);
    const errors = [];
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    try {
        await configure(context, page);
        await page.goto(base);
        await check(page);
        assert(errors.length === 0, `${name}: browser errors: ${errors.join('; ')}`);
        results.push({ name, passed: true });
        console.log(`Passed: ${name}`);
    } catch (error) {
        console.error(name, { errors, bootError: await page.locator('body').innerText().catch(() => '') });
        throw error;
    } finally { await context.close(); }
}

try {
    await scenario('portable-artifact', async (_context, page) => {
        const forbidden = [];
        page.on('request', request => {
            const url = new URL(request.url());
            if (/^\/(?:api|ws)(?:\/|$)/.test(url.pathname) || /^(?:id|auth)\.reversodoavesso\.com$/.test(url.hostname)) forbidden.push(url.origin + url.pathname);
        });
        page.forbiddenRequests = forbidden;
    }, async page => {
        await page.waitForFunction(() => window.workspaceSession);
        const state = await page.evaluate(async () => ({
            profile: window.unkayProfile.id,
            localRead: await window.unkay.access.can('files.local.read'),
            remoteCompute: await window.unkay.access.can('compute.session.create'),
            sync: await window.unkay.fs.syncCloud().then(() => 'unexpected-success', error => error.code),
            pluginIds: window.systemManager.kernel.describe().features.map(feature => feature.id)
        }));
        assert(state.profile === 'standalone' && state.localRead && !state.remoteCompute, 'Portable policy/profile mismatch');
        assert(state.sync === 'CAPABILITY_UNAVAILABLE', 'Portable sync must be unavailable');
        assert(state.pluginIds.includes('plugin-account'), 'Boot bypassed the plugin composer');
        assert(page.forbiddenRequests.length === 0, `Portable service requests: ${page.forbiddenRequests.join(', ')}`);
    });

    await scenario('injected-sso-own-branding', async context => {
        const config = JSON.parse(JSON.stringify(createDeployment('sso')));
        config.product = { name: 'Acme Desktop', orgName: 'Acme' };
        config.instances.policy = { plugin: 'unkayos.role-access', config: { tierRoles: { adept: ['company-editor'] } } };
        await context.route('**/config/deployment.json', route => route.fulfill({ json: config }));
        await context.addInitScript(() => {
            window.__UNKAY_IDENTITY_PROVIDER__ = () => ({
                getCurrentUser: () => ({ id: 'contract-acme', name: 'Acme Contract', roles: ['company-editor'] }), getAuthToken: () => null,
                login: async () => null, logout: async () => {}, destroy() {},
                on() {}, off() {},
                getAPI() { return { ...this, isAuthenticated: () => true, getUserPrompt: () => 'contract@acme' }; },
                getProviderInfo: () => ({ id: 'acme', label: 'Acme', providerName: 'Acme', mode: 'sso', supportsLogin: true, supportsLogout: true })
            });
        });
    }, async page => {
        await page.waitForFunction(() => window.workspaceSession);
        const state = await page.evaluate(() => ({ profile: window.unkayProfile.id, provider: window.authSystem.getProviderInfo().id, tier: window.unkay.auth.getTier() }));
        assert(state.profile === 'sso' && state.provider === 'acme' && state.tier === 'adept', 'Own identity/access policy was not selected from runtime JSON');
    });

    await scenario('rda-legacy-deployment', async context => {
        await context.route('**/config/deployment.json', route => route.fulfill({ status: 404, body: '' }));
        await context.route(`${base}/deployment.js`, route => route.fulfill({
            contentType: 'application/javascript',
            body: 'globalThis.__UNKAYOS_DEPLOYMENT__ = { branding: "rda", oidc: { clientId: "contract-client", projectId: "contract-project" } };'
        }));
    }, async page => {
        await page.waitForFunction(() => window.workspaceSession);
        const state = await page.evaluate(() => ({ profile: window.unkayProfile.id, provider: window.authSystem.getProviderInfo().id, packages: !!window.systemManager.getSystem('packageManager') }));
        assert(state.profile === 'rda' && state.provider === 'rda-zitadel' && state.packages, 'Legacy RDA deployment lost its composition');
    });

    await scenario('own-ai-with-local-identity', async context => {
        const config = JSON.parse(JSON.stringify(createDeployment('standalone')));
        config.instances.assistant = { plugin: 'unkayos.http-ai', config: { basePath: '/api/company-ai' } };
        config.bindings.ai = 'assistant.ai';
        await context.route('**/config/deployment.json', route => route.fulfill({ json: config }));
        await context.route('**/api/company-ai/chat', route => {
            assert(!route.request().headers().authorization, 'Own AI leaked an IdP bearer token');
            return route.fulfill({ json: { reply: 'Configured own AI' } });
        });
        await context.route('**/api/company-ai/chat/stream', route => route.fulfill({ contentType: 'text/plain; charset=utf-8', body: 'Own streamed answer' }));
    }, async page => {
        await page.waitForFunction(() => window.workspaceSession);
        const state = await page.evaluate(async () => {
            const chunks = [];
            await window.unkay.ai.stream([], chunk => chunks.push(chunk));
            return {
                profile: window.unkayProfile.id,
                capability: window.systemManager.hasCapability('ai'),
                reply: await window.unkay.ai.prompt([{ role: 'user', content: 'hi' }]),
                stream: chunks.join(''),
                openui: window.systemManager.getSystem('appFeatureRegistry').isAvailable('openui')
            };
        });
        assert(state.profile === 'standalone' && state.capability && state.openui, 'Own AI not available independently of SSO');
        assert(state.reply === 'Configured own AI' && state.stream === 'Own streamed answer', 'Own AI did not use the configured HTTP routes');
    });

    await scenario('gateway-session-remote-access-and-namespace', async context => {
        const config = JSON.parse(JSON.stringify(createDeployment('standalone')));
        config.installationId = 'gateway-e2e';
        config.instances.account = { plugin: 'unkayos.gateway-identity', config: { basePath: '', csrfHeader: 'x-unkay-csrf' } };
        config.instances.policy = { plugin: 'unkayos.gateway-access', config: { basePath: '', csrfHeader: 'x-unkay-csrf' } };
        config.instances.assistant = { plugin: 'unkayos.http-ai', config: { basePath: '/ai', csrfCookie: 'unkay_session_csrf', csrfHeader: 'x-unkay-csrf' } };
        config.bindings = { identity: 'account.identity', access: 'policy.access', ai: 'assistant.ai' };
        await context.route('**/config/deployment.json', route => route.fulfill({ json: config }));

        let authenticated = false;
        const installation = {
            installationId: 'gateway-e2e', revision: '1',
            identity: { mode: 'local', requiresLogin: false }, ai: { models: ['assistant'] }, access: { policyVersion: 'e2e-1' }
        };
        const principal = { id: 'bff-principal', name: 'Gateway E2E', issuer: 'local', groups: ['local'], mfa: false };
        const csrfCookie = 'unkay_session_csrf=csrf-browser; Path=/; SameSite=Lax';
        await context.route('**/session/login', route => {
            assert(route.request().method() === 'POST', 'Login deve ser POST');
            assert(route.request().headers()['x-unkay-csrf'] === 'csrf-browser', 'Login sem token CSRF');
            authenticated = true;
            return route.fulfill({
                json: { authenticated: true, principal, csrfToken: 'csrf-browser', installation },
                headers: { 'set-cookie': csrfCookie }
            });
        });
        await context.route('**/session', route => {
            if (route.request().method() === 'POST') {
                assert(route.request().headers()['x-unkay-csrf'] === 'csrf-browser', 'Login sem token CSRF');
                authenticated = true;
                return route.fulfill({
                    json: { authenticated: true, principal, csrfToken: 'csrf-browser', installation },
                    headers: { 'set-cookie': csrfCookie }
                });
            }
            return route.fulfill({
                json: {
                    authenticated, principal: authenticated ? principal : null, csrfToken: 'csrf-browser',
                    installation, ai: { models: ['assistant'] }, access: { policyVersion: 'e2e-1' }
                },
                headers: { 'set-cookie': csrfCookie }
            });
        });
        await context.route('**/access/evaluate', route => {
            assert(route.request().headers()['x-unkay-csrf'] === 'csrf-browser', 'Avaliação remota sem token CSRF');
            const { action } = JSON.parse(route.request().postData() || '{}');
            return route.fulfill({
                json: action.startsWith('files.')
                    ? { allowed: true, reason: 'ALLOW', policyVersion: 'e2e-1' }
                    : { allowed: false, reason: 'DEFAULT_DENY', policyVersion: 'e2e-1' }
            });
        });
        await context.route('**/ai/chat', route => {
            assert(!route.request().headers().authorization, 'IA própria expôs token do IdP');
            assert(route.request().headers()['x-unkay-csrf'] === 'csrf-browser', 'IA própria sem token CSRF');
            return route.fulfill({ json: { reply: 'Gateway E2E reply' } });
        });
    }, async page => {
        await page.waitForFunction(() => window.workspaceSession);
        const before = await page.evaluate(() => ({
            provider: window.authSystem.getProviderInfo().id,
            namespace: String(window.wasmFileSystem.namespace || '')
        }));
        assert(before.provider === 'gateway', 'BFF identity was not composed');
        assert(before.namespace.includes('/anonymous/'), 'Anonymous boot must use the anonymous namespace');

        await page.evaluate(() => window.authSystem.login());
        await page.waitForFunction(() => window.authSystem.getCurrentUser()?.name === 'Gateway E2E');
        await page.waitForFunction(() => String(window.wasmFileSystem.namespace || '').includes('/principal'));

        const state = await page.evaluate(async () => ({
            name: window.authSystem.getCurrentUser()?.name,
            token: window.authSystem.getAuthToken(),
            local: await window.unkay.access.can('files.local.read'),
            compute: await window.unkay.access.can('compute.session.create'),
            reply: await window.unkay.ai.prompt([{ role: 'user', content: 'oi' }]),
            namespace: String(window.wasmFileSystem.namespace || ''),
            persistedCredentials: Object.keys(localStorage).filter(key => /token|user_data/i.test(key))
        }));
        assert(state.name === 'Gateway E2E', 'BFF principal missing');
        assert(state.token === null, 'BFF identity must not expose provider tokens');
        assert(state.local === true && state.compute === false, 'Remote policy decision not applied');
        assert(state.reply === 'Gateway E2E reply', 'Own AI route not used');
        assert(state.namespace.includes('/principal'), 'Principal namespace not applied after login');
        assert(state.persistedCredentials.length === 0, `Credentials persisted in localStorage: ${state.persistedCredentials.join(',')}`);
    });

    await scenario('malformed-config-fails-closed', async context => {
        await context.route('**/config/deployment.json', route => route.fulfill({ contentType: 'text/html', body: '<html>SPA fallback</html>' }));
    }, async page => {
        await page.getByRole('heading', { name: 'Erro ao inicializar unkayOS' }).waitFor();
        assert(!await page.evaluate(() => window.workspaceSession), 'Invalid config still booted');
        assert(await page.getByText('A configuração da instalação deve ser JSON.').count() === 1, 'Config failure missing from UI');
    });
    console.log(JSON.stringify({ scenarios: results, note: 'SSO scenarios validate composition only; no real IdP login.' }, null, 2));
} finally { await browser.close(); }
