// eslint.config.js — ESLint v9 flat config for unkayOS (ES modules)

/** @type {import('eslint').Linter.Config[]} */
export default [
    // Global ignores
    {
        ignores: ['node_modules/**', 'dist/**', 'coverage/**', '.kiro/**', 'core/wasm/pkg/**', 'core/vendor/**']
    },

    // Base config for all JS files
    {
        files: ['**/*.js', '**/*.mjs'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                // Browser globals
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearTimeout: 'readonly',
                clearInterval: 'readonly',
                alert: 'readonly',
                fetch: 'readonly',
                crypto: 'readonly',
                localStorage: 'readonly',
                indexedDB: 'readonly',
                HTMLElement: 'readonly',
                NodeList: 'readonly',
                Element: 'readonly',
                Event: 'readonly',
                KeyboardEvent: 'readonly',
                MouseEvent: 'readonly',
                MutationObserver: 'readonly',
                ResizeObserver: 'readonly',
                IntersectionObserver: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                AbortController: 'readonly',
                ReadableStream: 'readonly',
                WebSocket: 'readonly',
                Blob: 'readonly',
                ArrayBuffer: 'readonly',
                Uint8Array: 'readonly',
                TextEncoder: 'readonly',
                TextDecoder: 'readonly',
                requestAnimationFrame: 'readonly',
                cancelAnimationFrame: 'readonly',
                performance: 'readonly',
                navigator: 'readonly',
                location: 'readonly',
                history: 'readonly',
                CustomEvent: 'readonly',
                DOMParser: 'readonly',
                XMLSerializer: 'readonly',
                Image: 'readonly',
                Audio: 'readonly',
                FileReader: 'readonly',
                FormData: 'readonly',
                Headers: 'readonly',
                Request: 'readonly',
                Response: 'readonly',
                Map: 'readonly',
                Set: 'readonly',
                WeakMap: 'readonly',
                WeakSet: 'readonly',
                Promise: 'readonly',
                Proxy: 'readonly',
                Reflect: 'readonly',
                Symbol: 'readonly',
                queueMicrotask: 'readonly',
                structuredClone: 'readonly',
                atob: 'readonly',
                btoa: 'readonly'
            }
        },
        rules: {
            // Detect unused variables (Req 5.3)
            'no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_'
                }
            ],

            // Detect duplicate imports (Req 5.3)
            'no-duplicate-imports': 'error',

            // Disallow var, enforce const/let (Req 5.3)
            'no-var': 'error',

            // Prefer const when variable is never reassigned
            'prefer-const': 'warn'
        }
    },

    // Custom rule: detect document.querySelector usage in apps/ (Req 5.5)
    // Apps should use BaseApp's $() method for DOM scoping instead
    {
        files: ['apps/**/*.js'],
        rules: {
            'no-restricted-syntax': [
                'warn',
                {
                    selector: "CallExpression[callee.object.name='document'][callee.property.name='querySelector']",
                    message: 'Avoid document.querySelector in apps. Use this.$() from BaseApp for scoped DOM access.'
                },
                {
                    selector: "CallExpression[callee.object.name='document'][callee.property.name='querySelectorAll']",
                    message:
                        'Avoid document.querySelectorAll in apps. Use this.$$() from BaseApp for scoped DOM access.'
                }
            ]
        }
    }
];
