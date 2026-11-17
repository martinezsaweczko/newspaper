import { describe, expect, it } from 'vitest';
import { parseEditionName } from './parse.ts';
import { normalise, slugify } from './text.ts';

const MTIME = new Date(2026, 10, 3, 12, 0, 0); // 03/11/2026 local

describe('parseEditionName', () => {
	it.each([
		['la-voz-de-galicia-2026-11-17.pdf', 'La Voz de Galicia', 'la-voz-de-galicia', '2026-11-17'],
		['El_Correo_20261116.pdf', 'El Correo', 'el-correo', '2026-11-16'],
		['diario de sevilla 17-11-2026.PDF', 'Diario de Sevilla', 'diario-de-sevilla', '2026-11-17'],
		['heraldo_de_aragon_17_11_2026.pdf', 'Heraldo de Aragon', 'heraldo-de-aragon', '2026-11-17'],
		['2026-11-15.levante-EMV.pdf', 'Levante EMV', 'levante-emv', '2026-11-15'],
		['Última Hora 2026.11.17.pdf', 'Última Hora', 'ultima-hora', '2026-11-17'],
		['DEL-norte-2026-11-17.pdf', 'Del Norte', 'del-norte', '2026-11-17'],
		['canarias7-20261117.pdf', 'Canarias7', 'canarias7', '2026-11-17']
	])('%s', (file, masthead, slug, date) => {
		expect(parseEditionName(file, MTIME)).toEqual({
			masthead,
			slug,
			date,
			dateSource: 'filename'
		});
	});

	it('falls back to the modification date', () => {
		expect(parseEditionName('la-razon.pdf', MTIME)).toEqual({
			masthead: 'La Razon',
			slug: 'la-razon',
			date: '2026-11-03',
			dateSource: 'mtime'
		});
	});

	it('ignores impossible dates and keeps the digits in the masthead', () => {
		const parsed = parseEditionName('diario-2026-02-30.pdf', MTIME);
		expect(parsed.dateSource).toBe('mtime');
		expect(parsed.masthead).toBe('Diario 2026 02 30');
	});

	it('names a date-only file Untitled', () => {
		expect(parseEditionName('2026-11-17.pdf', MTIME).masthead).toBe('Untitled');
	});
});

describe('text helpers', () => {
	it('normalises accents, case and punctuation', () => {
		expect(normalise('  Faro_de-VIGO  ')).toBe('faro de vigo');
		expect(normalise('Heraldo de Aragón')).toBe('heraldo de aragon');
		expect(normalise('España')).toBe('espana');
		expect(slugify('La Nueva España')).toBe('la-nueva-espana');
	});
});
