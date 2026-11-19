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
	/** The name carried a download-copy marker (`Hola (1).pdf`, `Hola_1.pdf`), now stripped. */
	copy: boolean;
}

const SEPARATORS = /[-_.\s]+/;

/** A trailing copy marker added by browsers and file managers: ` (1)`, `(2)`, `_1`. */
const COPY_MARKER = /(?:\s*\(\d{1,3}\)|_[1-9])$/;

/** How far after the file's mtime a year-less `DD-MM` may land before it means last year. */
export const YEARLESS_LOOKAHEAD_DAYS = 62;

interface Found {
	iso: string;
	index: number;
	length: number;
}

type Parts = [number, number, number];

/** Long forms, anywhere in the name. Tried in order; the first real calendar date wins. */
const LONG_PATTERNS: { re: RegExp; ymd: (m: RegExpExecArray) => Parts }[] = [
	{
		re: /(?<!\d)(\d{4})[-_.](\d{2})[-_.](\d{2})(?!\d)/,
		ymd: (m) => [+m[1], +m[2], +m[3]]
	},
	{ re: /(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/, ymd: (m) => [+m[1], +m[2], +m[3]] },
	{
		re: /(?<!\d)(\d{2})[-_.](\d{2})[-_.](\d{4})(?!\d)/,
		ymd: (m) => [+m[3], +m[2], +m[1]]
	}
];

/**
 * Short forms only count at the very start or end of the name, set off by `-`, `_`, `.` or a
 * space, so masthead numbers (`Canarias7`, `20 Minutos`, `Las 24 Horas`) are left alone.
 */
const SEP = '[-_.\\s]';
// ...and never right next to another number (`2026-02-30` is not `02-30`).
const edge = (core: string) => [
	new RegExp(`^${core}(?=${SEP}|$)(?!${SEP}+\\d)`),
	new RegExp(`(?<!\\d${SEP}+)(?:^|(?<=${SEP}))${core}$`)
];
const DMY_SHORT = edge(`(\\d{2})${SEP}(\\d{2})${SEP}(\\d{2})`);
const PAIR = edge(`(\\d{2})${SEP}(\\d{2})`);

const DAY_MS = 86_400_000;

/**
 * `DD-MM` without a year takes the mtime's year, or the year before when that would put the
 * edition more than YEARLESS_LOOKAHEAD_DAYS after the file was written (a November issue saved in
 * January belongs to last November).
 */
function yearlessYear(month: number, day: number, mtime: Date): number {
	const year = mtime.getFullYear();
	const candidate = new Date(year, month - 1, day, 12);
	return candidate.getTime() - mtime.getTime() > YEARLESS_LOOKAHEAD_DAYS * DAY_MS ? year - 1 : year;
}

function findDate(base: string, mtime: Date): Found | null {
	const found = (m: RegExpExecArray, [y, mo, d]: Parts): Found | null =>
		isValidDate(y, mo, d)
			? { iso: toIsoDate(y, mo, d), index: m.index, length: m[0].length }
			: null;

	for (const { re, ymd } of LONG_PATTERNS) {
		const m = re.exec(base);
		const hit = m && found(m, ymd(m));
		if (hit) return hit;
	}
	// DD-MM-YY: two-digit years are 20YY
	for (const re of DMY_SHORT) {
		const m = re.exec(base);
		const hit = m && found(m, [2000 + +m[3], +m[2], +m[1]]);
		if (hit) return hit;
	}
	// Two numbers: DD-MM when the second can be a month; otherwise MM-YY (a monthly, dated the
	// 1st) when 20YY is a plausible year around the file's mtime.
	for (const re of PAIR) {
		const m = re.exec(base);
		if (!m) continue;
		const [a, b] = [+m[1], +m[2]];
		const hit =
			b <= 12
				? found(m, [yearlessYear(b, a, mtime), b, a])
				: Math.abs(2000 + b - mtime.getFullYear()) <= 5
					? found(m, [2000 + b, a, 1])
					: null;
		if (hit) return hit;
	}
	return null;
}

/**
 * Parse an edition filename: masthead + date.
 * `la-voz-de-galicia-2026-11-17.pdf` -> `La Voz de Galicia`, `2026-11-17`;
 * `06-10-26-Diario de Ferrol.pdf` -> `Diario de Ferrol`, `2026-10-06`;
 * `25-11-Hola (1).pdf` -> `Hola`, 25/11 of the mtime's year, a copy.
 * Without a date in the name the file's modification time (local date) is used.
 */
export function parseEditionName(filename: string, mtime: Date): ParsedName {
	let base = filename.replace(/\.pdf$/i, '').trim();
	const copy = COPY_MARKER.test(base);
	if (copy) base = base.replace(COPY_MARKER, '').trim();

	const found = findDate(base, mtime);
	if (found) base = base.slice(0, found.index) + ' ' + base.slice(found.index + found.length);

	// words without a letter or a digit (`·`, `&`) are noise
	const words = base.split(SEPARATORS).filter((w) => /[\p{L}\p{N}]/u.test(w));
	const masthead = words.length > 0 ? titleCase(words) : 'Untitled';
	const slug = slugify(masthead) || 'untitled';

	return found
		? { masthead, slug, date: found.iso, dateSource: 'filename', copy }
		: { masthead, slug, date: isoFromLocalDate(mtime), dateSource: 'mtime', copy };
}
