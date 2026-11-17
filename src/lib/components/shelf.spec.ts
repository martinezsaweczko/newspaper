import { describe, expect, it } from 'vitest';
import { shelfSpan } from './shelf.ts';

describe('shelfSpan', () => {
	it('spans one column per paper, capped by each breakpoint', () => {
		expect(shelfSpan(1)).toBe('col-span-1 md:col-span-1 lg:col-span-1 xl:col-span-1');
		expect(shelfSpan(3)).toBe('col-span-2 md:col-span-3 lg:col-span-3 xl:col-span-3');
		expect(shelfSpan(12)).toBe('col-span-2 md:col-span-3 lg:col-span-4 xl:col-span-5');
		expect(shelfSpan(0)).toBe('col-span-1 md:col-span-1 lg:col-span-1 xl:col-span-1');
	});
});
