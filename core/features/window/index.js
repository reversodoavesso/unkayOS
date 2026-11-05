// core/features/window/index.js
// Window operations facade. The host supplies a controller; this feature never
// touches the DOM directly.

import { defineFeature } from '../../kernel/index.js';

/**
 * @typedef {object} WindowController
 * @property {(title: string) => void} [setTitle]
 * @property {(width: number | string, height: number | string) => void} [setSize]
 * @property {() => void} [minimize]
 * @property {() => void} [maximize]
 * @property {(zone: string) => void} [snap]
 * @property {() => void} [center]
 * @property {() => void} [close]
 * @property {() => Promise<unknown> | unknown} [toggleFullscreen]
 * @property {() => boolean} [isFullscreen]
 */

/**
 * @param {object} [options]
 * @param {WindowController | null} [options.controller]
 */
export function createWindow(options = {}) {
    const controller = options.controller || {};

    return {
        /** @param {string} title */
        setTitle: title => controller.setTitle?.(title),
        /** @param {number | string} width @param {number | string} height */
        setSize: (width, height) => controller.setSize?.(width, height),
        minimize: () => controller.minimize?.(),
        maximize: () => controller.maximize?.(),
        /** @param {string} zone */
        snap: zone => controller.snap?.(zone),
        center: () => controller.center?.(),
        close: () => controller.close?.(),
        async toggleFullscreen() {
            return controller.toggleFullscreen?.();
        },
        isFullscreen: () => Boolean(controller.isFullscreen?.())
    };
}

export const windowFeature = defineFeature({
    id: 'window',
    version: '1.0.0',
    description: 'Window controls facade over a host-supplied controller.',
    provides: ['window'],
    setup: ({ config }) => ({ window: createWindow(config) })
});
