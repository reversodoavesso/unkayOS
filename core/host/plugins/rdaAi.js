import { createHttpAi } from '../services/httpAi.js';
export function create({ context, deployment }) {
    const auth = () => context.require(deployment.bindings.identity);
    return { ai: createHttpAi({
        transport: (input, init) => globalThis.fetch(input, init),
        promptPath: '/api/v1/ai/chat', streamPath: '/api/v1/ai/chat/stream',
        getHeaders: () => {
            const token = auth().getAuthToken();
            return token ? { Authorization: `Bearer ${token}` } : {};
        }
    }) };
}
