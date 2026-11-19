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
			dateSource: 'filename',
			copy: false
		});
	});

	// Synthetic names in the styles of the real shared folder (short dates, copies, articles).
	it.each([
		// DD-MM-YY at the start, `-` separator -> 20YY
		['06-10-26-Diario de Ferrol.pdf', 'Diario de Ferrol', '2026-10-06'],
		['14-10-26-El Mundo.pdf', 'El Mundo', '2026-10-14'],
		['08-11-26-El Pais Semanal.pdf', 'El Pais Semanal', '2026-11-08'],
		['25-10-26-XL Semanal.pdf', 'XL Semanal', '2026-10-25'],
		['25-09-26-LNE Gijon.pdf', 'LNE Gijon', '2026-09-25'],
		// DD-MM-YY at the end, other separators
		['Diario de Ferrol 06.10.26.pdf', 'Diario de Ferrol', '2026-10-06'],
		['diario_de_ferrol_06_10_26.pdf', 'Diario de Ferrol', '2026-10-06'],
		['El Mundo 14 10 26.pdf', 'El Mundo', '2026-10-14'],
		// MM-YY (monthly magazines) -> the 1st of the month
		['10-26-Icon EP.pdf', 'Icon EP', '2026-10-01'],
		['12-26-Muy Historia.pdf', 'Muy Historia', '2026-12-01'],
		['Muy Historia 12-26.pdf', 'Muy Historia', '2026-12-01'],
		// DD-MM without a year: the year of the mtime (03/11/2026)
		['25-10-Lecturas.pdf', 'Lecturas', '2026-10-25'],
		['Lecturas_25_10.pdf', 'Lecturas', '2026-10-25'],
		// ... unless that lands more than ~2 months after the mtime: the previous year
		['20-12-Lecturas.pdf', 'Lecturas', '2026-12-20'],
		['10-01-Lecturas.pdf', 'Lecturas', '2026-01-10'],
		['15-02-Lecturas.pdf', 'Lecturas', '2026-02-15'],
		// the existing long formats still win over the short ones
		['diario de sevilla 17-11-2026.pdf', 'Diario de Sevilla', '2026-11-17'],
		['El_Correo_20261117.pdf', 'El Correo', '2026-11-17']
	])('short date: %s', (file, masthead, date) => {
		const parsed = parseEditionName(file, MTIME);
		expect(parsed).toMatchObject({ masthead, date, dateSource: 'filename' });
	});

	it('rolls a year-less date back a year when it would be far in the future', () => {
		const january = new Date(2027, 0, 5, 12); // 05/01/2027
		expect(parseEditionName('25-11-Lecturas.pdf', january).date).toBe('2026-11-25');
		expect(parseEditionName('20-02-Lecturas.pdf', january).date).toBe('2027-02-20');
		expect(parseEditionName('20-04-Lecturas.pdf', january).date).toBe('2026-04-20');
	});

	it.each([
		['Canarias7.pdf', 'Canarias7'],
		['20 Minutos.pdf', '20 Minutos'],
		['20-minutos.pdf', '20 Minutos'],
		['Page 1 · Prepare.pdf', 'Page 1 Prepare'],
		['Revista 10-99.pdf', 'Revista 10 99'], // 2099 is no plausible month-year
		['Las 24 Horas.pdf', 'Las 24 Horas'],
		['Diario 32-13.pdf', 'Diario 32 13'], // neither a day-month nor a month-year
		['2 de Mayo 7.pdf', '2 de Mayo 7']
	])('keeps masthead numbers: %s', (file, masthead) => {
		expect(parseEditionName(file, MTIME)).toMatchObject({ masthead, dateSource: 'mtime' });
	});

	it.each([
		['08-11-26-Diario de Leon (1).pdf', 'Diario de Leon', 'diario-de-leon', '2026-11-08'],
		['25-11-Hola (3).pdf', 'Hola', 'hola', '2026-11-25'],
		['25-11-Hola(2).pdf', 'Hola', 'hola', '2026-11-25'],
		['la-voz-de-galicia-2026-11-17_1.pdf', 'La Voz de Galicia', 'la-voz-de-galicia', '2026-11-17'],
		['el-observador-2026-11-17 (1).pdf', 'El Observador', 'el-observador', '2026-11-17']
	])('strips a copy marker: %s', (file, masthead, slug, date) => {
		expect(parseEditionName(file, MTIME)).toEqual({
			masthead,
			slug,
			date,
			dateSource: 'filename',
			copy: true
		});
	});

	it('capitalises the first word after the date, keeping small words lower elsewhere', () => {
		expect(parseEditionName('08-11-26-el pais semanal.pdf', MTIME).masthead).toBe(
			'El Pais Semanal'
		);
		expect(parseEditionName('25-10-26-El Periodico Catalunya.pdf', MTIME).masthead).toBe(
			'El Periodico Catalunya'
		);
		expect(parseEditionName('2026-11-17 la voz de galicia.pdf', MTIME).masthead).toBe(
			'La Voz de Galicia'
		);
		// accents stay as they are in the filename; none are invented
		expect(parseEditionName('08-11-26-El País Semanal.pdf', MTIME).masthead).toBe(
			'El País Semanal'
		);
	});

	it('falls back to the modification date', () => {
		expect(parseEditionName('la-razon.pdf', MTIME)).toEqual({
			masthead: 'La Razon',
			slug: 'la-razon',
			date: '2026-11-03',
			dateSource: 'mtime',
			copy: false
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
