// core/sdk/AppPackageLoader.js - unkayOS 2.0 .unkayapp Package Loader & Validator
// Implements M1 from docs/plans/unkayos-marketplace-app-curation.md

export const VALID_APP_TYPES = ['native', 'openui'];
export const VALID_RUNTIME_PROFILES = ['client-only', 'client-server', 'containerized', 'external-gateway'];
export const VALID_CATEGORIES = ['audio', 'media', 'productivity', 'utilities', 'ai'];
export const VALID_TIERS = ['guest', 'standard', 'adept', 'sysadmin', 'demiurge'];

export class AppPackageLoader {
    /**
     * Validates manifest JSON object against unkayOS 2.0 App Specification
     * @param {object} manifest - Parsed manifest.json
     * @returns {{ valid: boolean, errors: string[] }}
     */
    static validateManifest(manifest) {
        const errors = [];

        if (!manifest || typeof manifest !== 'object') {
            return { valid: false, errors: ['Manifest must be a non-null object'] };
        }

        if (!manifest.id || typeof manifest.id !== 'string' || !/^[a-z0-9-_]+$/.test(manifest.id)) {
            errors.push("Field 'id' is required and must be alphanumeric with hyphens/underscores");
        }

        if (!manifest.name || typeof manifest.name !== 'string' || manifest.name.trim().length === 0) {
            errors.push("Field 'name' is required");
        }

        if (!manifest.version || !/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(manifest.version)) {
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

        if (manifest.type === 'native' && !manifest.entrypoint && !manifest.main) {
            errors.push("Native apps must specify an 'entrypoint' (e.g. main.js)");
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
        let manifest = typeof raw === 'string' ? JSON.parse(raw) : raw;

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
