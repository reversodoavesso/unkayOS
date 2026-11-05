// server/tests/helpers.mjs
// Test client with a minimal cookie jar and an in-process gateway.

import { createServer } from 'node:http';
import { createGateway } from '../app.mjs';
import { parseAccessPolicy, parseServerConfig } from '../config.mjs';
import { createPolicy } from '../policy.mjs';

export class CookieJar {
    constructor() {
        /** @type {Map<string, string>} */
        this.cookies = new Map();
    }

    /** @param {string[]} setCookie */
    absorb(setCookie) {
        for (const header of setCookie || []) {
            const [pair] = header.split(';');
            const index = pair.indexOf('=');
            if (index < 1) continue;
            const name = pair.slice(0, index).trim();
            const value = pair.slice(index + 1).trim();
            if (value === '') this.cookies.delete(name);
            else this.cookies.set(name, value);
        }
    }

    header() {
        return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    }

    get(name) {
        return this.cookies.get(name);
    }
}

export function baseServerConfig(overrides = {}) {
    return {
        schemaVersion: 1,
        installationId: 'test-install',
        revision: 'r1',
        identity: { mode: 'local' },
        session: {
            cookieName: 'unkay_session',
            cookieSecure: true,
            idleTimeoutSeconds: 600,
            absoluteTimeoutSeconds: 3600
        },
        accessPolicy: { file: 'policy.json' },
        ...overrides
    };
}

export function basePolicy(overrides = {}) {
    return {
        schemaVersion: 1,
        policyVersion: 'test-1',
        rules: [
            { id: 'local-device', effect: 'allow', actions: ['files.local.*'], groups: ['local'] },
            { id: 'local-ai', effect: 'allow', actions: ['ai.chat'], groups: ['local'] }
        ],
        ...overrides
    };
}

/**
 * @param {{ config?: any, policy?: any, secrets?: any, fetchImpl?: any, now?: () => number }} [options]
 */
export async function startGateway(options = {}) {
    const config = parseServerConfig(options.config || baseServerConfig());
    const policyDocument = options.policy || basePolicy();
    const policy = createPolicy(parseAccessPolicy(policyDocument));
    const gateway = createGateway({
        config,
        policy,
        secrets: options.secrets || { oidcClientSecret: 'test-secret', upstreamKeys: { primary: 'test-key' } },
        fetchImpl: options.fetchImpl,
        now: options.now,
        staticRoot: options.staticRoot || null
    });
    const server = createServer(gateway.handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
    const origin = `http://127.0.0.1:${port}`;
    const jar = new CookieJar();

    /**
     * @param {string} path
     * @param {{ method?: string, body?: any, headers?: Record<string, string>, jar?: CookieJar, cookies?: boolean }} [init]
     */
    async function request(path, init = {}) {
        const activeJar = init.jar || jar;
        const headers = { ...(init.headers || {}) };
        if (init.cookies !== false) headers.cookie = activeJar.header();
        let body;
        if (init.body !== undefined) {
            body = JSON.stringify(init.body);
            headers['content-type'] = 'application/json';
        }
        const response = await fetch(`${origin}${path}`, {
            method: init.method || 'GET', headers, body, redirect: 'manual'
        });
        const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
        if (init.cookies !== false) activeJar.absorb(setCookie);
        const text = await response.text();
        let json = null;
        try {
            json = JSON.parse(text);
        } catch {
            json = null;
        }
        return { status: response.status, headers: response.headers, text, json, setCookie };
    }

    return {
        config,
        policy,
        gateway,
        origin,
        jar,
        request,
        openJar: () => new CookieJar(),
        async close() {
            gateway.close();
            server.closeAllConnections?.();
            await new Promise(resolve => server.close(resolve));
        }
    };
}

/**
 * Minimal AI upstream. Records requests and supports streamed SSE replies.
 * @param {(request: any, response: import('node:http').ServerResponse) => any} handler
 */
export async function startUpstream(handler) {
    const server = createServer(async (request, response) => {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        let body = null;
        try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
            body = null;
        }
        await handler({ request, response, body }, response);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
    return {
        url: `http://127.0.0.1:${port}`,
        async close() {
            server.closeAllConnections?.();
            await new Promise(resolve => server.close(resolve));
        }
    };
}

/** Local AI configuration pointing at a test upstream. */
export function aiConfig(upstreamUrl, overrides = {}) {
    return {
        basePath: '/ai',
        timeoutMs: 2000,
        defaultModel: 'assistant',
        models: {
            assistant: { upstream: 'primary', model: 'test-model' }
        },
        upstreams: {
            primary: { baseUrl: upstreamUrl, apiKeyRef: 'AI_KEY', protocol: 'openai-chat' }
        },
        ...overrides
    };
}

/** Wait for the client to disconnect without keeping the event loop alive. */
export function holdUntilClosed(response) {
    return new Promise(resolve => {
        const timer = setTimeout(resolve, 5000);
        timer.unref?.();
        response.on('close', () => {
            clearTimeout(timer);
            resolve(undefined);
        });
    });
}

/** Log in a local session and return its CSRF token. */
export async function loginLocal(gateway) {
    const session = await gateway.request('/session');
    const csrf = session.json.csrfToken;
    const login = await gateway.request('/session/login', {
        method: 'POST',
        body: {},
        headers: { 'x-unkay-csrf': csrf }
    });
    return { csrf: login.json.csrfToken, login };
}
