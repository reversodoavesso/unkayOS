// @vitest-environment happy-dom
// tests/production-readiness.test.js - Phase 7 Production Readiness & Release Smoke Test
// Verifies that unkayOS 2.0 bundle, all 13 ecosystem apps, Wasm kernel, and Nginx configurations meet release criteria

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const distDir = resolve(projectRoot, 'dist');

describe('unkayOS 2.0 Production Readiness (Phase 7)', () => {
    it('should have compiled distribution directory with critical assets', () => {
        expect(existsSync(distDir)).toBe(true);
        expect(existsSync(resolve(distDir, 'index.html'))).toBe(true);
        expect(existsSync(resolve(distDir, 'apps/apps.json'))).toBe(true);
    });

    it('should include compiled WebAssembly microkernel and Web Worker in distribution', () => {
        const wasmPkgDir = resolve(distDir, 'core/wasm/pkg');
        expect(existsSync(wasmPkgDir)).toBe(true);

        const wasmBinary = resolve(wasmPkgDir, 'unkay_kernel_bg.wasm');
        expect(existsSync(wasmBinary)).toBe(true);
        const wasmStat = readFileSync(wasmBinary);
        expect(wasmStat.length).toBeGreaterThan(1000); // Valid Wasm binary

        const kernelWorker = resolve(distDir, 'core/kernel.worker.js');
        expect(existsSync(kernelWorker)).toBe(true);
    });

    it('should contain all declared ecosystem applications in distribution', () => {
        const appsJsonPath = resolve(distDir, 'apps/apps.json');
        const appsConfig = JSON.parse(readFileSync(appsJsonPath, 'utf8'));

        expect(appsConfig.app_configs.length).toBe(13);

        const requiredApps = [
            'terminal',
            'about',
            'clock',
            'system-info',
            'taskbar',
            'theorb',
            'process-manager',
            'file-manager',
            'text-editor',
            'store',
            'openui',
            'user-profile',
            'settings'
        ];

        for (const appId of requiredApps) {
            const entry = appsConfig.app_configs.find(a => a.id === appId);
            expect(entry, `App '${appId}' should be registered in apps.json`).toBeTruthy();

            const folderName = entry.path.replace(/^\/apps\//, '').replace(/\/$/, '');
            const appFolder = resolve(distDir, 'apps', folderName);
            expect(existsSync(appFolder), `Folder '${folderName}' for '${appId}' should exist in dist/apps/`).toBe(true);

            // Verify app manifest/config
            const configPath = resolve(appFolder, 'config.json');
            expect(existsSync(configPath), `config.json should exist for '${appId}'`).toBe(true);
        }
    });

    it('should configure Nginx with required COOP/COEP and Wasm security headers', () => {
        const nginxConfPath = resolve(projectRoot, 'nginx.conf');
        expect(existsSync(nginxConfPath)).toBe(true);
        const nginxConf = readFileSync(nginxConfPath, 'utf8');

        // Required headers for SharedArrayBuffer, Wasm multithreading & OPFS
        expect(nginxConf).toContain('Cross-Origin-Opener-Policy "same-origin"');
        expect(nginxConf).toContain('Cross-Origin-Embedder-Policy "credentialless"');
        expect(nginxConf).toContain('application/wasm');
        expect(nginxConf).toContain('/health');
    });

    it('should have multi-stage production Dockerfile and Compose configuration', () => {
        const dockerfilePath = resolve(projectRoot, 'Dockerfile');
        expect(existsSync(dockerfilePath)).toBe(true);
        const dockerfile = readFileSync(dockerfilePath, 'utf8');

        expect(dockerfile).toContain('FROM node:22-alpine AS builder');
        expect(dockerfile).toContain('FROM nginx:alpine');
        expect(dockerfile).toContain('COPY --from=builder /app/dist .');

        const composePath = resolve(projectRoot, '..', 'docker-compose.yml');
        expect(existsSync(composePath)).toBe(true);
        const compose = readFileSync(composePath, 'utf8');
        expect(compose).toContain('rda-net');
        expect(compose).toContain('healthcheck');
    });
});
