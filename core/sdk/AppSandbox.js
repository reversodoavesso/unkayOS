// core/sdk/AppSandbox.js - Modern Shadow DOM Application Sandbox
// Eliminates insecure iframes and provides scoped SDK access based on declared permissions

import { unkay as baseUnkay } from './unkay.js';

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

        const appContainer = document.createElement('div');
        appContainer.className = 'app-container';
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
                    const fullPath = path.startsWith('/') ? path : `${appDataPrefix}/${path}`;
                    return base.fs.readFile(fullPath);
                },
                readText: async (path) => {
                    if (!perms.has('storage:local')) {
                        throw new Error(`Permissão 'storage:local' não concedida para '${pkg.name}'`);
                    }
                    const fullPath = path.startsWith('/') ? path : `${appDataPrefix}/${path}`;
                    return base.fs.readText(fullPath);
                },
                writeFile: async (path, content) => {
                    if (!perms.has('storage:local')) {
                        throw new Error(`Permissão 'storage:local' não concedida para '${pkg.name}'`);
                    }
                    const fullPath = path.startsWith('/') ? path : `${appDataPrefix}/${path}`;
                    return base.fs.writeFile(fullPath, content);
                },
                list: async (path = '') => {
                    if (!perms.has('storage:local')) {
                        throw new Error(`Permissão 'storage:local' não concedida para '${pkg.name}'`);
                    }
                    const fullPath = path ? (path.startsWith('/') ? path : `${appDataPrefix}/${path}`) : appDataPrefix;
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
                    <h2 style="margin: 0; font-size: 18px; color: var(--rda-color-primary-base, #06b6d4); font-family: var(--rda-font-family-display, 'Archivo', sans-serif);">✨ ${this.package.name}</h2>
                    <span class="badge" style="background: rgba(6, 182, 212, 0.15); color: var(--rda-color-primary-light, #22d3ee); border: 1px solid rgba(6, 182, 212, 0.3);">OpenUI Declarativo</span>
                </div>
                <p style="color: var(--rda-content-secondary, #a3a3a3); font-size: 13px; margin: 0;">${this.package.description}</p>
                <div id="openui-body" style="background: var(--rda-surface-secondary, #141414); border-radius: var(--rda-radius-lg, 8px); padding: var(--rda-spacing-md, 14px); border: 1px solid var(--rda-border-default, #262626);">
                    <div style="font-size: 13px; color: var(--rda-content-primary, #fafafa); line-height: 1.5;">
                        ${typeof spec === 'string' && spec.startsWith('<') ? spec : '<p>Ambiente renderizado com tokens do @reversodoavesso/design-system.</p>'}
                    </div>
                </div>
            </div>
        `;
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
