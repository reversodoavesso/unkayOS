// core/kernel/Kernel.js
// Host-agnostic feature kernel: registration, dependency resolution, lifecycle and
// capability lookup. It has no knowledge of unkayOS, the DOM or any global object.

import { createEventEmitter } from './events.js';
import { defineFeature } from './defineFeature.js';

/**
 * @typedef {import('./defineFeature.js').FeatureDefinition} FeatureDefinition
 * @typedef {import('./defineFeature.js').FeatureContext} FeatureContext
 */

export class KernelError extends Error {
    /**
     * @param {string} message
     * @param {string} [code]
     * @param {Record<string, unknown>} [details]
     */
    constructor(message, code = 'KERNEL_ERROR', details = {}) {
        super(message);
        this.name = 'KernelError';
        this.code = code;
        this.details = details;
    }
}

const noop = () => {};

/**
 * @param {Record<string, unknown>} [overrides]
 */
function createDefaultLogger(overrides = {}) {
    const sink = typeof console !== 'undefined' ? console : null;
    if (!sink) {
        return { debug: noop, info: noop, warn: noop, error: noop, ...overrides };
    }
    return {
        debug: (...args) => sink.debug?.('[kernel]', ...args),
        info: (...args) => sink.info?.('[kernel]', ...args),
        warn: (...args) => sink.warn?.('[kernel]', ...args),
        error: (...args) => sink.error?.('[kernel]', ...args),
        ...overrides
    };
}

export class Kernel {
    /** @type {Map<string, Readonly<FeatureDefinition>>} */
    #features = new Map();
    /** @type {Map<string, { featureId: string, value: unknown }>} */
    #capabilities = new Map();
    /** @type {Map<string, { feature: Readonly<FeatureDefinition>, context: FeatureContext, api: object }>} */
    #instances = new Map();
    /** @type {'idle' | 'starting' | 'running' | 'stopping'} */
    #state = 'idle';
    /** @type {Promise<this> | null} */
    #startPromise = null;
    /** @type {Promise<this> | null} */
    #stopPromise = null;
    /** @type {ReturnType<typeof createEventEmitter>} */
    #emitter;
    #logger;
    #config;

    /**
     * @param {object} [options]
     * @param {object} [options.logger]
     * @param {Record<string, Record<string, unknown>>} [options.config] Per-feature configuration.
     */
    constructor(options = {}) {
        const { logger = null, config = {} } = options;
        this.#logger = createDefaultLogger(logger || {});
        this.#config = config && typeof config === 'object' ? config : {};
        this.#emitter = createEventEmitter({
            onListenerError: (error, { event }) => {
                this.#logger.error(`Listener for "${event}" failed:`, error);
            }
        });
    }

    get state() {
        return this.#state;
    }

    /** Host-facing kernel events. */
    get events() {
        return {
            on: this.#emitter.on,
            once: this.#emitter.once,
            off: this.#emitter.off,
            emit: this.#emitter.emit
        };
    }

    /**
     * Registers one or more feature definitions. Registration is only allowed while idle.
     *
     * @param {...(FeatureDefinition | FeatureDefinition[])} definitions
     * @returns {this}
     */
    register(...definitions) {
        if (this.#state !== 'idle') {
            throw new KernelError(
                `Cannot register features while the kernel is "${this.#state}".`,
                'KERNEL_NOT_IDLE',
                { state: this.#state }
            );
        }

        const list = definitions.flat();
        for (const rawFeature of list) {
            const feature = defineFeature(/** @type {FeatureDefinition} */ (rawFeature));

            if (this.#features.has(feature.id)) {
                throw new KernelError(
                    `Feature "${feature.id}" is already registered.`,
                    'FEATURE_DUPLICATE',
                    { feature: feature.id }
                );
            }

            for (const capability of feature.provides) {
                for (const owner of this.#features.values()) {
                    if (owner.provides.includes(capability)) {
                        throw new KernelError(
                            `Capability "${capability}" is already provided by feature "${owner.id}".`,
                            'CAPABILITY_DUPLICATE',
                            { capability, feature: feature.id, owner: owner.id }
                        );
                    }
                }
            }

            this.#features.set(feature.id, feature);
        }

        return this;
    }

    /** @param {string} featureId */
    hasFeature(featureId) {
        return this.#features.has(featureId);
    }

    /** @param {string} featureId */
    feature(featureId) {
        return this.#features.get(featureId) || null;
    }

    /** @param {string} capability */
    has(capability) {
        const entry = this.#capabilities.get(capability);
        return Boolean(entry && this.#instances.has(entry.featureId));
    }

    /**
     * Returns a capability value when the kernel is running, otherwise `undefined`.
     *
     * @param {string} capability
     */
    get(capability) {
        const entry = this.#capabilities.get(capability);
        return entry ? entry.value : undefined;
    }

    /**
     * Returns a capability value or throws when it is unavailable.
     *
     * @param {string} capability
     */
    require(capability) {
        const entry = this.#capabilities.get(capability);
        if (!entry || !this.#instances.has(entry.featureId)) {
            throw new KernelError(
                `Capability "${capability}" is not available.`,
                'CAPABILITY_NOT_FOUND',
                { capability, state: this.#state }
            );
        }
        return entry.value;
    }

    /**
     * Starts every registered feature in dependency order. Idempotent.
     *
     * @returns {Promise<this>}
     */
    async start() {
        if (this.#state === 'running') return this;
        if (this.#state === 'starting' && this.#startPromise) return this.#startPromise;
        if (this.#state === 'stopping' && this.#stopPromise) {
            await this.#stopPromise;
        }

        this.#state = 'starting';
        this.#startPromise = (async () => {
            /** @type {string[]} */
            const started = [];
            /** @type {FeatureContext[]} */
            const contexts = [];

            try {
                const order = this.#resolveOrder();
                for (const feature of order) {
                    const context = this.#createContext(feature);
                    contexts.push(context);
                    const api = await feature.setup(context);

                    if (api === null || typeof api !== 'object') {
                        throw new KernelError(
                            `Feature "${feature.id}" setup() must return an object keyed by capability.`,
                            'FEATURE_INVALID_SETUP',
                            { feature: feature.id }
                        );
                    }

                    for (const capability of feature.provides) {
                        if (!(capability in api)) {
                            throw new KernelError(
                                `Feature "${feature.id}" did not expose declared capability "${capability}".`,
                                'CAPABILITY_MISSING',
                                { feature: feature.id, capability }
                            );
                        }
                    }

                    for (const capability of feature.provides) {
                        this.#capabilities.set(capability, {
                            featureId: feature.id,
                            value: api[capability]
                        });
                    }

                    this.#instances.set(feature.id, { feature, context, api });
                    started.push(feature.id);

                    if (feature.start) {
                        await feature.start(context, api);
                    }
                }

                this.#state = 'running';
                this.#emitter.emit('kernel:ready', {
                    features: order.map(feature => feature.id)
                });
                return this;
            } catch (error) {
                await this.#rollback(started, contexts);
                this.#state = 'idle';
                this.#emitter.emit('kernel:error', { error });
                throw error;
            } finally {
                this.#startPromise = null;
            }
        })();

        return this.#startPromise;
    }

    /**
     * Stops features in reverse dependency order. Idempotent.
     *
     * @returns {Promise<this>}
     */
    async stop() {
        if (this.#state === 'idle') return this;
        if (this.#state === 'starting' && this.#startPromise) {
            try {
                await this.#startPromise;
            } catch {
                // A failed start already rolled back and reset the state.
            }
            const stateAfterStart = /** @type {string} */ (this.#state);
            if (stateAfterStart === 'idle') return this;
        }
        if (/** @type {string} */ (this.#state) === 'stopping' && this.#stopPromise) return this.#stopPromise;

        this.#state = 'stopping';
        this.#stopPromise = (async () => {
            const ids = Array.from(this.#instances.keys()).reverse();
            for (const id of ids) {
                const instance = this.#instances.get(id);
                if (!instance) continue;
                try {
                    if (instance.feature.stop) {
                        await instance.feature.stop(instance.context, instance.api);
                    }
                } catch (error) {
                    this.#logger.error(`Feature "${id}" failed to stop:`, error);
                }
                instance.context.dispose();
                for (const capability of instance.feature.provides) {
                    this.#capabilities.delete(capability);
                }
                this.#instances.delete(id);
            }

            this.#state = 'idle';
            this.#emitter.emit('kernel:stopped', {});
            return this;
        })();

        try {
            return await this.#stopPromise;
        } finally {
            this.#stopPromise = null;
        }
    }

    /** Diagnostic snapshot used by tooling and tests. */
    describe() {
        return {
            state: this.#state,
            features: Array.from(this.#features.values()).map(feature => ({
                id: feature.id,
                version: feature.version,
                provides: [...feature.provides],
                requires: [...feature.requires],
                optionalRequires: [...feature.optionalRequires],
                running: this.#instances.has(feature.id)
            })),
            capabilities: Array.from(this.#capabilities.keys())
        };
    }

    /**
     * @param {string[]} started
     * @param {FeatureContext[]} [contexts]
     */
    async #rollback(started, contexts = []) {
        for (const id of started.reverse()) {
            const instance = this.#instances.get(id);
            if (!instance) continue;
            try {
                if (instance.feature.stop) {
                    await instance.feature.stop(instance.context, instance.api);
                }
            } catch (error) {
                this.#logger.error(`Feature "${id}" failed to roll back:`, error);
            }
            instance.context.dispose();
            for (const capability of instance.feature.provides) {
                this.#capabilities.delete(capability);
            }
            this.#instances.delete(id);
        }

        for (const context of contexts) {
            context.dispose();
        }
    }

    /**
     * Resolves feature order using capability requirements plus explicit `after` edges.
     *
     * @returns {Readonly<FeatureDefinition>[]}
     */
    #resolveOrder() {
        if (this.#features.size === 0) return [];

        /** @type {Map<string, Readonly<FeatureDefinition>>} */
        const providers = new Map();
        for (const feature of this.#features.values()) {
            for (const capability of feature.provides) {
                providers.set(capability, feature);
            }
        }

        /** @type {Map<string, Set<string>>} */
        const dependencies = new Map();
        /** @type {string[]} */
        const missing = [];

        for (const feature of this.#features.values()) {
            const edges = new Set();
            for (const capability of feature.requires) {
                const provider = providers.get(capability);
                if (!provider) {
                    missing.push(`"${feature.id}" requires "${capability}"`);
                } else if (provider.id !== feature.id) {
                    edges.add(provider.id);
                }
            }
            for (const dependencyId of feature.after) {
                if (!this.#features.has(dependencyId)) {
                    missing.push(`"${feature.id}" must start after unknown feature "${dependencyId}"`);
                } else if (dependencyId !== feature.id) {
                    edges.add(dependencyId);
                }
            }
            dependencies.set(feature.id, edges);
        }

        if (missing.length > 0) {
            throw new KernelError(
                `Unresolved feature dependencies: ${missing.join('; ')}.`,
                'FEATURE_DEPENDENCY_MISSING',
                { missing }
            );
        }

        const ordered = [];
        const indegree = new Map();
        for (const [id, edges] of dependencies) {
            indegree.set(id, edges.size);
        }

        /** @type {string[]} */
        const ready = [];
        for (const [id, degree] of indegree) {
            if (degree === 0) ready.push(id);
        }

        while (ready.length > 0) {
            const id = /** @type {string} */ (ready.shift());
            ordered.push(/** @type {Readonly<FeatureDefinition>} */ (this.#features.get(id)));

            for (const [candidateId, edges] of dependencies) {
                if (!edges.has(id)) continue;
                edges.delete(id);
                const degree = (indegree.get(candidateId) || 0) - 1;
                indegree.set(candidateId, degree);
                if (degree === 0) ready.push(candidateId);
            }
        }

        if (ordered.length !== this.#features.size) {
            const cycle = Array.from(this.#features.keys()).filter(
                id => !ordered.some(feature => feature.id === id)
            );
            throw new KernelError(
                `Circular feature dependency detected: ${cycle.join(' -> ')}.`,
                'FEATURE_DEPENDENCY_CYCLE',
                { cycle }
            );
        }

        return ordered;
    }

    /**
     * @param {Readonly<FeatureDefinition>} feature
     * @returns {FeatureContext}
     */
    #createContext(feature) {
        /** @type {Array<() => void>} */
        const disposers = [];
        const logger = {
            debug: (...args) => this.#logger.debug(`[${feature.id}]`, ...args),
            info: (...args) => this.#logger.info(`[${feature.id}]`, ...args),
            warn: (...args) => this.#logger.warn(`[${feature.id}]`, ...args),
            error: (...args) => this.#logger.error(`[${feature.id}]`, ...args)
        };

        /** @type {Omit<FeatureContext, 'dispose'>} */
        const context = {
            id: feature.id,
            version: feature.version,
            config: this.#config[feature.id] || {},
            logger,
            on: (event, listener) => {
                const off = this.#emitter.on(event, listener);
                disposers.push(off);
                return off;
            },
            once: (event, listener) => {
                const off = this.#emitter.once(event, listener);
                disposers.push(off);
                return off;
            },
            emit: (event, payload) => this.#emitter.emit(event, payload),
            has: capability => this.has(capability),
            get: capability => this.get(capability),
            require: capability => this.require(capability)
        };

        const dispose = () => {
            for (const off of disposers.splice(0)) off();
        };

        return Object.freeze({ ...context, dispose });
    }
}
