// core/kernel/events.js
// Minimal event emitter used by the feature kernel. No DOM, no globals.

/**
 * @typedef {(payload: unknown) => void} EventListener
 */

/**
 * Creates an isolated event emitter.
 *
 * @param {object} [options]
 * @param {(error: unknown, context: { event: string }) => void} [options.onListenerError]
 * @returns {{
 *   on: (event: string, listener: EventListener) => () => void,
 *   once: (event: string, listener: EventListener) => () => void,
 *   off: (event: string, listener: EventListener) => void,
 *   emit: (event: string, payload?: unknown) => number,
 *   clear: () => void,
 *   listenerCount: (event: string) => number
 * }}
 */
export function createEventEmitter(options = {}) {
    const { onListenerError } = options;
    /** @type {Map<string, Array<{ listener: EventListener, once: boolean }>>} */
    const listeners = new Map();

    /** @param {string} event @param {EventListener} listener @param {boolean} once */
    function add(event, listener, once) {
        if (typeof event !== 'string' || event.length === 0) {
            throw new TypeError('Event name must be a non-empty string.');
        }
        if (typeof listener !== 'function') {
            throw new TypeError('Event listener must be a function.');
        }
        const entries = listeners.get(event) || [];
        entries.push({ listener, once });
        listeners.set(event, entries);
        return () => off(event, listener);
    }

    /** @param {string} event @param {EventListener} listener */
    function off(event, listener) {
        const entries = listeners.get(event);
        if (!entries) return;
        const remaining = entries.filter(entry => entry.listener !== listener);
        if (remaining.length === 0) {
            listeners.delete(event);
        } else {
            listeners.set(event, remaining);
        }
    }

    /** @param {string} event @param {unknown} [payload] */
    function emit(event, payload) {
        const entries = listeners.get(event);
        if (!entries || entries.length === 0) return 0;

        const snapshot = entries.slice();
        let delivered = 0;
        for (const entry of snapshot) {
            if (entry.once) off(event, entry.listener);
            try {
                entry.listener(payload);
                delivered += 1;
            } catch (error) {
                if (onListenerError) {
                    onListenerError(error, { event });
                }
            }
        }
        return delivered;
    }

    function clear() {
        listeners.clear();
    }

    /** @param {string} event */
    function listenerCount(event) {
        return listeners.get(event)?.length || 0;
    }

    return {
        on: (event, listener) => add(event, listener, false),
        once: (event, listener) => add(event, listener, true),
        off,
        emit,
        clear,
        listenerCount
    };
}
