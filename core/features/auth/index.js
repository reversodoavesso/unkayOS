// core/features/auth/index.js
// Authentication facade. Providers own identity; an injected policy owns tier mapping.

import { defineFeature } from '../../kernel/index.js';

/** Safe compatibility tier without any provider role interpretation. @param {any} user */
export function mapUserTier(user) {
    return user ? 'standard' : 'guest';
}

/**
 * @param {object} [options]
 * @param {{ getCurrentUser?(): any, getAuthToken?(): string | null, login?(): Promise<any>, logout?(): Promise<any> } | null} [options.provider]
 * @param {(user: any) => string} [options.mapTier]
 */
export function createAuth(options = {}) {
    const { provider = null, mapTier = mapUserTier } = options;

    return {
        getUser() {
            return provider?.getCurrentUser?.() || null;
        },
        getToken() {
            return provider?.getAuthToken?.() || null;
        },
        getTier() {
            return mapTier(this.getUser());
        },
        async login() {
            return provider?.login?.();
        },
        async logout() {
            return provider?.logout?.();
        }
    };
}

export const authFeature = defineFeature({
    id: 'auth',
    version: '1.0.0',
    description: 'Authentication facade over an injected identity provider.',
    provides: ['auth'],
    setup: ({ config }) => ({ auth: createAuth(config) })
});
