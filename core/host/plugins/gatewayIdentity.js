import { createGatewayIdentity } from '../services/gatewayIdentity.js';

export function create({ config }) {
    return {
        identity: createGatewayIdentity({
            ...config,
            transport: (input, init) => globalThis.fetch(input, init)
        })
    };
}
