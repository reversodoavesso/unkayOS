// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import React, { act } from 'react';
import { ReactBridgeApp } from '../core/ReactBridgeApp.js';

describe('ReactBridgeApp Lifecycle and Mounting', () => {
    it('should mount React component into appContentRoot and unmount cleanly', async () => {
        const rootEl = document.createElement('div');
        rootEl.className = 'app-content-root';
        document.body.appendChild(rootEl);

        const mockAppCore = {
            instanceId: 'test-inst-1',
            app_name: 'test-react-app',
            standardAPIs: {
                unkaySDK: { mock: true }
            }
        };

        let rendered = false;
        function MyComponent(props) {
            rendered = true;
            return React.createElement('div', { id: 'react-inner' }, `Hello from React! Instance: ${props.instanceId}`);
        }

        class TestApp extends ReactBridgeApp {
            getRootComponent() {
                return MyComponent;
            }
        }

        const app = new TestApp(mockAppCore, mockAppCore.standardAPIs, rootEl);
        
        await act(async () => {
            await app.onRun();
        });

        // Check that React mounted into DOM
        expect(rendered).toBe(true);
        expect(rootEl.innerHTML).toContain('Hello from React!');
        expect(rootEl.innerHTML).toContain('test-inst-1');
        expect(app.reactRoot).not.toBeNull();

        // Cleanup
        await act(async () => {
            await app.onCleanup();
        });
        expect(app.reactRoot).toBeNull();
        expect(rootEl.innerHTML).toBe('');
    });
});
