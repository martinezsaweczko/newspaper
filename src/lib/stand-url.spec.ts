import { describe, expect, it } from 'vitest';
import { standUrl } from './stand-url.ts';

describe('standUrl', () => {
	it('keeps only the filters in use', () => {
		expect(standUrl({})).toBe('/');
		expect(standUrl({ date: '2026-11-17' })).toBe('/?date=2026-11-17');
		expect(standUrl({ date: '2026-11-17', region: 'País Vasco', q: 'el correo' })).toBe(
			'/?date=2026-11-17&region=Pa%C3%ADs+Vasco&q=el+correo'
		);
		expect(standUrl({ date: null, region: '', q: 'x&y' })).toBe('/?q=x%26y');
	});
});
