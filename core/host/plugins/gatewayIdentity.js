import { createGatewayIdentity } from '../services/gatewayIdentity.js';

export function create({ config, identityProvider }) {
    if (typeof identityProvider === 'function') {
        return { identity: identityProvider() };
    }
    return {
        identity: createGatewayIdentity({
            ...config,
            transport: (input, init) => globalThis.fetch(input, init)
        })
    };
}
