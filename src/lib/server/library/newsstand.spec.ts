import type { Edition } from '#lib/types.ts';
import { describe, expect, it } from 'vitest';
import { backIssues, buildNewsstand, sortRegions } from './newsstand.ts';
import { slugify } from './text.ts';

let n = 0;
function ed(masthead: string, date: string, region: string, mtimeMs = 1): Edition {
	n += 1;
	return {
		id: `id${n}`,
		masthead,
		slug: slugify(masthead),
		date,
		dateSource: 'filename',
		region,
		size: 100,
		mtimeMs
	};
}

const order = ['Andalucía', 'Galicia', 'Catalunya'];
const editions = [
	ed('La Voz de Galicia', '2026-11-17', 'Galicia'),
	ed('Faro de Vigo', '2026-11-17', 'Galicia'),
	ed('Gaceta Nacional', '2026-11-17', 'National'),
	ed('Diario de Sevilla', '2026-11-17', 'Andalucía'),
	ed('Diario de Sevilla', '2026-11-17', 'Andalucía', 5), // newer duplicate of the same day
	ed('La Vanguardia', '2026-11-16', 'Catalunya'),
	ed('Gaceta Nacional', '2026-11-16', 'National'),
	ed('La Voz de Galicia', '2026-11-15', 'Galicia')
];

describe('buildNewsstand', () => {
	it('defaults to the most recent date and groups by region, National first', () => {
		const stand = buildNewsstand(editions, {}, order);
		expect(stand.dates).toEqual(['2026-11-17', '2026-11-16', '2026-11-15']);
		expect(stand.date).toBe('2026-11-17');
		expect(stand.prev).toBe('2026-11-16');
		expect(stand.next).toBeNull();
		expect(stand.groups.map((g) => g.region)).toEqual(['National', 'Andalucía', 'Galicia']);
		expect(stand.groups[2].editions.map((e) => e.masthead)).toEqual([
			'Faro de Vigo',
			'La Voz de Galicia'
		]);
		// one edition per masthead and day, the newest file
		expect(stand.groups[1].editions).toHaveLength(1);
		expect(stand.groups[1].editions[0].mtimeMs).toBe(5);
		expect(stand.onDate).toBe(4);
		expect(stand.shown).toBe(4);
	});

	it('shows only mastheads with an edition on the chosen day', () => {
		const stand = buildNewsstand(editions, { date: '2026-11-16' }, order);
		expect(stand.groups.map((g) => [g.region, g.editions.map((e) => e.masthead)])).toEqual([
			['National', ['Gaceta Nacional']],
			['Catalunya', ['La Vanguardia']]
		]);
		expect(stand.prev).toBe('2026-11-15');
		expect(stand.next).toBe('2026-11-17');
	});

	it('falls back to the latest date for an unknown date', () => {
		expect(buildNewsstand(editions, { date: '1999-01-01' }, order).date).toBe('2026-11-17');
	});

	it('filters by region and by an accent-insensitive search', () => {
		const byRegion = buildNewsstand(editions, { region: 'Galicia' }, order);
		expect(byRegion.region).toBe('Galicia');
		expect(byRegion.groups.map((g) => g.region)).toEqual(['Galicia']);
		expect(byRegion.regions).toEqual(['National', 'Andalucía', 'Galicia']);

		const search = buildNewsstand(editions, { q: 'SEVÍLLA' }, order);
		expect(search.shown).toBe(1);
		expect(search.groups[0].editions[0].masthead).toBe('Diario de Sevilla');

		const unknownRegion = buildNewsstand(editions, { region: 'Narnia' }, order);
		expect(unknownRegion.region).toBeNull();
		expect(unknownRegion.shown).toBe(4);
	});

	it('handles an empty folder', () => {
		const stand = buildNewsstand([], {}, order);
		expect(stand).toMatchObject({ date: null, prev: null, next: null, groups: [], shown: 0 });
	});
});

describe('sortRegions', () => {
	it('puts National first, then the file order, then unknown names alphabetically', () => {
		expect(sortRegions(['Zeta', 'Galicia', 'National', 'Alpha', 'Andalucía'], order)).toEqual([
			'National',
			'Andalucía',
			'Galicia',
			'Alpha',
			'Zeta'
		]);
	});
});

describe('backIssues', () => {
	it('lists one masthead newest first', () => {
		expect(backIssues(editions, 'la-voz-de-galicia').map((e) => e.date)).toEqual([
			'2026-11-17',
			'2026-11-15'
		]);
		expect(backIssues(editions, 'nope')).toEqual([]);
	});
});
