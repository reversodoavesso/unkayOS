// server/ai.mjs
// Server-side AI adapter. The browser alias is resolved here; upstream URLs,
// credentials, model names and quotas never reach the client. No silent
// fallback between providers is attempted.

export class GatewayError extends Error {
    /** @param {number} status @param {string} code @param {string} message */
    constructor(status, code, message) {
        super(message);
        this.name = 'GatewayError';
        this.status = status;
        this.code = code;
    }
}

/** @param {any} config */
export function createAiGateway({ config, fetchImpl = globalThis.fetch, timeoutMs }) {
    const ai = config.ai;
    if (!ai) throw new GatewayError(503, 'AI_DISABLED', 'IA não configurada neste servidor.');
    const defaultTimeout = timeoutMs ?? ai.timeoutMs ?? 30000;
    const maxMessages = ai.maxMessages ?? 64;
    const maxMessageChars = ai.maxMessageChars ?? 32000;

    /** @param {any} messages */
    function validateMessages(messages) {
        if (!Array.isArray(messages) || messages.length === 0 || messages.length > maxMessages) {
            throw new GatewayError(400, 'INVALID_MESSAGES', `Envie entre 1 e ${maxMessages} mensagens.`);
        }
        return messages.map(/** @param {any} message */ message => {
            const role = message?.role;
            const content = message?.content;
            if (!['system', 'user', 'assistant'].includes(role)) {
                throw new GatewayError(400, 'INVALID_MESSAGES', 'Papel de mensagem inválido.');
            }
            if (typeof content !== 'string' || content.length === 0 || content.length > maxMessageChars) {
                throw new GatewayError(400, 'INVALID_MESSAGES', 'Conteúdo de mensagem inválido.');
            }
            return { role, content };
        });
    }

    /** @param {string | undefined} alias */
    function resolveModel(alias) {
        const name = alias || ai.defaultModel || Object.keys(ai.models)[0];
        const model = Object.hasOwn(ai.models, name) ? ai.models[name] : null;
        if (!model) throw new GatewayError(400, 'MODEL_NOT_FOUND', 'Modelo público desconhecido.');
        const upstream = Object.hasOwn(ai.upstreams, model.upstream) ? ai.upstreams[model.upstream] : null;
        if (!upstream) throw new GatewayError(503, 'UPSTREAM_UNAVAILABLE', 'Fornecedor de IA indisponível.');
        return { name, model, upstream };
    }

    /** @param {any} target @param {AbortSignal | undefined} signal */
    function upstreamRequest(target, stream, messages, signal) {
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            target.timedOut = true;
            controller.abort(new DOMException('AI request timeout.', 'TimeoutError'));
        }, defaultTimeout);
        const abort = () => controller.abort(signal?.reason);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        target.cleanup = () => {
            clearTimeout(timeout);
            signal?.removeEventListener('abort', abort);
        };
        return fetchImpl(`${String(target.upstream.baseUrl).replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            redirect: 'error',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${target.apiKey}`,
                Accept: stream ? 'text/event-stream' : 'application/json'
            },
            body: JSON.stringify({
                model: target.model.model,
                messages,
                stream: Boolean(stream),
                ...(target.model.maxOutputTokens ? { max_tokens: target.model.maxOutputTokens } : {}),
                ...(typeof target.model.temperature === 'number' ? { temperature: target.model.temperature } : {})
            })
        });
    }

    /**
     * Map transport failures to stable codes. Never retries, never falls back.
     * @param {unknown} error
     * @param {AbortSignal | undefined} signal
     * @param {any} [target]
     */
    function normalizeError(error, signal, target) {
        if (error instanceof GatewayError) return error;
        if (target?.timedOut === true) {
            return new GatewayError(504, 'TIMEOUT', 'Fornecedor de IA não respondeu dentro do prazo.');
        }
        if (signal?.aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
            return new GatewayError(499, 'CANCELLED', 'Requisição de IA cancelada.');
        }
        return new GatewayError(502, 'UPSTREAM_ERROR', 'Falha ao consultar o fornecedor de IA.');
    }

    /** @param {string} alias @param {any} messages @param {{ signal?: AbortSignal, apiKey: string }} options */
    async function chat(alias, messages, options) {
        const target = { ...resolveModel(alias), apiKey: options.apiKey };
        const valid = validateMessages(messages);
        try {
            let response;
            try {
                response = await upstreamRequest(target, false, valid, options.signal);
            } catch (error) {
                throw normalizeError(error, options.signal, target);
            }
            if (!response.ok) {
                await response.body?.cancel?.().catch(() => {});
                throw new GatewayError(502, 'UPSTREAM_ERROR', `Fornecedor de IA respondeu HTTP ${response.status}.`);
            }
            let payload;
            try {
                payload = await response.json();
            } catch {
                throw new GatewayError(502, 'PROTOCOL_ERROR', 'Resposta de IA inválida.');
            }
            const reply = payload?.choices?.[0]?.message?.content;
            if (typeof reply !== 'string') throw new GatewayError(502, 'PROTOCOL_ERROR', 'Resposta de IA sem conteúdo textual.');
            return reply;
        } finally {
            target.cleanup?.();
        }
    }

    /**
     * Translate an OpenAI-compatible SSE stream into plain UTF-8 chunks, which is
     * the protocol the browser adapter consumes.
     *
     * @param {string} alias
     * @param {any} messages
     * @param {(chunk: string) => void} onChunk
     * @param {{ signal?: AbortSignal, apiKey: string }} options
     */
    async function stream(alias, messages, onChunk, options) {
        const target = { ...resolveModel(alias), apiKey: options.apiKey };
        const valid = validateMessages(messages);
        let response;
        try {
            response = await upstreamRequest(target, true, valid, options.signal);
        } catch (error) {
            throw normalizeError(error, options.signal, target);
        }
        try {
            if (!response.ok) {
                await response.body?.cancel?.().catch(() => {});
                throw new GatewayError(502, 'UPSTREAM_ERROR', `Fornecedor de IA respondeu HTTP ${response.status}.`);
            }
            const contentType = response.headers?.get('content-type') || '';
            if (!response.body || !/^text\/event-stream(?:;|$)/i.test(contentType)) {
                await response.body?.cancel?.().catch(() => {});
                throw new GatewayError(502, 'PROTOCOL_ERROR', 'Fornecedor de IA não retornou event stream.');
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            const cancel = () => { void reader.cancel().catch(() => {}); };
            options.signal?.addEventListener('abort', cancel, { once: true });
            try {
                while (true) {
                    if (options.signal?.aborted) throw new GatewayError(499, 'CANCELLED', 'Requisição de IA cancelada.');
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    let newline;
                    while ((newline = buffer.indexOf('\n')) >= 0) {
                        const line = buffer.slice(0, newline).replace(/\r$/, '');
                        buffer = buffer.slice(newline + 1);
                        if (!line.startsWith('data:')) continue;
                        const data = line.slice(5).trim();
                        if (!data) continue;
                        if (data === '[DONE]') return;
                        let event;
                        try {
                            event = JSON.parse(data);
                        } catch {
                            continue;
                        }
                        const delta = event?.choices?.[0]?.delta?.content;
                        if (typeof delta === 'string' && delta.length > 0) onChunk(delta);
                    }
                }
            } finally {
                options.signal?.removeEventListener('abort', cancel);
                try { await reader.cancel(); } catch { /* Preserve the original error. */ }
                reader.releaseLock();
            }
        } catch (error) {
            throw normalizeError(error, options.signal, target);
        } finally {
            target.cleanup?.();
        }
    }

    return { chat, stream, validateMessages, resolveModel, models: Object.freeze(Object.keys(ai.models)) };
}
