import { describe, expect, it } from 'vitest';
import { dedupeEditions } from './dedupe.ts';
import type { ScannedEdition } from './scan.ts';

function scanned(file: string, slug: string, date: string, extra: Partial<ScannedEdition> = {}) {
	return {
		id: file,
		file,
		masthead: slug,
		slug,
		date,
		dateSource: 'filename',
		copy: /\(\d\)\.pdf$/.test(file),
		size: 100,
		mtimeMs: 1,
		...extra
	} satisfies ScannedEdition;
}

describe('dedupeEditions', () => {
	it('keeps one file per masthead and date', () => {
		const out = dedupeEditions([
			scanned('25-11-Hola (1).pdf', 'hola', '2026-11-25', { mtimeMs: 9 }),
			scanned('25-11-Hola.pdf', 'hola', '2026-11-25'),
			scanned('25-11-Hola (2).pdf', 'hola', '2026-11-25', { mtimeMs: 7 }),
			scanned('18-10-26-Hola.pdf', 'hola', '2026-10-18'),
			scanned('25-11-26-Semana.pdf', 'semana', '2026-11-25')
		]);
		expect(out.map((e) => e.file)).toEqual([
			'25-11-Hola.pdf',
			'18-10-26-Hola.pdf',
			'25-11-26-Semana.pdf'
		]);
	});

	it('prefers the larger file, then the original, then the newest', () => {
		const bigger = dedupeEditions([
			scanned('08-11-26-Diario de Leon.pdf', 'diario-de-leon', '2026-11-08', { size: 10 }),
			scanned('08-11-26-Diario de Leon (1).pdf', 'diario-de-leon', '2026-11-08', { size: 900 })
		]);
		expect(bigger.map((e) => e.file)).toEqual(['08-11-26-Diario de Leon (1).pdf']);

		const newer = dedupeEditions([
			scanned('la-voz-2026-11-17.pdf', 'la-voz', '2026-11-17', { mtimeMs: 1 }),
			scanned('La Voz 17-11-2026.pdf', 'la-voz', '2026-11-17', { mtimeMs: 2 })
		]);
		expect(newer.map((e) => e.file)).toEqual(['La Voz 17-11-2026.pdf']);
	});
});
