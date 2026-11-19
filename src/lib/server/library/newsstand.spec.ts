import type { Edition } from '#lib/types.ts';
import { describe, expect, it } from 'vitest';
import { backIssues, buildNewsstand, findElsewhere, sortRegions } from './newsstand.ts';
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
	ed('Gaceta Nacional', '2026-11-17', 'Nacional'),
	ed('Diario de Sevilla', '2026-11-17', 'Andalucía'),
	ed('Diario de Sevilla', '2026-11-17', 'Andalucía', 5), // newer duplicate of the same day
	ed('La Vanguardia', '2026-11-16', 'Catalunya'),
	ed('Gaceta Nacional', '2026-11-16', 'Nacional'),
	ed('La Voz de Galicia', '2026-11-15', 'Galicia')
];

describe('buildNewsstand', () => {
	it('defaults to the most recent date and groups by region, Nacional first', () => {
		const stand = buildNewsstand(editions, {}, order);
		expect(stand.dates).toEqual(['2026-11-17', '2026-11-16', '2026-11-15']);
		expect(stand.date).toBe('2026-11-17');
		expect(stand.prev).toBe('2026-11-16');
		expect(stand.next).toBeNull();
		expect(stand.groups.map((g) => g.region)).toEqual(['Nacional', 'Andalucía', 'Galicia']);
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
			['Nacional', ['Gaceta Nacional']],
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
		expect(byRegion.regions).toEqual(['Nacional', 'Andalucía', 'Galicia']);

		const search = buildNewsstand(editions, { q: 'SEVÍLLA' }, order);
		expect(search.shown).toBe(1);
		expect(search.groups[0].editions[0].masthead).toBe('Diario de Sevilla');

		const unknownRegion = buildNewsstand(editions, { region: 'Narnia' }, order);
		expect(unknownRegion.region).toBeNull();
		expect(unknownRegion.shown).toBe(4);
	});

	it('shows every paper for an old English ?region=National link', () => {
		const legacy = buildNewsstand(editions, { region: 'National' }, order);
		expect(legacy.region).toBeNull();
		expect(legacy.shown).toBe(4);
	});

	it('opens on the newest date up to today, not on a future-dated magazine', () => {
		const ahead = [
			...editions,
			ed('Hola', '2026-11-25', 'Nacional'),
			ed('Muy', '2026-12-01', 'Nacional')
		];
		const stand = buildNewsstand(ahead, { today: '2026-11-19' }, order);
		expect(stand.date).toBe('2026-11-17');
		expect(stand.next).toBe('2026-11-25');
		// a chosen future date is still served, and with nothing up to today the newest wins
		expect(buildNewsstand(ahead, { today: '2026-11-19', date: '2026-12-01' }, order).date).toBe(
			'2026-12-01'
		);
		expect(buildNewsstand(ahead, { today: '2020-01-01' }, order).date).toBe('2026-12-01');
	});

	it('handles an empty folder', () => {
		const stand = buildNewsstand([], {}, order);
		expect(stand).toMatchObject({ date: null, prev: null, next: null, groups: [], shown: 0 });
	});
});

describe('sortRegions', () => {
	it('puts Nacional first, then the file order, then unknown names alphabetically', () => {
		expect(sortRegions(['Zeta', 'Galicia', 'Nacional', 'Alpha', 'Andalucía'], order)).toEqual([
			'Nacional',
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

describe('findElsewhere', () => {
	const more = [
		...editions,
		ed('La Voz de Asturias', '2026-11-10', 'Asturias'),
		ed('La Voz de Galicia', '2026-11-15', 'Galicia', 9) // newer copy of the same day
	];

	it('finds mastheads matching the search on other dates, newest edition each', () => {
		const found = findElsewhere(more, { q: 'VOZ', date: '2026-11-16' });
		expect(found.map((m) => [m.masthead, m.date])).toEqual([
			['La Voz de Galicia', '2026-11-17'],
			['La Voz de Asturias', '2026-11-10']
		]);
		expect(found[0]).toMatchObject({ slug: 'la-voz-de-galicia', region: 'Galicia' });
		expect(found[0].id).toMatch(/^id\d+$/);
	});

	it('leaves out the selected date', () => {
		const found = findElsewhere(more, { q: 'voz', date: '2026-11-17' });
		expect(found.map((m) => [m.masthead, m.date])).toEqual([
			['La Voz de Galicia', '2026-11-15'],
			['La Voz de Asturias', '2026-11-10']
		]);
		// the newer file of that day wins
		expect(found[0].id).toBe(more[more.length - 1].id);
	});

	it('respects the region filter', () => {
		expect(
			findElsewhere(more, { q: 'voz', date: '2026-11-16', region: 'Asturias' }).map(
				(m) => m.masthead
			)
		).toEqual(['La Voz de Asturias']);
		expect(findElsewhere(more, { q: 'voz', date: '2026-11-16', region: 'Catalunya' })).toEqual([]);
	});

	it('returns nothing for an empty or unknown search and caps the list', () => {
		expect(findElsewhere(more, { q: '  ', date: '2026-11-16' })).toEqual([]);
		expect(findElsewhere(more, { q: 'narnia', date: '2026-11-16' })).toEqual([]);
		const many = Array.from({ length: 8 }, (_, i) => ed(`Diario ${i}`, '2026-11-01', 'Nacional'));
		expect(findElsewhere(many, { q: 'diario', date: '2026-11-17' })).toHaveLength(5);
		expect(findElsewhere(many, { q: 'diario', date: '2026-11-17' }, 2)).toHaveLength(2);
	});
});
