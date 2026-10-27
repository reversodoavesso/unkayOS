import { AppPackageLoader, VALID_TIERS, INSTALLABLE_PERMISSIONS, compareVersions } from './AppPackageLoader.js';
import eventBus from '../eventBus.js';

const ROOT = '/home/user/apps';
const DESKTOP = '/home/guest/Desktop';
const safeId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(value);
const categories = { openui: 'ai', theorb: 'utilities', 'text-editor': 'productivity', terminal: 'developer' };

/** The VFS is the installation authority. The server supplies reviewed packages,
 * never a claim that an application is installed on this browser. */
export class PackageManager {
    constructor({ fs, appManager, auth, fetcher = (url, options) => fetch(url, options) }) {
        this.fs = fs;
        this.appManager = appManager;
        appManager.packageManager = this;
        this.auth = auth;
        this.fetcher = fetcher;
        this.bundled = new Map([...appManager.loadedAppDetails].filter(([, app]) => !app.packageId));
        this.installed = new Map();
        this.catalog = new Map();
        this.pending = new Set();
        this.listeners = new Set();
        this.catalogError = '';
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify() {
        this.listeners.forEach(listener => {
            try { listener(); } catch (error) { console.error('[PackageManager] Assinante falhou:', error); }
        });
        try { eventBus.emit('packages:changed', {}); }
        catch (error) { console.error('[PackageManager] Atualização do menu falhou:', error); }
    }

    normalize(item) {
        const manifest = item.manifest || { ...item, type: item.type || item.appType,
            version: item.version || item.currentVersion, runtime_profile: item.runtime_profile || item.runtimeProfile,
            required_tier: item.required_tier || item.requiredTier };
        const builtin = item.id === 'app-openui-studio' && item.builtInAppId === 'openui' && this.bundled.has('openui');
        return {
            id: builtin ? 'openui' : manifest.id,
            catalogId: item.id,
            name: manifest.name || item.name,
            version: manifest.version || item.currentVersion,
            description: item.description || manifest.description || '',
            summary: item.summary || manifest.description || '',
            authorName: item.authorName || 'Comunidade RDA',
            category: manifest.category || item.category || 'utilities',
            runtimeProfile: manifest.runtime_profile || item.runtimeProfile,
            requiredTier: manifest.required_tier || item.requiredTier || 'guest',
            permissions: Array.isArray(manifest.permissions) ? manifest.permissions.filter(value => typeof value === 'string') : [],
            externalProviders: Array.isArray(manifest.external_providers) ? manifest.external_providers : [],
            iconName: builtin ? 'sparkles' : 'package',
            manifest,
            status: item.status,
            installation: item.installation,
            builtin
        };
    }

    async refresh(options = {}) {
        if (this.refreshing) return this.refreshing;
        if (this.pending.size) return this.list();
        this.refreshing = this.refreshInventory(options);
        try { return await this.refreshing; }
        finally { this.refreshing = null; }
    }

    async refreshInventory({ catalog = true } = {}) {
        // Serialize inventory reads with writes so an in-flight scan cannot
        // replace the result of an installation or unregister its launcher.
        if (this.pending.size) return this.list();
        await this.scanInstalled();
        if (catalog) {
            try {
                const response = await this.fetcher('/api/marketplace/apps', { signal: AbortSignal.timeout(10000) });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const body = await response.json();
                if (body.success !== true || !Array.isArray(body.apps)) throw new Error('Resposta de catálogo inválida');
                const next = new Map();
                for (const item of body.apps) {
                    const app = this.normalize(item);
                    if (safeId(app.id) && typeof app.name === 'string') next.set(app.id, app);
                }
                this.catalog = next;
                this.catalogError = '';
            } catch (error) {
                this.catalogError = `Catálogo indisponível (${error.message}). Os aplicativos locais continuam disponíveis.`;
            }
        }
        this.notify();
        return this.list();
    }

    async readJSON(path) {
        return JSON.parse(await this.fs.readText(path));
    }

    async scanInstalled() {
        const found = new Map();
        if (await this.fs.exists(ROOT)) {
            for (const entry of await this.fs.list(ROOT)) {
                const directoryId = typeof entry === 'string' ? entry : entry.name;
                if (!safeId(directoryId)) continue;
                const path = `${ROOT}/${directoryId}`;
                const receiptExists = await this.fs.exists(`${path}/installation.json`);
                const manifestExists = await this.fs.exists(`${path}/manifest.json`);
                const legacyExists = await this.fs.exists(`${path}/package.json`);
                if (!receiptExists && !manifestExists && !legacyExists) continue; // retained application data
                let app;
                try {
                    const receipt = receiptExists ? await this.readJSON(`${path}/installation.json`) : null;
                    const manifest = receipt?.manifest || await this.readJSON(`${path}/${manifestExists ? 'manifest.json' : 'package.json'}`);
                    const normalized = this.normalize(manifest);
                    app = { ...normalized, directoryId, broken: true };
                    const pkg = AppPackageLoader.loadPackage(normalized.manifest);
                    // Older Store versions used catalog IDs as directory names.
                    if (directoryId !== pkg.id && directoryId !== `app-${pkg.id}` && directoryId !== normalized.catalogId) throw new Error('Identidade do pacote diverge do diretório');
                    const specPath = receipt?.specPath || 'spec.openui';
                    if (!/^(?:releases\/[a-zA-Z0-9-]+\/)?spec\.openui$/.test(specPath)) throw new Error('Caminho de pacote inválido');
                    const source = pkg.type === 'openui' && await this.fs.exists(`${path}/${specPath}`)
                        ? await this.fs.readText(`${path}/${specPath}`) : '';
                    app = { ...normalized, directoryId, specPath, source, installedVersion: pkg.version,
                        broken: !source.trim() || pkg.type !== 'openui' || pkg.runtimeProfile !== 'client-only' };
                } catch (error) {
                    app = { ...app, id: safeId(app?.id) ? app.id : directoryId,
                        name: typeof app?.name === 'string' ? app.name : directoryId,
                        category: typeof app?.category === 'string' ? app.category : 'utilities',
                        directoryId, broken: true, error: error.message };
                }
                // Never let a local manifest replace a system application.
                if (this.bundled.has(app.id)) {
                    app = { ...app, id: directoryId === app.id ? `local-${directoryId}` : directoryId, broken: true, error: 'O pacote usa a identidade de um aplicativo do sistema.' };
                }
                found.set(app.id, app);
            }
        }
        for (const id of this.installed.keys()) {
            if (this.appManager.loadedAppDetails.get(id)?.packageId) this.appManager.loadedAppDetails.delete(id);
        }
        this.installed = found;
        for (const app of found.values()) if (!app.broken) this.register(app);
    }

    register(app) {
        if (this.bundled.has(app.id)) throw new Error('Aplicativos do sistema são protegidos.');
        const pkg = AppPackageLoader.loadPackage(app.manifest);
        this.appManager.loadedAppDetails.set(app.id, {
            id: app.id, packageId: app.id, app_name: app.name, description: app.description,
            mode: 'system_window', jsFile: '/core/sdk/InstalledPackageApp.js', icon_name: 'package',
            icon_url: '/assets/icons/apps/generic_app_icon.svg', hidden: false, autorun: false,
            width: `${pkg.window.width}px`, height: `${pkg.window.height}px`,
            minWidth: pkg.window.minWidth, minHeight: pkg.window.minHeight, resizable: pkg.window.resizable,
            x_position: '12vw', y_position: '10vh'
        });
    }

    list() {
        const apps = new Map(this.catalog);
        for (const app of this.installed.values()) apps.set(app.id, { ...app, ...apps.get(app.id) });
        for (const [id, config] of this.bundled) {
            if (config.hidden || config.widget || config.mode !== 'system_window') continue;
            apps.set(id, { ...apps.get(id), id, name: config.app_name,
                summary: config.description || apps.get(id)?.summary || 'Aplicativo incluído no unkayOS.',
                category: categories[id] || 'utilities', iconName: config.icon_name || 'package',
                requiredTier: 'guest', runtimeProfile: 'client-only', system: true });
        }
        return [...apps.values()].map(app => ({ ...app, ...this.getStatus(app) }))
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }

    getStatus(appOrId) {
        const id = typeof appOrId === 'string' ? appOrId : appOrId.id;
        const app = typeof appOrId === 'string' ? this.catalog.get(id) || this.installed.get(id) : appOrId;
        const local = this.installed.get(id);
        const system = this.bundled.has(id);
        const tier = this.auth.getTier();
        const reasons = [];
        if (!system) {
            const validation = AppPackageLoader.validateManifest(app?.manifest);
            if (!validation.valid) reasons.push('O manifesto do pacote é inválido.');
            const required = VALID_TIERS.indexOf(app?.requiredTier || 'guest');
            if (required < 0 || VALID_TIERS.indexOf(tier) < required) reasons.push(`Requer perfil ${app?.requiredTier || 'desconhecido'}.`);
            if (this.catalogError && this.catalog.has(id)) reasons.push('Reconecte ao catálogo para instalar ou atualizar.');
            if (app?.status && app.status !== 'approved') reasons.push('Aplicativo ainda não aprovado para publicação.');
            if (app?.runtimeProfile !== 'client-only') reasons.push('Este perfil de execução ainda não está disponível para pacotes instaláveis.');
            if (app?.manifest?.type !== 'openui') reasons.push('A instalação de código nativo aguarda um runtime isolado.');
            if (app?.externalProviders?.length) reasons.push('A verificação de contas externas ainda não está disponível para pacotes instaláveis.');
            const unsupported = app?.permissions?.filter(permission => !INSTALLABLE_PERMISSIONS.includes(permission)) || [];
            if (unsupported.length) reasons.push(`Permissões ainda não suportadas: ${unsupported.join(', ')}.`);
            if (this.catalog.has(id) && app?.installation?.available !== true) reasons.push(app?.installation?.reason || 'O catálogo ainda não fornece o conteúdo deste pacote.');
            if (!this.catalog.has(id) && !local) reasons.push('Pacote não encontrado.');
        }
        const installed = system || !!local;
        const updateAvailable = !!local && this.catalog.has(id) && compareVersions(app?.version, local.installedVersion) > 0;
        const launchTier = VALID_TIERS.indexOf(local?.requiredTier || 'guest');
        const hasLaunchTier = launchTier >= 0 && VALID_TIERS.indexOf(tier) >= launchTier;
        const launchRuntime = local && !local.externalProviders?.length && local.permissions?.every(permission => INSTALLABLE_PERMISSIONS.includes(permission));
        const canOpen = system || !!local && !local.broken && hasLaunchTier && launchRuntime;
        if (local && !local.broken && !hasLaunchTier) reasons.push(`A abertura da versão instalada requer perfil ${local.requiredTier}.`);
        if (local && !local.broken && !launchRuntime) reasons.push('A versão instalada depende de permissões ou integrações ainda não suportadas.');
        const busy = this.pending.has(id);
        return {
            installed, system, busy, installedVersion: local?.installedVersion,
            updateAvailable, reasons,
            state: busy ? 'pending' : system ? 'system' : local?.broken ? 'incomplete' : installed ? !canOpen ? 'blocked' : updateAvailable ? 'update' : 'installed' : reasons.length ? 'blocked' : 'available',
            canOpen: canOpen && !busy,
            canInstall: !system && !installed && !reasons.length && !busy,
            canUpdate: !system && (updateAvailable || !!local?.broken) && !reasons.length && !busy,
            canUninstall: !!local && !system && !busy,
            localError: local?.error
        };
    }

    async exclusive(id, work) {
        if (this.pending.has(id)) throw new Error('Já existe uma operação em andamento para este aplicativo.');
        this.pending.add(id); this.notify();
        try { return await work(); }
        finally { this.pending.delete(id); this.notify(); }
    }

    async install(id) {
        await this.refreshing;
        const app = this.catalog.get(id);
        const state = this.getStatus(id);
        if (!app || (!state.canInstall && !state.canUpdate)) throw new Error(state.reasons.join(' ') || 'Este aplicativo já está instalado.');
        return this.exclusive(id, async () => {
            const token = this.auth.getToken();
            const response = await this.fetcher('/api/marketplace/install', {
                method: 'POST', signal: AbortSignal.timeout(10000),
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ appId: app.catalogId })
            });
            const body = await response.json();
            if (!response.ok || body.success !== true) throw new Error(body.error || 'A API recusou a instalação.');
            if (body.manifest?.id !== id || body.manifest?.version !== app.version) throw new Error('O pacote retornado diverge do catálogo. Atualize a lista e tente novamente.');
            if (body.bundleHash) {
                const content = new TextEncoder().encode(JSON.stringify({ manifest: body.manifest, files: body.files || {} }));
                const digest = await crypto.subtle.digest('SHA-256', content);
                const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
                if (hash !== body.bundleHash) throw new Error('A integridade do pacote não pôde ser verificada.');
            }
            await this.persist(body.manifest, body.files, app.catalogId);
        });
    }

    async installLocal(raw) {
        await this.refreshing;
        const bundle = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (bundle?.format !== 'unkayapp-v1') throw new Error('Formato .unkayapp não reconhecido.');
        const pkg = AppPackageLoader.loadPackage(bundle.manifest);
        if (this.bundled.has(pkg.id)) throw new Error('Aplicativos do sistema são protegidos.');
        const current = this.installed.get(pkg.id);
        if (current && compareVersions(pkg.version, current.installedVersion) < 0) throw new Error('Não é permitido instalar uma versão anterior à instalada.');
        return this.exclusive(pkg.id, () => this.persist(bundle.manifest, bundle.files));
    }

    async persist(manifest, files, catalogId = null) {
        const pkg = AppPackageLoader.loadPackage(manifest);
        if (pkg.type !== 'openui' || pkg.runtimeProfile !== 'client-only') throw new Error('Somente pacotes OpenUI locais podem ser instalados neste runtime.');
        if (VALID_TIERS.indexOf(this.auth.getTier()) < VALID_TIERS.indexOf(pkg.requiredTier)) throw new Error(`Requer perfil ${pkg.requiredTier}.`);
        if (pkg.externalProviders.length) throw new Error('A verificação de contas externas ainda não está disponível para pacotes instaláveis.');
        const unsupported = pkg.permissions.filter(permission => !INSTALLABLE_PERMISSIONS.includes(permission));
        if (unsupported.length) throw new Error(`Permissões ainda não suportadas: ${unsupported.join(', ')}.`);
        if (typeof files?.['spec.openui'] !== 'string' || !files['spec.openui'].trim()) throw new Error('O pacote não contém spec.openui.');
        if (files['spec.openui'].length > 512 * 1024) throw new Error('A interface excede o limite de 512 KB.');
        const existing = this.installed.get(pkg.id);
        const directoryId = existing?.directoryId || pkg.id;
        const path = `${ROOT}/${directoryId}`;
        const release = `releases/${crypto.randomUUID()}`;
        const receipt = { manifest, catalogId, specPath: `${release}/spec.openui`, installedAt: new Date().toISOString() };
        const previousReceipt = await this.fs.exists(`${path}/installation.json`) ? await this.fs.readText(`${path}/installation.json`) : null;
        let committed = false;
        try {
            await this.fs.mkdir(`${path}/${release}`, true);
            await this.fs.mkdir(`${path}/data`, true);
            await this.fs.writeFile(`${path}/${receipt.specPath}`, files['spec.openui']);
            await this.fs.writeFile(`${path}/installation.json`, JSON.stringify(receipt));
            committed = true;
            await this.fs.flush?.();
        } catch (error) {
            if (committed) {
                if (previousReceipt !== null) await this.fs.writeFile(`${path}/installation.json`, previousReceipt);
                else await this.fs.remove(`${path}/installation.json`);
            }
            await this.fs.remove(`${path}/${release}`, true).catch(() => {});
            throw error;
        }
        const app = { ...this.normalize({ manifest }), directoryId, specPath: receipt.specPath,
            source: files['spec.openui'], installedVersion: pkg.version, broken: false };
        this.installed.set(pkg.id, app);
        this.register(app);
        // A shortcut is optional; the registered launcher remains authoritative.
        try {
            await this.fs.mkdir(DESKTOP, true);
            await this.fs.writeFile(`${DESKTOP}/${pkg.id}.desktop`, `[Desktop Entry]\nName=${pkg.name.replace(/[\r\n]/g, ' ')}\nExec=unkay run ${pkg.id}\nType=Application\n`);
        } catch (error) { console.warn('[PackageManager] Atalho não criado:', error); }
        return app;
    }

    async loadInstalled(id) {
        const app = this.installed.get(id);
        if (!app || !this.getStatus(id).canOpen) throw new Error('Este aplicativo não pode ser aberto com o perfil atual.');
        return { pkg: AppPackageLoader.loadPackage(app.manifest), source: await this.fs.readText(`${ROOT}/${app.directoryId}/${app.specPath}`) };
    }

    async open(id) {
        if (!this.getStatus(id).canOpen) throw new Error('Aplicativo indisponível para abertura.');
        const result = await this.appManager.runApp(id);
        if (!result) throw new Error('Não foi possível abrir o aplicativo.');
        return result;
    }

    async uninstall(id) {
        await this.refreshing;
        if (!this.getStatus(id).canUninstall) throw new Error('Este aplicativo não pode ser removido.');
        return this.exclusive(id, async () => {
            const app = this.installed.get(id), path = `${ROOT}/${app.directoryId}`;
            for (const [instanceId, running] of this.appManager.runningApps) {
                if (running.CORE.id === id) await this.appManager.stopApp(instanceId);
            }
            // Keep data/ so reinstalling restores personal application data.
            for (const name of ['installation.json', 'manifest.json', 'package.json', 'spec.openui', 'index.html', 'releases']) {
                if (await this.fs.exists(`${path}/${name}`)) await this.fs.remove(`${path}/${name}`, true);
            }
            if (await this.fs.exists(`${DESKTOP}/${app.directoryId}.desktop`)) await this.fs.remove(`${DESKTOP}/${app.directoryId}.desktop`);
            await this.fs.flush?.();
            this.installed.delete(id);
            this.appManager.loadedAppDetails.delete(id);
        });
    }
}
