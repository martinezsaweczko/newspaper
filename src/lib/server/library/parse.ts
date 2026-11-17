import { isoFromLocalDate, isValidDate, toIsoDate } from '#lib/format/date.ts';
import { slugify, titleCase } from './text.ts';

export interface ParsedName {
	/** Display name, title-cased: `La Voz de Galicia`. */
	masthead: string;
	/** Accent-stripped kebab case, used in `/paper/[slug]`. */
	slug: string;
	/** ISO `YYYY-MM-DD`. */
	date: string;
	/** Where the date came from. */
	dateSource: 'filename' | 'mtime';
}

const SEPARATORS = /[-_.\s]+/;

type DateMatcher = { re: RegExp; order: 'ymd' | 'dmy' };

/** Tried in order; the first one that yields a real calendar date wins. */
const DATE_PATTERNS: DateMatcher[] = [
	{ re: /(?<!\d)(\d{4})[-_.](\d{2})[-_.](\d{2})(?!\d)/, order: 'ymd' },
	{ re: /(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/, order: 'ymd' },
	{ re: /(?<!\d)(\d{2})[-_.](\d{2})[-_.](\d{4})(?!\d)/, order: 'dmy' }
];

function findDate(base: string): { iso: string; index: number; length: number } | null {
	for (const { re, order } of DATE_PATTERNS) {
		const m = re.exec(base);
		if (!m) continue;
		const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
		const [year, month, day] = order === 'ymd' ? [a, b, c] : [c, b, a];
		if (isValidDate(year, month, day)) {
			return { iso: toIsoDate(year, month, day), index: m.index, length: m[0].length };
		}
	}
	return null;
}

/**
 * Parse an edition filename: masthead + date.
 * `la-voz-de-galicia-2026-11-17.pdf` -> `La Voz de Galicia`, `2026-11-17`.
 * Without a date in the name the file's modification time (local date) is used.
 */
export function parseEditionName(filename: string, mtime: Date): ParsedName {
	let base = filename.replace(/\.pdf$/i, '');
	const found = findDate(base);
	if (found) base = base.slice(0, found.index) + ' ' + base.slice(found.index + found.length);

	const words = base.split(SEPARATORS).filter(Boolean);
	const masthead = words.length > 0 ? titleCase(words) : 'Untitled';
	const slug = slugify(masthead) || 'untitled';

	return found
		? { masthead, slug, date: found.iso, dateSource: 'filename' }
		: { masthead, slug, date: isoFromLocalDate(mtime), dateSource: 'mtime' };
}
