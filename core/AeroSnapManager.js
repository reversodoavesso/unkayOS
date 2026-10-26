// core/AeroSnapManager.js - unkayOS 2.0 Aero Snap System
// Handles window snapping to screen edges (50% left, 50% right, full maximize)

export class AeroSnapManager {
    constructor() {
        this.previewElement = null;
        this.currentPreview = 'none';
        this.threshold = 24; // pixels from edge
    }

    /**
     * Determine snap zone from pointer coordinates
     * @param {number} clientX
     * @param {number} clientY
     * @returns {'none'|'left'|'right'|'top'}
     */
    checkSnapZone(clientX, clientY) {
        if (typeof document !== 'undefined' && document.documentElement.dataset.aeroSnap === 'false') return 'none';
        const width = typeof window !== 'undefined' ? window.innerWidth : 1920;

        if (clientY <= this.threshold) {
            return 'top';
        }
        if (clientX <= this.threshold) {
            return 'left';
        }
        if (clientX >= width - this.threshold) {
            return 'right';
        }
        return 'none';
    }

    /**
     * Show translucent snap ghost preview
     * @param {'left'|'right'|'top'} snapType
     */
    showPreview(snapType) {
        if (this.currentPreview === snapType) return;
        this.currentPreview = snapType;

        if (!this.previewElement && typeof document !== 'undefined') {
            this.previewElement = document.createElement('div');
            this.previewElement.className = 'aero-snap-preview';
            document.body.appendChild(this.previewElement);
        }

        if (this.previewElement) {
            this.previewElement.className = `aero-snap-preview snap-${snapType}`;
            this.previewElement.style.display = 'block';
        }
    }

    /**
     * Hide snap preview
     */
    hidePreview() {
        this.currentPreview = 'none';
        if (this.previewElement) {
            this.previewElement.style.display = 'none';
        }
    }

    /**
     * Apply snap layout to window
     * @param {HTMLElement} windowElement
     * @param {object} appWindowSystem
     * @param {'left'|'right'|'top'} snapType
     */
    applySnap(windowElement, appWindowSystem, snapType) {
        if (!windowElement || !appWindowSystem) return;

        // Save pre-snap state if not already snapped
        if (!appWindowSystem.snapState || appWindowSystem.snapState === 'none') {
            const rect = windowElement.getBoundingClientRect();
            appWindowSystem.restoreX = rect.left;
            appWindowSystem.restoreY = rect.top;
            appWindowSystem.restoreWidth = windowElement.style.width;
            appWindowSystem.restoreHeight = windowElement.style.height;
        }

        windowElement.classList.remove('snapped-left', 'snapped-right');

        if (snapType === 'top') {
            appWindowSystem.maximize();
            appWindowSystem.snapState = 'top';
            return;
        }

        if (snapType === 'left') {
            windowElement.style.left = '0px';
            windowElement.style.top = 'var(--workspace-window-top, 0px)';
            windowElement.style.width = '50vw';
            windowElement.style.height = 'calc(100% - var(--workspace-reserved, 50px))';
            windowElement.classList.add('snapped-left');
            appWindowSystem.snapState = 'left';
        } else if (snapType === 'right') {
            windowElement.style.left = '50vw';
            windowElement.style.top = 'var(--workspace-window-top, 0px)';
            windowElement.style.width = '50vw';
            windowElement.style.height = 'calc(100% - var(--workspace-reserved, 50px))';
            windowElement.classList.add('snapped-right');
            appWindowSystem.snapState = 'right';
        }
    }

    /**
     * Unsnap window and restore previous bounds
     * @param {HTMLElement} windowElement
     * @param {object} appWindowSystem
     */
    unsnap(windowElement, appWindowSystem) {
        if (!windowElement || !appWindowSystem) return;
        if (!appWindowSystem.snapState || appWindowSystem.snapState === 'none') return;

        if (appWindowSystem.snapState === 'top') {
            appWindowSystem.unmaximize();
        } else {
            windowElement.classList.remove('snapped-left', 'snapped-right');
            if (appWindowSystem.restoreWidth) windowElement.style.width = appWindowSystem.restoreWidth;
            if (appWindowSystem.restoreHeight) windowElement.style.height = appWindowSystem.restoreHeight;
            if (typeof appWindowSystem.restoreX === 'number') windowElement.style.left = `${appWindowSystem.restoreX}px`;
            if (typeof appWindowSystem.restoreY === 'number') windowElement.style.top = `${appWindowSystem.restoreY}px`;
        }

        appWindowSystem.snapState = 'none';
    }
}

export const aeroSnapManager = new AeroSnapManager();
