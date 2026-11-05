// server/policy.mjs
// Declarative authorization for the BFF. Deny by default, deny wins, unknown
// actions are not allowed, and remote services re-evaluate every operation.

import { deepFreeze } from './config.mjs';

/** @typedef {{ issuer: string, subject: string, id: string, groups: string[], mfa: boolean }} Principal */

/**
 * @param {string} action
 * @param {string} pattern
 */
export function actionMatches(action, pattern) {
    if (pattern === action) return true;
    if (!pattern.endsWith('.*')) return false;
    const prefix = pattern.slice(0, -2);
    return action === prefix || action.startsWith(`${prefix}.`);
}

/** @param {Principal} principal @param {any} rule */
function matchesRule(principal, action, resource, rule) {
    if (!rule.actions.some(pattern => actionMatches(action, pattern))) return false;
    if (rule.subjects && !rule.subjects.includes(principal.subject)) return false;
    if (rule.issuers && !rule.issuers.includes(principal.issuer)) return false;
    if (rule.groups && !rule.groups.some(group => principal.groups.includes(group))) return false;
    if (rule.resourceKinds && !rule.resourceKinds.includes(resource.kind)) return false;
    if (rule.models && !rule.models.includes(resource.model)) return false;
    return true;
}

/**
 * @param {any} document Validated access policy.
 */
export function createPolicy(document) {
    const policy = deepFreeze(document);
    const rules = policy.rules;

    /**
     * @param {object} input
     * @param {Principal} input.principal
     * @param {string} input.action
     * @param {{ kind?: string, model?: string, ownerId?: string }} [input.resource]
     */
    function evaluate({ principal, action, resource = {} }) {
        /** @type {{ allowed: boolean, reason: string, policyVersion: string, ruleId?: string, restrictions?: object }} */
        const denied = reason => ({ allowed: false, reason, policyVersion: policy.policyVersion });
        if (!principal || typeof principal !== 'object' || typeof principal.id !== 'string' || !principal.id) {
            return Object.freeze(denied('UNAUTHENTICATED'));
        }
        if (typeof action !== 'string' || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(action)) {
            return Object.freeze(denied('ACTION_INVALID'));
        }
        const groups = Array.isArray(principal.groups) ? principal.groups : [];
        const normalized = /** @type {Principal} */ ({ ...principal, groups });

        // Explicit deny always prevails, including over MFA and ownership.
        for (const rule of rules) {
            if (rule.effect === 'deny' && matchesRule(normalized, action, resource, rule)) {
                return Object.freeze(denied('DENY_RULE'));
            }
        }
        /** @type {any[]} */
        const allows = [];
        for (const rule of rules) {
            if (rule.effect === 'allow' && matchesRule(normalized, action, resource, rule)) allows.push(rule);
        }
        if (allows.length === 0) return Object.freeze(denied('DEFAULT_DENY'));
        // Ownership and MFA are conditions of an allow rule, not global denials:
        // another satisfied grant may still authorize the operation.
        let firstBlockReason = null;
        /** @type {any[]} */
        const satisfied = [];
        for (const rule of allows) {
            if (rule.ownership === 'required' && resource.ownerId !== principal.id) {
                firstBlockReason ||= 'FORBIDDEN_OWNERSHIP';
                continue;
            }
            if (rule.requireMfa === true && principal.mfa !== true) {
                firstBlockReason ||= 'MFA_REQUIRED';
                continue;
            }
            satisfied.push(rule);
        }
        if (satisfied.length === 0) return Object.freeze(denied(firstBlockReason || 'DEFAULT_DENY'));
        const limits = satisfied
            .map(rule => rule.requestsPerMinute)
            .filter(value => typeof value === 'number');
        const restrictions = limits.length > 0 ? { requestsPerMinute: Math.min(...limits) } : {};
        return Object.freeze({
            allowed: true,
            reason: 'ALLOW',
            policyVersion: policy.policyVersion,
            ruleId: satisfied[0].id,
            restrictions: Object.freeze(restrictions)
        });
    }

    return Object.freeze({ version: policy.policyVersion, evaluate });
}
