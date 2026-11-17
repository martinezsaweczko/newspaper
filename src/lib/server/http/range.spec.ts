import { describe, expect, it } from 'vitest';
import { contentDisposition, parseRange } from './range.ts';

describe('parseRange', () => {
	it.each([
		[null, { kind: 'full' }],
		['', { kind: 'full' }],
		['bytes=0-99', { kind: 'partial', start: 0, end: 99 }],
		['bytes=100-', { kind: 'partial', start: 100, end: 999 }],
		['bytes=-200', { kind: 'partial', start: 800, end: 999 }],
		['bytes=-5000', { kind: 'partial', start: 0, end: 999 }],
		['bytes=900-5000', { kind: 'partial', start: 900, end: 999 }],
		['BYTES = 1-1', { kind: 'partial', start: 1, end: 1 }],
		['bytes=1000-', { kind: 'unsatisfiable' }],
		['bytes=-0', { kind: 'unsatisfiable' }],
		['bytes=50-10', { kind: 'full' }],
		['bytes=0-1,5-6', { kind: 'full' }],
		['items=0-1', { kind: 'full' }],
		['bytes=abc', { kind: 'full' }],
		['bytes=-', { kind: 'full' }]
	])('%s', (header, expected) => {
		expect(parseRange(header, 1000)).toEqual(expected);
	});

	it('treats any range on an empty file as unsatisfiable', () => {
		expect(parseRange('bytes=0-', 0)).toEqual({ kind: 'unsatisfiable' });
	});
});

describe('contentDisposition', () => {
	it('gives an ASCII fallback and an RFC 5987 name', () => {
		expect(contentDisposition('inline', 'Última "Hora" 2026.pdf')).toBe(
			`inline; filename="Ultima _Hora_ 2026.pdf"; filename*=UTF-8''%C3%9Altima%20%22Hora%22%202026.pdf`
		);
		expect(contentDisposition('attachment', "l'avenç.pdf")).toBe(
			`attachment; filename="l'avenc.pdf"; filename*=UTF-8''l%27aven%C3%A7.pdf`
		);
	});
});
