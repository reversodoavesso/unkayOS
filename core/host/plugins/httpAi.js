import { createHttpAi } from '../services/httpAi.js';

/** Read a non-HttpOnly cookie without exposing any other document state. */
function readCookie(name) {
    if (typeof document === 'undefined' || !document.cookie || !name) return '';
    for (const part of document.cookie.split(';')) {
        const index = part.indexOf('=');
        if (index < 1) continue;
        if (part.slice(0, index).trim() === name) {
            try {
                return decodeURIComponent(part.slice(index + 1).trim());
            } catch {
                return part.slice(index + 1).trim();
            }
        }
    }
    return '';
}

export function create({ config }) {
    // The BFF stores the CSRF token in a readable cookie; the session cookie stays
    // HttpOnly. Both names are explicit configuration, never discovered by probing.
    const getHeaders = config.csrfCookie && config.csrfHeader
        ? () => ({ [config.csrfHeader]: readCookie(config.csrfCookie) })
        : () => ({});
    return { ai: createHttpAi({
        transport: (input, init) => globalThis.fetch(input, init),
        promptPath: `${config.basePath}/chat`, streamPath: `${config.basePath}/chat/stream`,
        timeoutMs: config.timeoutMs,
        getHeaders
    }) };
}
