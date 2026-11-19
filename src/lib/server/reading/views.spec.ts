import { describe, expect, it } from 'vitest';
import { logSearch, nameOf, parseLogQuery, toCsv, type ReadingView } from './views.ts';

describe('log filters in the URL', () => {
	it('parses and normalises usuario, periodico, region, dates and page', () => {
		const q = parseLogQuery(
			new URLSearchParams(
				'usuario=12&periodico=la-voz&region=Galicia&desde=18/11/2026&hasta=2026-11-01&pagina=3'
			)
		);
		// swapped: desde after hasta
		expect(q).toEqual({
			usuario: '12',
			periodico: 'la-voz',
			region: 'Galicia',
			desde: '2026-11-01',
			hasta: '2026-11-18',
			pagina: 3
		});
		expect(logSearch(q)).toBe(
			'?usuario=12&periodico=la-voz&region=Galicia&desde=2026-11-01&hasta=2026-11-18'
		);
		expect(logSearch(q, 3)).toContain('&pagina=3');
	});

	it('drops what it cannot use', () => {
		const q = parseLogQuery(
			new URLSearchParams('usuario=x&periodico=../etc&desde=31/02/2026&pagina=-2')
		);
		expect(q).toEqual({
			usuario: null,
			periodico: null,
			region: null,
			desde: null,
			hasta: null,
			pagina: 1
		});
		expect(logSearch(q)).toBe('');
		expect(parseLogQuery(new URLSearchParams('usuario=local:david')).usuario).toBe('local:david');
	});
});

describe('CSV export', () => {
	const row = (over: Partial<ReadingView>): ReadingView => ({
		id: 1,
		at: '2026-11-18T09:05',
		reader: { key: '1', name: 'Ana', email: 'ana@example.com', local: false },
		masthead: 'La Voz de Galicia',
		slug: 'la-voz-de-galicia',
		region: 'Galicia',
		editionDate: '2026-11-18',
		kind: 'open',
		...over
	});

	it('writes Spanish headers, European dates, ; and CRLF, with a BOM', () => {
		const csv = toCsv([
			row({}),
			row({
				id: 2,
				kind: 'download',
				reader: { key: 'local:root', name: 'root', email: null, local: true }
			})
		]);
		expect(csv.startsWith('﻿')).toBe(true);
		expect(csv.slice(1).split('\r\n')).toEqual([
			'"Fecha y hora";"Lector";"Email";"Periódico";"Región";"Edición";"Tipo"',
			'"18/11/2026 09:05";"Ana";"ana@example.com";"La Voz de Galicia";"Galicia";"18/11/2026";"Abierto"',
			'"18/11/2026 09:05";"admin local: root";"";"La Voz de Galicia";"Galicia";"18/11/2026";"Descargado"',
			''
		]);
	});

	it('quotes and defuses formulas in names', () => {
		const csv = toCsv([
			row({ reader: { key: '1', name: '=HYPERLINK("x")', email: null, local: false } })
		]);
		expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
	});
});

describe('masthead names', () => {
	it('uses the folder name, or title-cases a slug whose files are gone', () => {
		const names = new Map([['la-voz-de-galicia', 'La Voz de Galicia']]);
		expect(nameOf('la-voz-de-galicia', names)).toBe('La Voz de Galicia');
		expect(nameOf('diario-de-ferrol', names)).toBe('Diario de Ferrol');
	});
});
