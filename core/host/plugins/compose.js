import { defineFeature } from '../../kernel/index.js';
import { DeploymentError, resolveDeployment } from '../config/deployment.js';
import { plugin as validateManifest } from '../config/validators.generated.js';
import { IDENTITY_V1_METHODS } from '../../contracts/identity.js';

const PORTS = Object.freeze({
    identity: { capability: 'authSystem', id: 'auth', contract: 'identity@1', methods: IDENTITY_V1_METHODS },
    access: { capability: 'accessPolicy', id: 'access-policy', contract: 'access@1', methods: ['evaluate'] },
    ai: { capability: 'aiService', id: 'ai-service', contract: 'ai@1', methods: ['prompt', 'stream', 'destroy'] },
    sync: { capability: 'syncService', id: 'sync-service', contract: 'sync@1', methods: ['sync'] }
});

/** Validate all definitions, configs and dependency edges before importing any plugin. */
export function planPlugins(input, catalog) {
    const deployment = resolveDeployment(input);
    const selected = new Map();
    for (const [id, instance] of Object.entries(deployment.instances)) {
        const entry = Object.hasOwn(catalog, instance.plugin) ? catalog[instance.plugin] : null;
        if (!entry || !validateManifest(entry.manifest) || entry.manifest.id !== instance.plugin) {
            throw new DeploymentError('PLUGIN_INVALID', `Plugin ausente ou incompatível na instância ${id}.`);
        }
        if (!entry.validateConfig(instance.config)) throw new DeploymentError('PLUGIN_CONFIG_INVALID', `Configuração inválida na instância ${id}.`);
        if (instance.enabled !== false) selected.set(id, { instance, entry });
    }
    for (const [port, target] of Object.entries(deployment.bindings)) {
        const [id, name] = /** @type {string} */ (target).split('.');
        const selection = selected.get(id);
        if (!selection || selection.entry.manifest.exports[name] !== PORTS[port].contract) {
            throw new DeploymentError('BINDING_INVALID', `Binding inválido para ${port}.`);
        }
    }
    // Resolve requirements between instances before load/setup; reject cycles.
    const ordered = [];
    const visited = new Set();
    const visiting = new Set();
    function visit(id) {
        if (visiting.has(id)) throw new DeploymentError('PLUGIN_CYCLE', 'Ciclo nas dependências de plugins.');
        if (visited.has(id)) return;
        visiting.add(id);
        const selection = selected.get(id);
        for (const port of selection.entry.manifest.requires) {
            const target = deployment.bindings[port];
            if (!target) throw new DeploymentError('PLUGIN_DEPENDENCY_MISSING', `Dependência ausente: ${port}.`);
            visit(target.split('.')[0]);
        }
        visiting.delete(id);
        visited.add(id);
        ordered.push(id);
    }
    for (const id of selected.keys()) visit(id);
    return { deployment, selected, ordered };
}

/**
 * Compose only trusted catalog entries. The kernel owns instance lifecycle.
 * @param {any} input
 * @param {any} catalog
 * @param {{ identityProvider?: Function }} [options]
 */
export async function composePlugins(input, catalog, options = {}) {
    const plan = planPlugins(input, catalog);
    for (const { entry } of plan.selected.values()) entry.validateHost?.(options);
    const features = [];
    for (const id of plan.ordered) {
        const { entry, instance } = plan.selected.get(id);
        const module = await entry.load();
        if (typeof module.create !== 'function') throw new DeploymentError('PLUGIN_FACTORY_INVALID', `Factory inválida na instância ${id}.`);
        const names = Object.keys(entry.manifest.exports);
        features.push(defineFeature({
            id: `plugin-${id}`,
            version: entry.manifest.version,
            provides: names.map(name => `${id}.${name}`),
            requires: entry.manifest.requires.map(port => plan.deployment.bindings[port]),
            setup: async context => {
                let api;
                try {
                    api = await module.create({ config: instance.config, context, deployment: plan.deployment, identityProvider: options.identityProvider });
                    for (const name of names) {
                        const value = api?.[name];
                        const methods = PORTS[name].methods;
                        if (!value || methods.some(method => typeof value[method] !== 'function')) {
                            throw new DeploymentError('PLUGIN_CONTRACT_INVALID', `Contrato inválido na instância ${id}.`);
                        }
                        if (name === 'identity') await value.ready;
                    }
                    return Object.fromEntries(names.map(name => [`${id}.${name}`, api[name]]));
                } catch (error) {
                    await Promise.allSettled(Object.values(api || {}).map(async value => /** @type {any} */ (value)?.destroy?.()));
                    throw error;
                }
            },
            stop: async (_context, api) => {
                const results = await Promise.allSettled(Object.values(api).map(async value => /** @type {any} */ (value)?.destroy?.()));
                for (const result of results) if (result.status === 'rejected') _context.logger.error('Plugin teardown failed:', result.reason);
            }
        }));
    }
    for (const [port, target] of Object.entries(plan.deployment.bindings)) {
        const { id, capability } = PORTS[port];
        features.push(defineFeature({
            id, provides: [capability], requires: [/** @type {string} */ (target)],
            setup: context => ({ [capability]: context.require(/** @type {string} */ (target)) })
        }));
    }
    return features;
}
