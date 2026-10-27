// core/sdk/AppPackageLoader.js - unkayOS 2.0 .unkayapp Package Loader & Validator
// Implements M1 from docs/plans/unkayos-marketplace-app-curation.md

export const VALID_APP_TYPES = ['native', 'openui'];
export const VALID_RUNTIME_PROFILES = ['client-only', 'client-server', 'containerized', 'external-gateway'];
export const VALID_CATEGORIES = ['audio', 'media', 'productivity', 'utilities', 'ai', 'developer'];
export const VALID_TIERS = ['guest', 'standard', 'adept', 'sysadmin', 'demiurge'];
export const INSTALLABLE_PERMISSIONS = ['storage:local', 'auth:session', 'ai:generate'];
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function compareVersions(left, right) {
    const a = SEMVER.exec(left), b = SEMVER.exec(right);
    if (!a || !b) return 0;
    for (let i = 1; i <= 3; i++) {
        if (BigInt(a[i]) !== BigInt(b[i])) return BigInt(a[i]) > BigInt(b[i]) ? 1 : -1;
    }
    if (!a[4] || !b[4]) return a[4] === b[4] ? 0 : a[4] ? -1 : 1;
    const ap = a[4].split('.'), bp = b[4].split('.');
    for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
        if (ap[i] === bp[i]) continue;
        if (ap[i] === undefined || bp[i] === undefined) return ap[i] === undefined ? -1 : 1;
        const an = /^\d+$/.test(ap[i]), bn = /^\d+$/.test(bp[i]);
        if (an && bn) return BigInt(ap[i]) > BigInt(bp[i]) ? 1 : -1;
        if (an !== bn) return an ? -1 : 1;
        return ap[i] > bp[i] ? 1 : -1;
    }
    return 0;
}

export class AppPackageLoader {
    /**
     * Validates manifest JSON object against unkayOS 2.0 App Specification
     * @param {object} manifest - Parsed manifest.json
     * @returns {{ valid: boolean, errors: string[] }}
     */
    static validateManifest(manifest) {
        const errors = [];

        if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
            return { valid: false, errors: ['Manifest must be a non-null object'] };
        }

        if (typeof manifest.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(manifest.id)) {
            errors.push("Field 'id' is required and must be alphanumeric with hyphens/underscores");
        }

        if (!manifest.name || typeof manifest.name !== 'string' || manifest.name.trim().length === 0) {
            errors.push("Field 'name' is required");
        }

        if (typeof manifest.version !== 'string' || !SEMVER.test(manifest.version)) {
            errors.push("Field 'version' must follow SemVer (e.g. 1.0.0)");
        }

        if (manifest.type && !VALID_APP_TYPES.includes(manifest.type)) {
            errors.push(`Field 'type' must be one of: ${VALID_APP_TYPES.join(', ')}`);
        }

        if (!manifest.runtime_profile || !VALID_RUNTIME_PROFILES.includes(manifest.runtime_profile)) {
            errors.push(`Field 'runtime_profile' is required and must be one of: ${VALID_RUNTIME_PROFILES.join(', ')}`);
        }

        if (manifest.category && !VALID_CATEGORIES.includes(manifest.category)) {
            errors.push(`Field 'category' must be one of: ${VALID_CATEGORIES.join(', ')}`);
        }

        if (manifest.required_tier && !VALID_TIERS.includes(manifest.required_tier)) {
            errors.push(`Field 'required_tier' must be one of: ${VALID_TIERS.join(', ')}`);
        }

        if ((!manifest.type || manifest.type === 'native') && !manifest.entrypoint && !manifest.main) {
            errors.push("Native apps must specify an 'entrypoint' (e.g. main.js)");
        }

        for (const key of ['permissions', 'external_providers']) {
            if (manifest[key] !== undefined && (!Array.isArray(manifest[key]) || manifest[key].some(value => typeof value !== 'string'))) {
                errors.push(`Field '${key}' must be an array of strings`);
            }
        }
        if (manifest.window !== undefined && (!manifest.window || typeof manifest.window !== 'object' || Array.isArray(manifest.window))) {
            errors.push("Field 'window' must be an object");
        }
        for (const key of ['width', 'height', 'minWidth', 'minHeight']) {
            if (manifest.window?.[key] !== undefined && (!Number.isFinite(manifest.window[key]) || manifest.window[key] < 1 || manifest.window[key] > 8192)) {
                errors.push(`Invalid window ${key}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Parse and normalize an application package
     * @param {string|object} raw - JSON string or object
     * @returns {object} Normalized package definition
     */
    static loadPackage(raw) {
        const manifest = typeof raw === 'string' ? JSON.parse(raw) : raw;

        const validation = this.validateManifest(manifest);
        if (!validation.valid) {
            throw new Error(`Invalid .unkayapp package: ${validation.errors.join('; ')}`);
        }

        return {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            type: manifest.type || 'native',
            runtimeProfile: manifest.runtime_profile,
            category: manifest.category || 'utilities',
            requiredTier: manifest.required_tier || 'guest',
            description: manifest.description || '',
            icon: manifest.icon || 'icon.svg',
            entrypoint: manifest.entrypoint || manifest.main || 'main.js',
            permissions: Array.isArray(manifest.permissions) ? manifest.permissions : [],
            externalProviders: Array.isArray(manifest.external_providers) ? manifest.external_providers : [],
            window: {
                width: manifest.window?.width || 640,
                height: manifest.window?.height || 480,
                resizable: manifest.window?.resizable !== false,
                minWidth: manifest.window?.minWidth || 320,
                minHeight: manifest.window?.minHeight || 240,
            },
            raw: manifest
        };
    }
}
