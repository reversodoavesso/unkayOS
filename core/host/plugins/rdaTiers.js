// RDA compatibility policy. Never imported by generic features or SDK.
const ADEPT_ROLES = new Set([
    'artificer',
    'abyssal',
    'weaver',
    'sentinel',
    'chronicler',
    'envoy',
    'hierophant',
    'eminence',
    'oathkeeper'
]);

/**
 * Maps an RDA user (with roles or Zitadel role claims) to an access tier.
 *
 * @param {any} user
 * @returns {'guest' | 'standard' | 'adept' | 'sysadmin' | 'demiurge'}
 */
export function mapRdaTier(user) {
    if (!user) return 'guest';

    const claims = user.roles || user['urn:zitadel:iam:org:project:roles'] || [];
    const roles = [...(Array.isArray(claims) ? claims : Object.keys(claims)), user.role].filter(Boolean);

    if (roles.includes('demiurge')) return 'demiurge';
    if (roles.includes('sysadmin') || roles.includes('architect') || roles.includes('archon')) return 'sysadmin';
    if (roles.includes('adept') || roles.includes('curator')) return 'adept';
    if (roles.some(role => ADEPT_ROLES.has(role))) return 'adept';
    if (roles.includes('standard') || roles.includes('initiate')) return 'standard';
    return 'standard';
}

