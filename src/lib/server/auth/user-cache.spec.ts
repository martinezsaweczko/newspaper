import { describe, expect, it } from 'vitest';
import { createUserCache } from './user-cache.ts';

describe('user cache', () => {
	it('serves repeats from memory for the TTL, then reloads', async () => {
		let t = 0;
		let loads = 0;
		const cache = createUserCache({
			load: async (id) => ({ id, n: ++loads }),
			ttlMs: 5000,
			now: () => t
		});
		const results = await Promise.all(Array.from({ length: 40 }, () => cache.get(1)));
		expect(new Set(results.map((r) => r?.n))).toEqual(new Set([1])); // one load for 40 thumbs
		t = 4999;
		expect((await cache.get(1))?.n).toBe(1);
		t = 5000;
		expect((await cache.get(1))?.n).toBe(2);
	});

	it('invalidates one user or everyone', async () => {
		let loads = 0;
		const cache = createUserCache({ load: async (id) => ({ id, n: ++loads }) });
		await cache.get(1);
		await cache.get(2);
		cache.invalidate(1);
		expect((await cache.get(1))?.n).toBe(3);
		expect((await cache.get(2))?.n).toBe(2);
		cache.invalidate();
		expect(cache.size()).toBe(0);
	});

	it('does not cache a failed load and stays bounded', async () => {
		let fail = true;
		const cache = createUserCache({
			load: async (id) => {
				if (fail) throw new Error('db down');
				return { id };
			},
			maxEntries: 3
		});
		await expect(cache.get(1)).rejects.toThrow('db down');
		fail = false;
		expect(await cache.get(1)).toEqual({ id: 1 });
		for (let id = 2; id <= 10; id++) await cache.get(id);
		expect(cache.size()).toBeLessThanOrEqual(3);
	});
});
