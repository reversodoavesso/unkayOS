import { describe, it, expect, vi } from 'vitest';
import { Kernel, KernelError, defineFeature } from '../core/kernel/index.js';

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

describe('feature kernel', () => {
    it('starts features in capability dependency order and exposes capabilities', async () => {
        const order = [];
        const base = defineFeature({
            id: 'base',
            provides: ['base.api'],
            setup: () => ({ 'base.api': { value: 42 } }),
            start: () => order.push('base')
        });
        const consumer = defineFeature({
            id: 'consumer',
            requires: ['base.api'],
            provides: ['consumer.api'],
            setup: context => {
                expect(context.require('base.api')).toEqual({ value: 42 });
                return { 'consumer.api': { doubled: context.get('base.api').value * 2 } };
            },
            start: () => order.push('consumer')
        });

        const kernel = new Kernel({ logger: silentLogger });
        kernel.register(consumer, base); // declaration order is intentionally reversed

        await kernel.start();

        expect(order).toEqual(['base', 'consumer']);
        expect(kernel.state).toBe('running');
        expect(kernel.require('consumer.api')).toEqual({ doubled: 84 });
        expect(kernel.describe().features.map(feature => feature.id).sort()).toEqual(['base', 'consumer']);
    });

    it('is idempotent when started or stopped twice', async () => {
        const setup = vi.fn(() => ({ api: {} }));
        const kernel = new Kernel({ logger: silentLogger }).register({
            id: 'once',
            provides: ['api'],
            setup
        });

        await Promise.all([kernel.start(), kernel.start()]);
        await Promise.all([kernel.stop(), kernel.stop()]);

        expect(setup).toHaveBeenCalledTimes(1);
        expect(kernel.state).toBe('idle');
        await expect(kernel.start()).resolves.toBe(kernel);
        expect(setup).toHaveBeenCalledTimes(2);
    });

    it('rejects duplicate feature ids and duplicate capabilities at registration', () => {
        const kernel = new Kernel({ logger: silentLogger });
        kernel.register({ id: 'one', provides: ['shared'], setup: () => ({ shared: 1 }) });

        expect(() => kernel.register({ id: 'one', provides: ['other'], setup: () => ({ other: 1 }) }))
            .toThrowError(/already registered/);
        expect(() => kernel.register({ id: 'two', provides: ['shared'], setup: () => ({ shared: 2 }) }))
            .toThrowError(/already provided/);
    });

    it('reports missing dependencies and dependency cycles before running setup', async () => {
        const missingKernel = new Kernel({ logger: silentLogger }).register({
            id: 'needs-missing',
            requires: ['absent'],
            provides: ['api'],
            setup: () => ({ api: {} })
        });
        await expect(missingKernel.start()).rejects.toMatchObject({
            code: 'FEATURE_DEPENDENCY_MISSING'
        });
        expect(missingKernel.state).toBe('idle');

        const cyclicKernel = new Kernel({ logger: silentLogger }).register(
            { id: 'a', provides: ['a'], requires: ['b'], setup: () => ({ a: {} }) },
            { id: 'b', provides: ['b'], requires: ['a'], setup: () => ({ b: {} }) }
        );
        await expect(cyclicKernel.start()).rejects.toMatchObject({
            code: 'FEATURE_DEPENDENCY_CYCLE'
        });
        expect(cyclicKernel.state).toBe('idle');
    });

    it('rolls back already-started features when a later setup fails', async () => {
        const stopBase = vi.fn();
        const kernel = new Kernel({ logger: silentLogger }).register(
            {
                id: 'base',
                provides: ['base.api'],
                setup: () => ({ 'base.api': {} }),
                stop: stopBase
            },
            {
                id: 'broken',
                requires: ['base.api'],
                provides: ['broken.api'],
                setup: () => {
                    throw new Error('setup exploded');
                }
            }
        );

        await expect(kernel.start()).rejects.toThrow('setup exploded');

        expect(stopBase).toHaveBeenCalledTimes(1);
        expect(kernel.state).toBe('idle');
        expect(kernel.hasFeature('base')).toBe(true);
        expect(kernel.has('base.api')).toBe(false);
    });

    it('fails when a feature does not expose a declared capability', async () => {
        const kernel = new Kernel({ logger: silentLogger }).register({
            id: 'liar',
            provides: ['promised'],
            setup: () => ({ other: true })
        });

        await expect(kernel.start()).rejects.toMatchObject({ code: 'CAPABILITY_MISSING' });
    });

    it('removes context listeners on stop and rejects unknown capabilities', async () => {
        const listener = vi.fn();
        const kernel = new Kernel({ logger: silentLogger }).register({
            id: 'listener',
            provides: ['api'],
            setup: context => {
                context.on('ping', listener);
                return { api: { emit: () => context.emit('ping', 'payload') } };
            }
        });

        await kernel.start();
        kernel.require('api').emit();
        expect(listener).toHaveBeenCalledWith('payload');

        await kernel.stop();
        kernel.events.emit('ping', 'after-stop');
        expect(listener).toHaveBeenCalledTimes(1);

        expect(() => kernel.require('api')).toThrowError(/not available/);
    });

    it('exposes configuration per feature and validates definitions', async () => {
        const kernel = new Kernel({
            logger: silentLogger,
            config: { configured: { greeting: 'hello' } }
        }).register({
            id: 'configured',
            provides: ['configured.api'],
            setup: context => ({ 'configured.api': context.config })
        });

        await kernel.start();
        expect(kernel.require('configured.api')).toEqual({ greeting: 'hello' });

        expect(() => defineFeature({ id: 'Bad Id', provides: ['x'], setup: () => ({}) }))
            .toThrowError(/Invalid feature id/);
        expect(() => defineFeature({ id: 'no-setup', provides: ['x'] }))
            .toThrowError(/setup/);
        expect(() => defineFeature({ id: 'no-capabilities', provides: [], setup: () => ({}) }))
            .toThrowError(/at least one capability/);
    });

    it('exposes a typed error for kernel failures', () => {
        const error = new KernelError('boom', 'BOOM', { answer: 42 });
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('KernelError');
        expect(error.code).toBe('BOOM');
        expect(error.details).toEqual({ answer: 42 });
    });
});
