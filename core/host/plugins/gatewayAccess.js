import { createGatewayAccess } from '../services/gatewayAccess.js';

export function create({ config }) {
    return {
        access: createGatewayAccess({
            ...config,
            transport: (input, init) => globalThis.fetch(input, init)
        })
    };
}
