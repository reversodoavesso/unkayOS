// server/static.mjs
// Optional static delivery for the same-origin deployment. Used when the
// gateway is also the web server; nginx or another proxy can serve the SPA
// instead. Path traversal and unknown asset types are rejected.

import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const MIME = Object.freeze({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.wasm': 'application/wasm',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.map': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.pdf': 'application/pdf'
});

/**
 * @param {{ root: string, index?: string }} options
 */
export function createStaticHandler({ root, index = 'index.html' }) {
    const base = resolve(root);

    /** @param {string} pathname */
    function resolveFile(pathname) {
        let decoded;
        try {
            decoded = decodeURIComponent(pathname);
        } catch {
            return null;
        }
        if (decoded.includes('\0')) return null;
        const target = resolve(base, decoded.replace(/^\/+/, ''));
        if (target !== base && !target.startsWith(`${base}${sep}`)) return null;
        return target;
    }

    /**
     * @param {import('node:http').IncomingMessage} req
     * @param {import('node:http').ServerResponse} res
     * @param {URL} url
     * @returns {Promise<boolean>} true when the response was written.
     */
    return async function serveStatic(req, res, url) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return false;
        let target = resolveFile(url.pathname);
        if (!target) return false;
        let info = await stat(target).catch(() => null);
        if (info?.isDirectory()) {
            target = resolve(target, index);
            info = await stat(target).catch(() => null);
        }
        if (!info?.isFile()) {
            // Client-side routes fall back to the shell; missing assets do not.
            if (extname(url.pathname)) return false;
            target = resolve(base, index);
            info = await stat(target).catch(() => null);
            if (!info?.isFile()) return false;
        }
        const data = await readFile(target).catch(() => null);
        if (!data) return false;
        const isHashedAsset = url.pathname.startsWith('/assets/');
        const isConfig = url.pathname.startsWith('/config/');
        res.writeHead(200, {
            'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
            'Content-Length': data.length,
            'Cache-Control': isConfig ? 'no-store' : (isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache'),
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer'
        });
        res.end(req.method === 'HEAD' ? undefined : data);
        return true;
    };
}
