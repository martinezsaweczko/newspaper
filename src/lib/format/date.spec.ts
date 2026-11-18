import { describe, expect, it } from 'vitest';
import {
	formatDate,
	formatDateline,
	formatLongDate,
	formatShortDate,
	formatWeekdayDate,
	isoFromLocalDate,
	isValidDate,
	parseIsoDate
} from './date.ts';

describe('date formatting', () => {
	it.each([
		['2026-11-17', '17/11/2026', 'martes, 17 de noviembre de 2026', 'mar 17 nov'],
		['2026-01-01', '01/01/2026', 'jueves, 1 de enero de 2026', 'jue 1 ene'],
		['2024-02-29', '29/02/2024', 'jueves, 29 de febrero de 2024', 'jue 29 feb'],
		['2026-11-18', '18/11/2026', 'miércoles, 18 de noviembre de 2026', 'mié 18 nov'],
		['2026-09-05', '05/09/2026', 'sábado, 5 de septiembre de 2026', 'sáb 5 sep']
	])('%s', (iso, short, long, compact) => {
		expect(formatDate(iso)).toBe(short);
		expect(formatLongDate(iso)).toBe(long);
		expect(formatShortDate(iso)).toBe(compact);
		expect(formatWeekdayDate(iso)).toBe(`${compact.slice(0, 3)} ${short}`);
	});

	it('capitalises the dateline', () => {
		expect(formatDateline('2026-11-17')).toBe('Martes, 17 de noviembre de 2026');
		expect(formatDateline('2026-11-18')).toBe('Miércoles, 18 de noviembre de 2026');
		expect(formatDateline('nope')).toBe('—');
	});

	it('prints a dash for invalid dates', () => {
		expect(formatDate('2026-02-30')).toBe('—');
		expect(formatLongDate('nope')).toBe('—');
	});

	it('parses and validates', () => {
		expect(parseIsoDate('2026-11-17')).toEqual({ year: 2026, month: 11, day: 17 });
		expect(parseIsoDate('2026-13-01')).toBeNull();
		expect(isValidDate(2023, 2, 29)).toBe(false);
		expect(isoFromLocalDate(new Date(2026, 10, 5))).toBe('2026-11-05');
	});
});
