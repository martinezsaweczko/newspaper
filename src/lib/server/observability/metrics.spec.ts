import { describe, expect, it, vi } from 'vitest';
import { cachedLoader, isPageView } from './metrics.ts';

describe('isPageView', () => {
	const base = {
		route: '/',
		method: 'GET',
		status: 200,
		contentType: 'text/html',
		isDataRequest: false
	};

	it('counts 2xx GETs of HTML pages and client-side navigations', () => {
		expect(isPageView(base)).toBe(true);
		expect(isPageView({ ...base, contentType: 'application/json', isDataRequest: true })).toBe(
			true
		);
	});

	it('skips front pages, PDFs, CSV, redirects, errors, posts and unmatched routes', () => {
		expect(isPageView({ ...base, route: '/thumb/[id]', contentType: 'image/jpeg' })).toBe(false);
		expect(isPageView({ ...base, route: '/pdf/[id]' })).toBe(false);
		expect(isPageView({ ...base, route: '/admin/lecturas.csv', contentType: 'text/csv' })).toBe(
			false
		);
		expect(isPageView({ ...base, status: 303 })).toBe(false);
		expect(isPageView({ ...base, status: 404 })).toBe(false);
		expect(isPageView({ ...base, method: 'POST' })).toBe(false);
		expect(isPageView({ ...base, route: null })).toBe(false);
		expect(isPageView({ ...base, contentType: 'application/json' })).toBe(false);
	});
});

describe('cachedLoader', () => {
	it('loads at most once per TTL, failures included', async () => {
		let t = 0;
		const load = vi.fn(async () => t);
		const get = cachedLoader(load, { ttlMs: 60_000, now: () => t });
		expect(await get()).toBe(0);
		t = 30_000;
		expect(await get()).toBe(0);
		expect(load).toHaveBeenCalledTimes(1);
		t = 60_000;
		expect(await get()).toBe(60_000);
		expect(load).toHaveBeenCalledTimes(2);

		const failing = vi.fn(async () => {
			throw new Error('db down');
		});
		const onError = vi.fn();
		const down = cachedLoader(failing, { ttlMs: 60_000, now: () => t, onError });
		expect(await down()).toBeNull();
		expect(await down()).toBeNull();
		expect(failing).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledOnce();
	});

	it('answers with the last values when a load is slow', async () => {
		vi.useFakeTimers();
		try {
			let release: (v: number) => void = () => {};
			const get = cachedLoader(() => new Promise<number>((r) => (release = r)), {
				timeoutMs: 100
			});
			const first = get();
			await vi.advanceTimersByTimeAsync(100);
			expect(await first).toBeNull();
			release(7);
			await vi.advanceTimersByTimeAsync(0);
			expect(await get()).toBe(7);
		} finally {
			vi.useRealTimers();
		}
	});
});
