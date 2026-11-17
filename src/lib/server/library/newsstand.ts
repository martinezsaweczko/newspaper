import type { Edition, RegionGroup } from '#lib/types.ts';
import { NATIONAL } from './regions.ts';
import { normalise } from './text.ts';

export interface NewsstandQuery {
	date?: string | null;
	region?: string | null;
	q?: string | null;
}

export interface Newsstand {
	/** Every date with at least one edition, newest first. */
	dates: string[];
	/** The date shown, or null when the folder is empty. */
	date: string | null;
	/** The closest older / newer date with editions. */
	prev: string | null;
	next: string | null;
	/** Regions with an edition on `date` (before region/search filters), National first. */
	regions: string[];
	/** Region filter in effect (null = all). */
	region: string | null;
	q: string;
	groups: RegionGroup[];
	/** Editions shown after filters. */
	shown: number;
	/** Editions on `date` before filters. */
	onDate: number;
}

const byMasthead = (a: Edition, b: Edition) =>
	a.masthead.localeCompare(b.masthead, 'en') || b.mtimeMs - a.mtimeMs;

/** National first, then the order of regions.json, then anything else alphabetically. */
export function sortRegions(names: Iterable<string>, order: string[]): string[] {
	const rank = (name: string) => {
		if (name === NATIONAL) return -1;
		const i = order.indexOf(name);
		return i === -1 ? order.length : i;
	};
	return [...new Set(names)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'en'));
}

/** One edition per masthead and day: the most recently modified file wins. */
function onePerMasthead(editions: Edition[]): Edition[] {
	const seen = new Map<string, Edition>();
	for (const e of editions) {
		const prev = seen.get(e.slug);
		if (!prev || e.mtimeMs > prev.mtimeMs) seen.set(e.slug, e);
	}
	return [...seen.values()];
}

/** The newsstand for one day: every masthead with an edition that day, grouped by region. */
export function buildNewsstand(
	editions: Edition[],
	query: NewsstandQuery,
	regionOrder: string[]
): Newsstand {
	const dates = [...new Set(editions.map((e) => e.date))].sort().reverse();
	const date = query.date && dates.includes(query.date) ? query.date : (dates[0] ?? null);
	const index = date ? dates.indexOf(date) : -1;

	const ofDay = onePerMasthead(editions.filter((e) => e.date === date));
	const regions = sortRegions(
		ofDay.map((e) => e.region),
		regionOrder
	);
	const region = query.region && regions.includes(query.region) ? query.region : null;
	const q = (query.q ?? '').trim().slice(0, 80);
	const needle = normalise(q);

	const shownEditions = ofDay.filter(
		(e) =>
			(!region || e.region === region) && (!needle || normalise(e.masthead).includes(needle))
	);

	const groups = sortRegions(
		shownEditions.map((e) => e.region),
		regionOrder
	).map((name) => ({
		region: name,
		editions: shownEditions.filter((e) => e.region === name).sort(byMasthead)
	}));

	return {
		dates,
		date,
		prev: index >= 0 && index < dates.length - 1 ? dates[index + 1] : null,
		next: index > 0 ? dates[index - 1] : null,
		regions,
		region,
		q,
		groups,
		shown: shownEditions.length,
		onDate: ofDay.length
	};
}

/** Every edition of one masthead, newest first (one per day). */
export function backIssues(editions: Edition[], slug: string): Edition[] {
	const mine = editions.filter((e) => e.slug === slug);
	const perDay = new Map<string, Edition>();
	for (const e of mine) {
		const prev = perDay.get(e.date);
		if (!prev || e.mtimeMs > prev.mtimeMs) perDay.set(e.date, e);
	}
	return [...perDay.values()].sort((a, b) => b.date.localeCompare(a.date));
}
