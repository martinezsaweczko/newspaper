import { describe, expect, it } from 'vitest';
import { countFrontPages, formatCount, plural, standSummary } from './count.ts';

describe('plural', () => {
	it('uses the singular only for one', () => {
		expect(plural(0, 'portada', 'portadas')).toBe('0 portadas');
		expect(plural(1, 'portada', 'portadas')).toBe('1 portada');
		expect(plural(2, 'región', 'regiones')).toBe('2 regiones');
	});
});

describe('countFrontPages', () => {
	it('counts editions as front pages', () => {
		expect(countFrontPages(1)).toBe('1 portada');
		expect(countFrontPages(3)).toBe('3 portadas');
	});
});

describe('standSummary', () => {
	const base = { shown: 35, onDate: 35, regions: 4, region: null, q: '' };

	it('counts front pages and regions when nothing is filtered', () => {
		expect(standSummary(base)).toBe('35 portadas de 4 regiones');
		expect(standSummary({ ...base, shown: 1, onDate: 1, regions: 1 })).toBe(
			'1 portada de 1 región'
		);
	});

	it('counts the visible set against the day when a region is chosen', () => {
		expect(standSummary({ ...base, shown: 3, region: 'Catalunya' })).toBe(
			'3 de 35 portadas · Catalunya'
		);
	});

	it('quotes the search, and names both filters', () => {
		expect(standSummary({ ...base, shown: 1, q: 'voz' })).toBe('1 de 35 portadas · «voz»');
		expect(standSummary({ ...base, shown: 0, region: 'Galicia', q: 'faro' })).toBe(
			'0 de 35 portadas · Galicia · «faro»'
		);
	});

	it('agrees the noun with the day total', () => {
		expect(standSummary({ ...base, shown: 1, onDate: 1, region: 'Nacional' })).toBe(
			'1 de 1 portada · Nacional'
		);
	});
});

describe('formatCount', () => {
	it('groups thousands with a point from five digits up', () => {
		expect(formatCount(0)).toBe('0');
		expect(formatCount(9999)).toBe('9999');
		expect(formatCount(12345)).toBe('12.345');
		expect(formatCount(1284000)).toBe('1.284.000');
		expect(plural(12000, 'lectura', 'lecturas')).toBe('12.000 lecturas');
	});
});
