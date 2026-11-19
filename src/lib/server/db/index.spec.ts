import { afterEach, describe, expect, it, vi } from 'vitest';

const created: { end: ReturnType<typeof vi.fn> }[] = [];
vi.mock('mysql2/promise', () => ({
	createPool: vi.fn(() => {
		const pool = { end: vi.fn(async () => {}) };
		created.push(pool);
		return pool;
	})
}));

const KEY = Symbol.for('newspaper.db.handle');
const reset = () => {
	delete (globalThis as Record<symbol, unknown>)[KEY];
	created.length = 0;
};
const URL = 'mysql://u:p@127.0.0.1:3307/x';

describe('the app-wide pool', () => {
	afterEach(() => {
		reset();
		vi.unstubAllEnvs();
	});

	it('survives module reloads (Vite HMR) in dev: one pool, not one per edit', async () => {
		reset();
		const first = (await import('./index.ts')).getDbHandle(URL);
		for (let i = 0; i < 3; i++) {
			vi.resetModules();
			expect((await import('./index.ts')).getDbHandle(URL)).toBe(first);
		}
		expect(created).toHaveLength(1);
	});

	it('keeps a module variable in production and ends the pool on shutdown', async () => {
		reset();
		vi.stubEnv('NODE_ENV', 'production');
		vi.resetModules();
		const mod = await import('./index.ts');
		expect(mod.getDbHandle(URL)).toBe(mod.getDbHandle(URL));
		expect((globalThis as Record<symbol, unknown>)[KEY]).toBeUndefined();
		await mod.closeDbHandle();
		expect(created[0].end).toHaveBeenCalledOnce();
		mod.getDbHandle(URL);
		expect(created).toHaveLength(2);
	});
});
