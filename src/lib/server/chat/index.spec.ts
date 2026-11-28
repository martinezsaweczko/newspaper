import { afterEach, describe, expect, it, vi } from 'vitest';

const KEY = Symbol.for('newspaper.chat.presence');
const store = globalThis as Record<symbol, unknown>;

describe('the process-wide hub', () => {
	afterEach(() => {
		delete store[KEY];
		vi.resetModules();
	});

	it('replaces a hub left by an older version (dev hot reload) and ends its streams', async () => {
		const closeAll = vi.fn();
		store[KEY] = { connect() {}, closeAll }; // phase-1 shape: stored bare, no publish()
		const { presence } = await import('./index.ts');
		expect(typeof presence.publish).toBe('function');
		expect(closeAll).toHaveBeenCalledOnce();
	});

	it('reuses the current hub across re-imports', async () => {
		const first = (await import('./index.ts')).presence;
		vi.resetModules();
		const second = (await import('./index.ts')).presence;
		expect(second).toBe(first);
	});
});
