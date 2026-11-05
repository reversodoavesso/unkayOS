// core/apps/AppFeatureRegistry.js
// Declarative catalog for OS applications. Apps are treated as features:
// they declare required capabilities and can be enabled or disabled at runtime.
// Host-agnostic: storage and capability probing are injected.

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

/**
 * @typedef {object} AppFeatureDefinition
 * @property {string} id
 * @property {string} [path]
 * @property {readonly string[]} [requires]
 * @property {readonly string[]} [optionalRequires]
 * @property {boolean} [enabled]
 * @property {boolean} [locked] Core apps that cannot be disabled.
 * @property {Readonly<Record<string, unknown>>} [metadata]
 */

/**
 * @param {AppFeatureDefinition} definition
 * @returns {Readonly<AppFeatureDefinition>}
 */
export function defineAppFeature(definition) {
    if (!definition || typeof definition !== 'object') {
        throw new TypeError('defineAppFeature expects an app definition object.');
    }

    const { id, path = '', requires = [], optionalRequires = [], enabled = true, locked = false, metadata = {} } = definition;

    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        throw new TypeError(`Invalid app feature id "${String(id)}".`);
    }
    if (typeof enabled !== 'boolean') {
        throw new TypeError(`App feature "${id}" enabled flag must be a boolean.`);
    }
    if (typeof locked !== 'boolean') {
        throw new TypeError(`App feature "${id}" locked flag must be a boolean.`);
    }

    return Object.freeze({
        id,
        path: typeof path === 'string' ? path : '',
        requires: Object.freeze(normalizeList(requires, `App feature "${id}" requires`)),
        optionalRequires: Object.freeze(normalizeList(optionalRequires, `App feature "${id}" optionalRequires`)),
        enabled,
        locked,
        metadata: Object.freeze({ ...metadata })
    });
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string[]}
 */
function normalizeList(value, label) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
        throw new TypeError(`${label} must be an array of strings.`);
    }

    const seen = new Set();
    const result = [];
    for (const item of value) {
        if (typeof item !== 'string' || item.length === 0) {
            throw new TypeError(`${label} must contain only non-empty strings.`);
        }
        if (seen.has(item)) continue;
        seen.add(item);
        result.push(item);
    }
    return result;
}

export class AppFeatureRegistry {
    /** @type {Map<string, Readonly<AppFeatureDefinition>>} */
    #definitions = new Map();
    /** @type {Map<string, boolean>} */
    #overrides = new Map();
    /** @type {Set<(snapshot: object[]) => void>} */
    #listeners = new Set();
    /** @type {(capability: string) => boolean} */
    #isCapabilityAvailable;
    /** @type {{ getItem(key: string): string | null, setItem(key: string, value: string): void } | null} */
    #storage;
    #storageKey;

    /**
     * @param {object} [options]
     * @param {(capability: string) => boolean} [options.isCapabilityAvailable]
     * @param {{ getItem(key: string): string | null, setItem(key: string, value: string): void } | null} [options.storage]
     * @param {string} [options.storageKey]
     */
    constructor(options = {}) {
        const {
            isCapabilityAvailable = () => true,
            storage = null,
            storageKey = 'unkay_app_features'
        } = options;

        this.#isCapabilityAvailable = isCapabilityAvailable;
        this.#storage = storage;
        this.#storageKey = storageKey;
        this.#loadOverrides();
    }

    /**
     * @param {...(AppFeatureDefinition | AppFeatureDefinition[])} definitions
     * @returns {this}
     */
    register(...definitions) {
        for (const raw of definitions.flat()) {
            const definition = defineAppFeature(raw);
            if (this.#definitions.has(definition.id)) {
                throw new Error(`App feature "${definition.id}" is already registered.`);
            }
            this.#definitions.set(definition.id, definition);
        }
        return this;
    }

    /** @param {string} id */
    has(id) {
        return this.#definitions.has(id);
    }

    /** @param {string} id */
    get(id) {
        return this.#definitions.get(id) || null;
    }

    /**
     * Unknown apps keep the legacy behavior (enabled) so a catalog omission never
     * hides an app that is already listed by the host.
     *
     * @param {string} id
     */
    isEnabled(id) {
        const override = this.#overrides.get(id);
        if (override !== undefined) return override;
        const definition = this.#definitions.get(id);
        return definition ? definition.enabled : true;
    }

    /**
     * @param {string} id
     * @param {boolean} enabled
     */
    setEnabled(id, enabled) {
        const definition = this.#definitions.get(id);
        if (!definition) {
            throw new Error(`Unknown app feature "${id}".`);
        }
        if (typeof enabled !== 'boolean') {
            throw new TypeError('enabled must be a boolean.');
        }
        if (definition.locked && enabled !== definition.enabled) {
            throw new Error(`App feature "${id}" is locked and cannot change state.`);
        }

        this.#overrides.set(id, enabled);
        this.#persist();
        this.#notify();
        return enabled;
    }

    /**
     * Removes a definition and its persisted override.
     *
     * @param {string} id
     * @returns {boolean}
     */
    unregister(id) {
        const removed = this.#definitions.delete(id);
        const hadOverride = this.#overrides.delete(id);
        if (removed || hadOverride) {
            this.#persist();
            this.#notify();
        }
        return removed;
    }

    /**
     * Required capabilities that are currently unavailable.
     *
     * @param {string} id
     * @returns {string[]}
     */
    missingRequirements(id) {
        const definition = this.#definitions.get(id);
        if (!definition) return [];
        return definition.requires.filter(capability => !this.#isCapabilityAvailable(capability));
    }

    /**
     * Optional capabilities that are unavailable. Never blocks launch.
     *
     * @param {string} id
     * @returns {string[]}
     */
    missingOptionalRequirements(id) {
        const definition = this.#definitions.get(id);
        if (!definition) return [];
        return definition.optionalRequires.filter(capability => !this.#isCapabilityAvailable(capability));
    }

    /** @param {string} id */
    isAvailable(id) {
        return this.isEnabled(id) && this.missingRequirements(id).length === 0;
    }

    /** @returns {object[]} */
    list() {
        return Array.from(this.#definitions.values()).map(definition => ({
            id: definition.id,
            path: definition.path,
            enabled: this.isEnabled(definition.id),
            locked: definition.locked,
            available: this.isAvailable(definition.id),
            missingRequirements: this.missingRequirements(definition.id),
            missingOptionalRequirements: this.missingOptionalRequirements(definition.id),
            requires: [...definition.requires],
            optionalRequires: [...definition.optionalRequires],
            metadata: { ...definition.metadata }
        }));
    }

    /** @returns {string[]} */
    enabledIds() {
        return Array.from(this.#definitions.keys()).filter(id => this.isEnabled(id));
    }

    /**
     * @param {(snapshot: object[]) => void} listener
     * @returns {() => void}
     */
    subscribe(listener) {
        if (typeof listener !== 'function') {
            throw new TypeError('Listener must be a function.');
        }
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }

    #loadOverrides() {
        if (!this.#storage || typeof this.#storage.getItem !== 'function') return;
        try {
            const raw = this.#storage.getItem(this.#storageKey);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return;
            for (const [id, value] of Object.entries(parsed)) {
                if (typeof value === 'boolean') this.#overrides.set(id, value);
            }
        } catch {
            // Corrupted preferences must never block boot.
        }
    }

    #persist() {
        if (!this.#storage || typeof this.#storage.setItem !== 'function') return;
        try {
            this.#storage.setItem(this.#storageKey, JSON.stringify(Object.fromEntries(this.#overrides)));
        } catch {
            // Storage may be unavailable (private mode/quota); keep the in-memory state.
        }
    }

    #notify() {
        const snapshot = this.list();
        for (const listener of this.#listeners) {
            try {
                listener(snapshot);
            } catch {
                // A broken subscriber must not break other subscribers.
            }
        }
    }
}
