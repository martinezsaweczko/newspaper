import { describe, expect, it } from 'vitest';
import {
	formatDate,
	formatLongDate,
	formatShortDate,
	formatWeekdayDate,
	isoFromLocalDate,
	isValidDate,
	parseIsoDate
} from './date.ts';

describe('date formatting', () => {
	it.each([
		['2026-11-17', '17/11/2026', 'Tuesday, 17 November 2026', 'Tue 17 Nov'],
		['2026-01-01', '01/01/2026', 'Thursday, 1 January 2026', 'Thu 1 Jan'],
		['2024-02-29', '29/02/2024', 'Thursday, 29 February 2024', 'Thu 29 Feb']
	])('%s', (iso, short, long, compact) => {
		expect(formatDate(iso)).toBe(short);
		expect(formatLongDate(iso)).toBe(long);
		expect(formatShortDate(iso)).toBe(compact);
		expect(formatWeekdayDate(iso)).toBe(`${compact.slice(0, 3)} ${short}`);
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
