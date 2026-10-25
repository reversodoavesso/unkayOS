// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { AeroSnapManager } from '../core/AeroSnapManager.js';
import { HostDropManager } from '../core/HostDropManager.js';

describe('unkayOS 2.0 Aero Snap System', () => {
    it('should detect snap zones correctly based on screen boundaries', () => {
        const snap = new AeroSnapManager();
        globalThis.window.innerWidth = 1920;

        // Top edge
        expect(snap.checkSnapZone(500, 10)).toBe('top');

        // Left edge
        expect(snap.checkSnapZone(15, 400)).toBe('left');

        // Right edge
        expect(snap.checkSnapZone(1910, 400)).toBe('right');

        // Center screen
        expect(snap.checkSnapZone(800, 500)).toBe('none');
    });

    it('should snap to left half, right half and unsnap correctly', () => {
        const snap = new AeroSnapManager();
        const winEl = document.createElement('div');
        winEl.style.width = '600px';
        winEl.style.height = '400px';
        winEl.style.left = '200px';
        winEl.style.top = '150px';

        const mockAppWindow = {
            restoreX: 200,
            restoreY: 150,
            restoreWidth: '600px',
            restoreHeight: '400px',
            snapState: 'none',
            maximize: vi.fn(),
            unmaximize: vi.fn()
        };

        // Snap left
        snap.applySnap(winEl, mockAppWindow, 'left');
        expect(winEl.style.left).toBe('0px');
        expect(winEl.style.width).toBe('50vw');
        expect(winEl.classList.contains('snapped-left')).toBe(true);
        expect(mockAppWindow.snapState).toBe('left');

        // Unsnap
        snap.unsnap(winEl, mockAppWindow);
        expect(winEl.classList.contains('snapped-left')).toBe(false);
        expect(winEl.style.width).toBe('600px');
        expect(mockAppWindow.snapState).toBe('none');

        // Snap top (maximize)
        snap.applySnap(winEl, mockAppWindow, 'top');
        expect(mockAppWindow.maximize).toHaveBeenCalled();
        expect(mockAppWindow.snapState).toBe('top');
    });
});

describe('unkayOS 2.0 Host Drop Manager', () => {
    it('should import dropped host files into /home/guest/Desktop', async () => {
        const dropManager = new HostDropManager();
        const desktopEl = document.createElement('div');
        dropManager.initialize(desktopEl);

        const mockFiles = [
            {
                name: 'documento.pdf',
                size: 2048,
                arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer
            }
        ];

        const mockDropEvent = {
            preventDefault: vi.fn(),
            dataTransfer: {
                files: mockFiles
            }
        };

        const writtenFiles = [];
        globalThis.window.wasmFileSystem = {
            mkdir: vi.fn(async () => {}),
            writeFile: vi.fn(async (path, data) => {
                writtenFiles.push({ path, length: data.length });
            })
        };

        await dropManager.handleDrop(mockDropEvent);
        expect(writtenFiles.length).toBe(1);
        expect(writtenFiles[0].path).toBe('/home/guest/Desktop/documento.pdf');
        expect(writtenFiles[0].length).toBe(4);
    });
});
