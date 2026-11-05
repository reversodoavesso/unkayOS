// HTTP protocol adapter, not an identity provider. Public config never supplies credentials.
export function createHttpAi({ transport, promptPath, streamPath, timeoutMs = 30000, getHeaders = () => ({}) }) {
    const pending = new Set();
    let stopped = false;

    async function request(path, messages, options, consume) {
        if (stopped) throw Object.assign(new Error('AI adapter stopped.'), { code: 'CAPABILITY_UNAVAILABLE' });
        const controller = new AbortController();
        pending.add(controller);
        const abort = () => controller.abort(options.signal?.reason);
        const timer = setTimeout(() => controller.abort(new DOMException('AI request timeout.', 'TimeoutError')), timeoutMs);
        options.signal?.addEventListener('abort', abort, { once: true });
        if (options.signal?.aborted) abort();
        try {
            controller.signal.throwIfAborted();
            const response = await transport(path, {
                method: 'POST', credentials: 'same-origin', redirect: 'error',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json', ...getHeaders() },
                body: JSON.stringify({ messages })
            });
            if (!response.ok) {
                await response.body?.cancel().catch(() => {});
                const code = ({ 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 429: 'QUOTA_EXCEEDED' })[response.status] || 'UPSTREAM_ERROR';
                throw Object.assign(new Error(`AI gateway returned HTTP ${response.status}.`), { code });
            }
            return await consume(response, controller.signal);
        } catch (error) {
            if (controller.signal.aborted) {
                const code = controller.signal.reason?.name === 'TimeoutError' ? 'TIMEOUT' : 'CANCELLED';
                throw Object.assign(new Error(code === 'TIMEOUT' ? 'AI request timed out.' : 'AI request cancelled.'), { code });
            }
            throw error;
        } finally {
            clearTimeout(timer);
            options.signal?.removeEventListener('abort', abort);
            pending.delete(controller);
        }
    }

    return {
        prompt(messages, options = {}) {
            return request(promptPath, messages, options, async response => {
                let data;
                try { data = await response.json(); } catch {
                    throw Object.assign(new Error('Invalid AI reply.'), { code: 'PROTOCOL_ERROR' });
                }
                const reply = data.reply ?? data.content;
                if (typeof reply !== 'string') throw Object.assign(new Error('Invalid AI reply.'), { code: 'PROTOCOL_ERROR' });
                return reply;
            });
        },
        stream(messages, onChunk, options = {}) {
            return request(streamPath, messages, options, async (response, signal) => {
                if (!response.body) throw Object.assign(new Error('Missing AI stream.'), { code: 'PROTOCOL_ERROR' });
                const contentType = response.headers?.get('content-type') || '';
                if (contentType && !/^(?:text\/plain|application\/octet-stream)(?:;|$)/i.test(contentType)) {
                    await response.body.cancel().catch(() => {});
                    throw Object.assign(new Error('AI adapter expects a plain-text stream.'), { code: 'PROTOCOL_ERROR' });
                }
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                const cancel = () => { void reader.cancel().catch(() => {}); };
                signal.addEventListener('abort', cancel, { once: true });
                try {
                    while (true) {
                        signal.throwIfAborted();
                        const { done, value } = await reader.read();
                        signal.throwIfAborted();
                        if (done) break;
                        const chunk = decoder.decode(value, { stream: true });
                        if (chunk) onChunk(chunk);
                    }
                    const tail = decoder.decode();
                    if (tail) onChunk(tail);
                } finally {
                    signal.removeEventListener('abort', cancel);
                    try { await reader.cancel(); } catch { /* Preserve the operation's original error. */ }
                    reader.releaseLock();
                }
            });
        },
        destroy() {
            stopped = true;
            for (const controller of pending) controller.abort();
        }
    };
}
