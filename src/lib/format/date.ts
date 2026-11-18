/**
 * The single source of truth for dates shown in the UI.
 * European formats, Spanish words (es-ES), no Intl / toLocale* (output must not depend on the
 * host locale). Dates travel as ISO `YYYY-MM-DD` strings.
 */

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = [
	'enero',
	'febrero',
	'marzo',
	'abril',
	'mayo',
	'junio',
	'julio',
	'agosto',
	'septiembre',
	'octubre',
	'noviembre',
	'diciembre'
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

const weekdayOf = (p: DateParts) =>
	WEEKDAYS[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()];

/** `martes, 17 de noviembre de 2026` — lowercase, for use inside a sentence. */
export function formatLongDate(iso: string): string {
	const p = parseIsoDate(iso);
	if (!p) return '—';
	return `${weekdayOf(p)}, ${p.day} de ${MONTHS[p.month - 1]} de ${p.year}`;
}

/** `Martes, 17 de noviembre de 2026` — the long date as a headline (dateline, titles, captions). */
export function formatDateline(iso: string): string {
	const long = formatLongDate(iso);
	return long.charAt(0).toUpperCase() + long.slice(1);
}

/** `mar 17 nov` — compact label for date lists. */
export function formatShortDate(iso: string): string {
	const p = parseIsoDate(iso);
	if (!p) return '—';
	return `${weekdayOf(p).slice(0, 3)} ${p.day} ${MONTHS[p.month - 1].slice(0, 3)}`;
}

/** `mar 17/11/2026` — for lists of dates. */
export function formatWeekdayDate(iso: string): string {
	const p = parseIsoDate(iso);
	if (!p) return '—';
	return `${weekdayOf(p).slice(0, 3)} ${formatDate(iso)}`;
}
