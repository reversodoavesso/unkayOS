// core/sdk/unkay.js - unkayOS 2.0 Unified SDK
// Standard application interface inspired by puter.js and customized for RDA ecosystem

import { wasmFileSystem } from '../WasmFileSystem.js';
import { fullscreenManager } from '../FullscreenManager.js';
import { contextMenuManager } from '../ContextMenuManager.js';
import { keyboardManager } from '../KeyboardManager.js';

export function createUnkaySDK(appCore = null, systemManager = null) {
    const getAuth = () => systemManager?.getSystem('authSystem') || (typeof window !== 'undefined' ? window.authSystem : null);
    const getVfs = () => (typeof window !== 'undefined' && window.wasmFileSystem) || wasmFileSystem;
    const getFullscreen = () => systemManager?.getSystem('fullscreenManager') || (typeof window !== 'undefined' && window.fullscreenManager) || fullscreenManager;
    const getContextMenu = () => systemManager?.getSystem('contextMenuManager') || (typeof window !== 'undefined' && window.contextMenuManager) || contextMenuManager;
    const getKeyboard = () => systemManager?.getSystem('keyboardManager') || (typeof window !== 'undefined' && window.keyboardManager) || keyboardManager;

    return {
        auth: {
            getUser() {
                const authSystem = getAuth();
                return authSystem?.getCurrentUser?.() || null;
            },
            getToken() {
                const authSystem = getAuth();
                return authSystem?.getAuthToken?.() || null;
            },
            getTier() {
                const authSystem = getAuth();
                const user = authSystem?.getCurrentUser?.();
                if (!user) return 'guest';
                const claims = user.roles || user['urn:zitadel:iam:org:project:roles'] || [];
                const roles = Array.isArray(claims) ? claims : Object.keys(claims);
                if (roles.includes('demiurge')) return 'demiurge';
                if (roles.includes('sysadmin') || roles.includes('architect')) return 'sysadmin';
                if (roles.includes('standard') || roles.includes('initiate')) return 'standard';
                return 'standard';
            },
            async login() {
                const authSystem = getAuth();
                if (authSystem?.login) {
                    return authSystem.login();
                }
                console.warn('[UnkaySDK] AuthSystem login not available');
            },
            async logout() {
                const authSystem = getAuth();
                if (authSystem?.logout) {
                    return authSystem.logout();
                }
            }
        },

        fs: {
            async readFile(path) {
                return getVfs().readFile(path, { encoding: 'binary' });
            },
            async readText(path) {
                return getVfs().readFile(path, { encoding: 'utf8' });
            },
            async writeFile(path, content) {
                return getVfs().writeFile(path, content);
            },
            async list(path) {
                return getVfs().readdir(path);
            },
            async stat(path) {
                return getVfs().stat(path);
            },
            async exists(path) {
                return getVfs().exists(path);
            },
            async mkdir(path, recursive = true) {
                return getVfs().mkdir(path, { recursive });
            },
            async remove(path, recursive = false) {
                return getVfs().remove(path, { recursive });
            },
            async syncCloud() {
                const { minioSyncDriver } = await import('../sync/MinioSyncDriver.js');
                return minioSyncDriver.sync();
            },
            // File System Access API - mount host directory into /mnt/host
            async mountLocalDirectory() {
                if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
                    try {
                        const dirHandle = await window.showDirectoryPicker();
                        const mountPath = `/mnt/host_${dirHandle.name}`;
                        await getVfs().mkdir(mountPath, { recursive: true });
                        console.log(`[UnkaySDK] Mounted local host directory at ${mountPath}`);
                        return mountPath;
                    } catch (err) {
                        if (err.name === 'AbortError') {
                            throw new Error('User cancelled directory picker');
                        }
                        throw err;
                    }
                }
                throw new Error('File System Access API not supported in this browser');
            }
        },

        ai: {
            async prompt(messages) {
                // Calls RDA AI Gateway proxy (/api/v1/ai/chat)
                const token = getAuth()?.getAuthToken?.();
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = `Bearer ${token}`;

                const res = await fetch('/api/v1/ai/chat', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ messages })
                });

                if (!res.ok) {
                    throw new Error(`AI Gateway error: ${res.statusText}`);
                }
                const data = await res.json();
                return data.reply || data.content || '';
            },

            async stream(messages, onChunk) {
                const token = getAuth()?.getAuthToken?.();
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = `Bearer ${token}`;

                const res = await fetch('/api/v1/ai/chat/stream', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ messages })
                });

                if (!res.ok || !res.body) {
                    throw new Error(`AI Streaming error: ${res.statusText}`);
                }

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    onChunk(chunk);
                }
            }
        },

        kv: {
            async get(key) {
                if (typeof localStorage === 'undefined') return null;
                const prefix = `unkay_kv_${appCore?.app_name || 'global'}_`;
                const raw = localStorage.getItem(prefix + key);
                if (raw === null) return null;
                try {
                    return JSON.parse(raw);
                } catch {
                    return raw;
                }
            },
            async set(key, value) {
                if (typeof localStorage === 'undefined') return;
                const prefix = `unkay_kv_${appCore?.app_name || 'global'}_`;
                const serialized = typeof value === 'string' ? value : JSON.stringify(value);
                localStorage.setItem(prefix + key, serialized);
            },
            async remove(key) {
                if (typeof localStorage === 'undefined') return;
                const prefix = `unkay_kv_${appCore?.app_name || 'global'}_`;
                localStorage.removeItem(prefix + key);
            }
        },

        window: {
            setTitle(title) {
                if (appCore?.windowElement) {
                    const titleEl = appCore.windowElement.querySelector('.window-title, .app__top_bar__app_name');
                    if (titleEl) titleEl.textContent = title;
                }
            },
            setSize(width, height) {
                if (appCore?.windowElement) {
                    appCore.windowElement.style.width = typeof width === 'number' ? `${width}px` : width;
                    appCore.windowElement.style.height = typeof height === 'number' ? `${height}px` : height;
                }
            },
            minimize() {
                if (appCore?.windowSystem?.minimizeWindow) {
                    appCore.windowSystem.minimizeWindow();
                    return;
                }
                const appWindowSystem = systemManager?.getSystem('appWindowSystem');
                if (appCore && appWindowSystem?.minimizeWindow) {
                    appWindowSystem.minimizeWindow(appCore.instanceId);
                }
            },
            maximize() {
                appCore?.windowSystem?.toggleMaximizeWindow?.();
            },
            snap(zone) {
                appCore?.windowSystem?.snapTo?.(zone);
            },
            center() {
                appCore?.windowSystem?.centerWindow?.();
            },
            close() {
                const appManager = systemManager?.getSystem('appManager') || (typeof window !== 'undefined' ? window.appManager : null);
                if (appCore && appManager?.closeApp) {
                    appManager.closeApp(appCore.instanceId);
                }
            },
            async toggleFullscreen() {
                return getFullscreen()?.toggleFullscreen?.();
            },
            isFullscreen() {
                return Boolean(getFullscreen()?.isFullscreen?.());
            }
        },

        contextMenu: {
            register(selectorOrBuilder, builder = null) {
                if (!appCore?.instanceId) return () => {};
                return getContextMenu()?.registerAppProvider?.(appCore.instanceId, selectorOrBuilder, builder);
            },
            open(items, options = {}) {
                return getContextMenu()?.openCustomMenu?.(items, options);
            },
            close() {
                return getContextMenu()?.closeMenu?.();
            }
        },

        shortcuts: {
            listSystemShortcuts() {
                return getKeyboard()?.getSystemShortcuts?.() || [];
            }
        }
    };
}

// Global default SDK instance
export const unkay = createUnkaySDK();
