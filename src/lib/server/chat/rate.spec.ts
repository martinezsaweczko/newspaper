import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate.ts';

describe('createRateLimiter', () => {
	it('allows up to each limit, per person, and frees up as time passes', () => {
		let t = 0;
		const limiter = createRateLimiter(
			[
				{ max: 2, windowMs: 1000 },
				{ max: 3, windowMs: 10_000 }
			],
			() => t
		);
		expect(limiter.take('ana')).toBe(true);
		expect(limiter.take('ana')).toBe(true);
		expect(limiter.take('ana')).toBe(false); // 2 per second
		expect(limiter.take('bea')).toBe(true); // someone else is not affected
		t = 1000;
		expect(limiter.take('ana')).toBe(true);
		t = 2000;
		expect(limiter.take('ana')).toBe(false); // 3 per 10 s (the refused one did not count)
		t = 10_000;
		expect(limiter.take('ana')).toBe(true);
	});
});
