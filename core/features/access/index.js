// Decisions here are a UI/local facade. Remote resources enforce policy on the server.
const LOCAL_ACTIONS = new Set([
    'files.local.read', 'files.local.write', 'apps.local.launch',
    'settings.user.read', 'settings.user.write'
]);

export function createLocalAccess() {
    return Object.freeze({
        evaluate(action) {
            const allowed = LOCAL_ACTIONS.has(action);
            return Object.freeze({ allowed, reason: allowed ? 'LOCAL_ACTION' : 'DEFAULT_DENY', policyVersion: 'local-1' });
        }
    });
}

/** @param {{ provider?: { evaluate(action: string, resource?: object): any } | null }} [options] */
export function createAccess({ provider = null } = {}) {
    return Object.freeze({
        async evaluate(action, resource = {}) {
            if (!provider) return { allowed: false, reason: 'POLICY_UNAVAILABLE' };
            const result = await provider.evaluate(action, resource);
            return result?.allowed === true ? result : { ...result, allowed: false };
        },
        async can(action, resource = {}) {
            return (await this.evaluate(action, resource)).allowed === true;
        }
    });
}
