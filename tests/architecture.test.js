import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AGNOSTIC_DIRS = ['core/kernel', 'core/features'].map(dir => resolve(PROJECT_ROOT, dir));

const HOST_GLOBAL_PATTERNS = [
    { pattern: /\bwindow\s*[.[]/, label: 'window' },
    { pattern: /\bdocument\s*[.[]/, label: 'document' },
    { pattern: /\blocalStorage\s*[.[]/, label: 'localStorage' },
    { pattern: /\bsessionStorage\s*[.[]/, label: 'sessionStorage' },
    { pattern: /\bfetch\s*\(/, label: 'fetch()' },
    { pattern: /\btypeof\s+(?:fetch|window|document|localStorage|sessionStorage)\b/, label: 'implicit host fallback' },
    { pattern: /\bglobalThis\s*[.[]/, label: 'globalThis host access' }
];

function listJavaScriptFiles(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) return listJavaScriptFiles(fullPath);
        return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
    });
}

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
}

function importSpecifiers(source) {
    const specifiers = [];
    for (const match of source.matchAll(/^\s*import\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/gm)) {
        specifiers.push(match[1]);
    }
    for (const match of source.matchAll(/^\s*export\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/gm)) {
        specifiers.push(match[1]);
    }
    return specifiers;
}

function isInside(filePath, dir) {
    return filePath === dir || filePath.startsWith(dir + sep);
}

describe('architecture guard: host-agnostic kernel and features', () => {
    const files = AGNOSTIC_DIRS.flatMap(listJavaScriptFiles);

    it('finds the agnostic modules to scan', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    it('keeps identity vendor claims and service endpoints out of generic features', () => {
        const violations = files.filter(file => /urn:zitadel|reversodoavesso|\/api\/v1\/ai|MinioSyncDriver/.test(stripComments(readFileSync(file, 'utf8'))));
        expect(violations).toEqual([]);
    });

    it('only imports modules inside core/kernel or core/features', () => {
        const violations = [];

        for (const file of files) {
            const source = stripComments(readFileSync(file, 'utf8'));
            for (const specifier of importSpecifiers(source)) {
                if (!specifier.startsWith('.')) {
                    violations.push(`${relative(PROJECT_ROOT, file)} imports bare specifier "${specifier}"`);
                    continue;
                }
                const target = resolve(dirname(file), specifier);
                if (!AGNOSTIC_DIRS.some(dir => isInside(target, dir))) {
                    violations.push(`${relative(PROJECT_ROOT, file)} imports host module "${specifier}"`);
                }
            }
        }

        expect(violations).toEqual([]);
    });

    it('does not access DOM, storage or fetch globals', () => {
        const violations = [];

        for (const file of files) {
            const source = stripComments(readFileSync(file, 'utf8'));
            for (const { pattern, label } of HOST_GLOBAL_PATTERNS) {
                if (pattern.test(source)) {
                    violations.push(`${relative(PROJECT_ROOT, file)} uses ${label}`);
                }
            }
        }

        expect(violations).toEqual([]);
    });
});
