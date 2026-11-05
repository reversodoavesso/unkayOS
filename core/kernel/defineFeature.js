// core/kernel/defineFeature.js
// Feature contract for the unkayOS kernel. Features are plain, host-agnostic modules:
// they never import the system manager, the DOM or unkayOS singletons.

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

/**
 * @typedef {object} FeatureContext
 * @property {string} id
 * @property {string} version
 * @property {Record<string, unknown>} config
 * @property {object} logger
 * @property {(event: string, listener: (payload: unknown) => void) => () => void} on
 * @property {(event: string, listener: (payload: unknown) => void) => () => void} once
 * @property {(event: string, payload?: unknown) => number} emit
 * @property {(capability: string) => boolean} has
 * @property {(capability: string) => unknown} get
 * @property {(capability: string) => unknown} require
 * @property {() => void} dispose
 */

/**
 * @typedef {object} FeatureDefinition
 * @property {string} id Stable unique id.
 * @property {string} [version] Semantic version, defaults to 1.0.0.
 * @property {string} [description]
 * @property {readonly string[]} provides Capability names exposed by this feature.
 * @property {readonly string[]} [requires] Capabilities that must exist before setup.
 * @property {readonly string[]} [optionalRequires] Capabilities used when present.
 * @property {readonly string[]} [after] Feature ids that must start before this one.
 * @property {(context: FeatureContext) => object | Promise<object>} setup
 * @property {(context: FeatureContext, api: object) => void | Promise<void>} [start]
 * @property {(context: FeatureContext, api: object) => void | Promise<void>} [stop]
 */

/**
 * Normalizes and freezes a feature definition.
 *
 * @param {FeatureDefinition} definition
 * @returns {Readonly<FeatureDefinition>}
 */
export function defineFeature(definition) {
    if (!definition || typeof definition !== 'object') {
        throw new TypeError('defineFeature expects a feature definition object.');
    }

    const {
        id,
        version = '1.0.0',
        description = '',
        provides,
        requires = [],
        optionalRequires = [],
        after = [],
        setup,
        start,
        stop
    } = definition;

    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        throw new TypeError(`Invalid feature id "${String(id)}". Use lowercase letters, digits, dots or dashes.`);
    }
    if (typeof version !== 'string' || version.length === 0) {
        throw new TypeError(`Feature "${id}" must declare a non-empty version string.`);
    }
    if (typeof setup !== 'function') {
        throw new TypeError(`Feature "${id}" must declare a setup(context) function.`);
    }
    if (start !== undefined && typeof start !== 'function') {
        throw new TypeError(`Feature "${id}" start hook must be a function.`);
    }
    if (stop !== undefined && typeof stop !== 'function') {
        throw new TypeError(`Feature "${id}" stop hook must be a function.`);
    }

    const capabilities = normalizeList(provides, `Feature "${id}" provides`);
    const requiredCapabilities = normalizeList(requires, `Feature "${id}" requires`);
    const optionalCapabilities = normalizeList(optionalRequires, `Feature "${id}" optionalRequires`);
    const afterFeatures = normalizeList(after, `Feature "${id}" after`);

    if (capabilities.length === 0) {
        throw new TypeError(`Feature "${id}" must provide at least one capability.`);
    }

    const overlap = requiredCapabilities.filter(capability => capabilities.includes(capability));
    if (overlap.length > 0) {
        throw new TypeError(`Feature "${id}" cannot require its own capability: ${overlap.join(', ')}.`);
    }

    return Object.freeze({
        id,
        version,
        description,
        provides: Object.freeze(capabilities),
        requires: Object.freeze(requiredCapabilities),
        optionalRequires: Object.freeze(optionalCapabilities),
        after: Object.freeze(afterFeatures),
        setup,
        start,
        stop
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
