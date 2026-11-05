import { createLocalAccess } from '../../features/access/index.js';

const TIERS = ['demiurge', 'sysadmin', 'adept', 'standard'];
export function create({ config }) {
    return { access: Object.freeze({
        ...createLocalAccess(),
        getTier(user) {
            if (!user) return 'guest';
            const roles = [...(Array.isArray(user.roles) ? user.roles : []), user.role].filter(role => typeof role === 'string');
            return TIERS.find(tier => config.tierRoles[tier]?.some(role => roles.includes(role))) || 'standard';
        }
    }) };
}
