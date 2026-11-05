// core/kernel/index.js
// Public entry point of the feature kernel. Import from this module only.

export { Kernel, KernelError } from './Kernel.js';
export { defineFeature } from './defineFeature.js';
export { createEventEmitter } from './events.js';

/** @typedef {import('./defineFeature.js').FeatureContext} FeatureContext */
/** @typedef {import('./defineFeature.js').FeatureDefinition} FeatureDefinition */
