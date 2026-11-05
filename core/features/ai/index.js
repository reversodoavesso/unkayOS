// Provider-independent facade. No transport, credentials or endpoint defaults.
import { defineFeature } from '../../kernel/index.js';
import { unavailable } from '../serviceError.js';

/** @param {{ adapter?: any }} [options] */
export function createAi({ adapter = null } = {}) {
    const get = () => {
        const value = typeof adapter === 'function' ? adapter() : adapter;
        if (!value) throw unavailable('IA n\u00e3o dispon\u00edvel nesta vers\u00e3o do unkayOS.');
        return value;
    };
    return {
        async prompt(messages, options = {}) { return get().prompt(messages, options); },
        async stream(messages, onChunk, options = {}) { return get().stream(messages, onChunk, options); }
    };
}

export const aiFeature = defineFeature({
    id: 'ai', version: '1.0.0',
    description: 'AI facade over an injected provider.',
    provides: ['ai'], setup: ({ config }) => ({ ai: createAi(config) })
});
