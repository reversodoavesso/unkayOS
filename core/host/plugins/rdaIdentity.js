import { AuthSystem } from '../../AuthSystem.js';
export async function create({ identityProvider }) {
    return { identity: typeof identityProvider === 'function' ? await identityProvider() : new AuthSystem() };
}
