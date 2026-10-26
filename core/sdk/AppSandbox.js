// core/sdk/AppSandbox.js - Modern Shadow DOM Application Sandbox
// Isolates styles and scopes SDK access. Native JS runs as trusted page code;
// declarative OpenUI HTML is sanitized before rendering.

import { unkay as baseUnkay } from './unkay.js';
import DOMPurify from '../vendor/purify.es.mjs';

export class AppSandbox {
    /**
     * @param {HTMLElement} hostElement - The window content container
     * @param {object} appPackage - The normalized package from AppPackageLoader
     * @param {object} baseSDK - Base unkay SDK instance
     */
    constructor(hostElement, appPackage, baseSDK = baseUnkay) {
        this.hostElement = hostElement;
        this.package = appPackage;
        this.baseSDK = baseSDK;
        this.shadowRoot = null;
        this.scopedSDK = null;
        this.isRunning = false;
        this.cleanupCallbacks = [];
    }

    /**
     * Initialize Shadow DOM container and scoped SDK
     */
    mount() {
        if (this.isRunning) return;

        // 1. Create Shadow Root for DOM and Style isolation (No iframe!)
        if (!this.hostElement.shadowRoot) {
            this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });
        } else {
            this.shadowRoot = this.hostElement.shadowRoot;
            this.shadowRoot.innerHTML = '';
        }

        // 2. Inject RDA Design System Base CSS Tokens into Shadow Root
        const style = document.createElement('style');
        style.textContent = `
            :host {
                display: block;
                width: 100%;
                height: 100%;
                overflow: auto;
                box-sizing: border-box;
                font-family: var(--rda-font-family-base, 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
                color: var(--rda-content-primary, #fafafa);
                background: var(--rda-surface-primary, #0a0a0a);
            }
            .app-container {
                padding: var(--rda-spacing-md, 16px);
                min-height: 100%;
                box-sizing: border-box;
            }
            button {
                cursor: pointer;
                border-radius: var(--rda-radius-md, 6px);
                border: 1px solid var(--rda-border-default, #262626);
                background: var(--rda-surface-tertiary, #262626);
                color: var(--rda-content-primary, #fafafa);
                padding: 8px 14px;
                font-size: 14px;
                font-family: inherit;
                transition: background 0.15s ease, border-color 0.15s ease;
            }
            button:hover {
                background: var(--rda-surface-elevated, #333333);
                border-color: var(--rda-border-subtle, #404040);
            }
            .badge {
                display: inline-block;
                padding: 2px 8px;
                border-radius: var(--rda-radius-full, 9999px);
                font-size: 11px;
                font-weight: 600;
            }
        `;
        this.shadowRoot.appendChild(style);
        for (const file of ['design-system.css', 'unkayos.css']) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = '/design-system/rda/' + file;
            this.shadowRoot.appendChild(link);
        }

        const appContainer = document.createElement('div');
        appContainer.className = 'app-container';
        appContainer.dataset.rdaProduct = 'base';
        this.shadowRoot.appendChild(appContainer);

        // 3. Build Scoped SDK with Permission Guards
        this.scopedSDK = this.buildScopedSDK();
        this.isRunning = true;
    }

    /**
     * Creates a scoped SDK that enforces the package's declared permissions
     */
    buildScopedSDK() {
        const pkg = this.package;
        const perms = new Set(pkg.permissions || []);
        const base = this.baseSDK;
        const appDataPrefix = `/home/user/apps/${pkg.id}/data`;
        if (!/^[a-z0-9][a-z0-9_-]*$/i.test(pkg.id)) throw new Error('Invalid application ID');
        const scopedPath = (path = '') => {
            if (typeof path !== 'string' || path.includes('\\')) throw new Error('Invalid storage path');
            const full = path.startsWith('/') ? path : `${appDataPrefix}/${path}`;
            const parts = [];
            for (const part of full.split('/')) {
                if (part === '..') parts.pop();
                else if (part && part !== '.') parts.push(part);
            }
            const normalized = '/' + parts.join('/');
            if (normalized !== appDataPrefix && !normalized.startsWith(appDataPrefix + '/')) throw new Error('Storage path outside application data');
            return normalized;
        };

        return {
            manifest: pkg,
            // Auth scoped to permissions
            auth: {
                getTier: () => {
                    if (!perms.has('auth:session')) return 'guest';
                    return base.auth?.getTier?.() || 'guest';
                },
                getUser: () => {
                    if (!perms.has('auth:session')) return null;
                    return base.auth?.getUser?.() || null;
                },
                getToken: () => {
                    if (!perms.has('auth:session')) return null;
                    return base.auth?.getToken?.() || null;
                },
            },
            // VFS scoped to app's dedicated data directory
            fs: {
                readFile: async (path) => {
                    if (!perms.has('storage:local')) {
                        throw new Error(`Permissão 'storage:local' não concedida para '${pkg.name}'`);
                    }
                    const fullPath = scopedPath(path);
                    return base.fs.readFile(fullPath);
                },
                readText: async (path) => {
                    if (!perms.has('storage:local')) {
                        throw new Error(`Permissão 'storage:local' não concedida para '${pkg.name}'`);
                    }
                    const fullPath = scopedPath(path);
                    return base.fs.readText(fullPath);
                },
                writeFile: async (path, content) => {
                    if (!perms.has('storage:local')) {
                        throw new Error(`Permissão 'storage:local' não concedida para '${pkg.name}'`);
                    }
                    const fullPath = scopedPath(path);
                    return base.fs.writeFile(fullPath, content);
                },
                list: async (path = '') => {
                    if (!perms.has('storage:local')) {
                        throw new Error(`Permissão 'storage:local' não concedida para '${pkg.name}'`);
                    }
                    const fullPath = scopedPath(path);
                    return base.fs.list(fullPath);
                }
            },
            // Key-Value local storage isolated by app ID
            kv: {
                get: async (key) => base.kv?.get?.(`${pkg.id}:${key}`),
                set: async (key, val) => base.kv?.set?.(`${pkg.id}:${key}`, val),
            },
            // Generative AI scoped to permission
            ai: {
                prompt: async (messages) => {
                    if (!perms.has('ai:generate')) {
                        throw new Error(`Permissão 'ai:generate' não concedida para '${pkg.name}'`);
                    }
                    return base.ai?.prompt?.(messages);
                }
            },
            // Window controls
            window: {
                setTitle: (title) => base.window?.setTitle?.(`[${pkg.name}] ${title}`),
                close: () => base.window?.close?.(),
            }
        };
    }

    /**
     * Executes application code or renders OpenUI specification
     * @param {string|Function} entryCode - Code or runner function
     */
    async run(entryCode) {
        if (!this.isRunning) this.mount();

        const container = this.shadowRoot.querySelector('.app-container');

        if (this.package.type === 'openui') {
            // Render declarative OpenUI definition
            this.renderOpenUI(container, entryCode);
            return;
        }

        if (typeof entryCode === 'function') {
            const cleanup = entryCode(container, this.scopedSDK);
            if (typeof cleanup === 'function') {
                this.cleanupCallbacks.push(cleanup);
            }
        } else if (typeof entryCode === 'string') {
            // Run native code inside an isolated function scope passing scopedSDK
            const runner = new Function('container', 'unkay', `"use strict";\n${entryCode}`);
            const cleanup = runner(container, this.scopedSDK);
            if (typeof cleanup === 'function') {
                this.cleanupCallbacks.push(cleanup);
            }
        }
    }

    /**
     * Renders declarative Generative UI elements (type: "openui")
     */
    renderOpenUI(container, spec) {
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: var(--rda-spacing-md, 12px);">
                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--rda-border-default, #262626); padding-bottom: 8px;">
                    <h2 style="margin: 0; font-size: 18px; color: var(--rda-content-brand); font-family: var(--rda-font-family-heading, 'Archivo', sans-serif);"></h2>
                    <span class="badge" style="background: rgba(6, 182, 212, 0.15); color: var(--rda-content-brand); border: 1px solid rgba(6, 182, 212, 0.3);">OpenUI Declarativo</span>
                </div>
                <p class="openui-description" style="color: var(--rda-content-secondary, #a3a3a3); font-size: 13px; margin: 0;"></p>
                <div id="openui-body" style="background: var(--rda-surface-secondary, #141414); border-radius: var(--rda-radius-lg, 8px); padding: var(--rda-spacing-md, 14px); border: 1px solid var(--rda-border-default, #262626);">
                    <div style="font-size: 13px; color: var(--rda-content-primary, #fafafa); line-height: 1.5;">
                    </div>
                </div>
            </div>
        `;
        container.querySelector('h2').textContent = this.package.name || 'OpenUI';
        container.querySelector('.openui-description').textContent = this.package.description || '';
        container.querySelector('#openui-body > div').innerHTML = DOMPurify.sanitize(typeof spec === 'string' ? spec : '', {
            USE_PROFILES: { html: true },
            FORBID_TAGS: ['style', 'link', 'iframe', 'object', 'embed', 'form'],
            FORBID_ATTR: ['srcdoc'],
            CUSTOM_ELEMENT_HANDLING: { tagNameCheck: /^rda-icon$/, attributeNameCheck: /^(name|size|label)$/ }
        });
    }

    /**
     * Dismantles the sandbox, cleans up listeners, and frees resources
     */
    unmount() {
        for (const cleanup of this.cleanupCallbacks) {
            try {
                cleanup();
            } catch (err) {
                console.error('[AppSandbox] Error during cleanup:', err);
            }
        }
        this.cleanupCallbacks = [];

        if (this.shadowRoot) {
            this.shadowRoot.innerHTML = '';
        }
        this.isRunning = false;
        this.scopedSDK = null;
    }
}
