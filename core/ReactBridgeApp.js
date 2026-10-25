// core/ReactBridgeApp.js - unkayOS 2.0
// Bridge enabling unkayOS to host React components and Design System widgets with automatic cleanup

import { BaseApp } from './BaseApp.js';
import React from 'react';
import ReactDOM from 'react-dom/client';

export class ReactBridgeApp extends BaseApp {
    /**
     * Called when the app instance is launched
     */
    async onRun(terminalOutputCallback = null, appParams = {}) {
        if (appParams.help) {
            super.onRun(terminalOutputCallback, appParams);
            return;
        }

        // Locate or create the React mount container inside appContentRoot
        this.mountPoint = this.$('.app-content-root') || this.appContentRoot;
        if (!this.mountPoint) {
            console.error(`[ReactBridgeApp - ${this.appName}] No valid appContentRoot found`);
            return;
        }

        // Initialize React Root
        try {
            this.reactRoot = ReactDOM.createRoot(this.mountPoint);
            const RootComponent = this.getRootComponent();

            this.reactRoot.render(
                React.createElement(RootComponent, {
                    unkay: this.getUnkaySDK(),
                    instanceId: this.instanceId,
                    appName: this.appName,
                    appParams,
                    app: this
                })
            );
        } catch (err) {
            console.error(`[ReactBridgeApp - ${this.appName}] Error mounting React component:`, err);
        }
    }

    /**
     * Clean unmounting to prevent memory leaks and zombie listeners
     */
    async onCleanup() {
        if (this.reactRoot) {
            try {
                this.reactRoot.unmount();
            } catch (err) {
                console.warn(`[ReactBridgeApp - ${this.appName}] Error unmounting React root:`, err);
            }
            this.reactRoot = null;
        }
        await super.onCleanup();
    }

    /**
     * Provides the unified unkay SDK to React components
     */
    getUnkaySDK() {
        if (this.appCore && this.appCore.standardAPIs && this.appCore.standardAPIs.unkaySDK) {
            return this.appCore.standardAPIs.unkaySDK;
        }
        if (window.unkay) {
            return window.unkay;
        }
        return null;
    }

    /**
     * Subclasses must override this to return their top-level React component
     * @returns {React.ComponentType}
     */
    getRootComponent() {
        throw new Error(`[ReactBridgeApp - ${this.appName}] getRootComponent() must be implemented by subclass.`);
    }
}
