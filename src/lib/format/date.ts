/**
 * The single source of truth for dates shown in the UI.
 * European formats, English words, no Intl / toLocale* (output must not depend on the host locale).
 * Dates travel as ISO `YYYY-MM-DD` strings.
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DateParts {
	year: number;
	month: number; // 1-12
	day: number;
}

/** Parse an ISO `YYYY-MM-DD` string into parts, or null when it is not a real calendar date. */
export function parseIsoDate(iso: string): DateParts | null {
	const m = ISO.exec(iso);
	if (!m) return null;
	const year = Number(m[1]);
	const month = Number(m[2]);
	const day = Number(m[3]);
	if (!isValidDate(year, month, day)) return null;
	return { year, month, day };
}

export function isValidDate(year: number, month: number, day: number): boolean {
	if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
	if (year < 1800 || year > 2999 || month < 1 || month > 12 || day < 1) return false;
	const d = new Date(Date.UTC(year, month - 1, day));
	return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

export function toIsoDate(year: number, month: number, day: number): string {
	return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** ISO date of a JS Date in local time (used for file mtimes). */
export function isoFromLocalDate(date: Date): string {
	return toIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** `17/11/2026` */
export function formatDate(iso: string): string {
	const p = parseIsoDate(iso);
	if (!p) return '—';
	return `${pad(p.day)}/${pad(p.month)}/${p.year}`;
}

/** `Tuesday, 17 November 2026` */
export function formatLongDate(iso: string): string {
	const p = parseIsoDate(iso);
	if (!p) return '—';
	const weekday = WEEKDAYS[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()];
	return `${weekday}, ${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** `Tue 17 Nov` — compact label for date lists. */
export function formatShortDate(iso: string): string {
	const p = parseIsoDate(iso);
	if (!p) return '—';
	const weekday = WEEKDAYS[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()].slice(0, 3);
	return `${weekday} ${p.day} ${MONTHS[p.month - 1].slice(0, 3)}`;
}

/** `Tue 17/11/2026` — for lists of dates. */
export function formatWeekdayDate(iso: string): string {
	const p = parseIsoDate(iso);
	if (!p) return '—';
	const weekday = WEEKDAYS[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()].slice(0, 3);
	return `${weekday} ${formatDate(iso)}`;
}
