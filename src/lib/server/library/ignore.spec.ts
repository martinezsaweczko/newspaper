import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	createIgnoreMatcher,
	createIgnoreStore,
	seedIgnoreFile,
	validateIgnore
} from './ignore.ts';

describe('createIgnoreMatcher', () => {
	const ignored = createIgnoreMatcher(['curriculum', 'CV', 'acta de reunion', 'Estadísticas', '']);

	it.each([
		['CV_David_Martinez.pdf', true],
		['cv-david (1).pdf', true],
		['Acta de reunión.pdf', true], // accent-insensitive, multi-word
		['ACTA_DE_REUNION_2026.pdf', true],
		['Curriculum Vitae.pdf', true],
		['estadisticas.pdf', true],
		['La Voz de Galicia 2026-11-17.pdf', false],
		['Cvitae.pdf', false], // whole words only
		['actas del pleno.pdf', false],
		['CURRICULUM.PDF', true]
	])('%s -> %s', (file, expected) => {
		expect(ignored(file)).toBe(expected);
	});

	it('ignores nothing with no patterns, and never matches the .pdf extension', () => {
		expect(createIgnoreMatcher([])('CV.pdf')).toBe(false);
		expect(createIgnoreMatcher(['pdf'])('La Voz.pdf')).toBe(false);
	});
});

describe('validateIgnore', () => {
	it('accepts { patterns: string[] } and rejects anything else', () => {
		expect(validateIgnore({ patterns: ['cv'] })).toEqual(['cv']);
		expect(() => validateIgnore({ patterns: 'cv' })).toThrow(/patterns/);
		expect(() => validateIgnore({ patterns: [1] })).toThrow(/patterns/);
		expect(() => validateIgnore([])).toThrow(/patterns/);
	});
});

describe('createIgnoreStore', () => {
	const dirs: string[] = [];
	const tmp = () => {
		const dir = mkdtempSync(path.join(tmpdir(), 'np-ignore-'));
		dirs.push(dir);
		return dir;
	};
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	it('seeds an empty ignore.json once and never overwrites it', () => {
		const dir = tmp();
		const file = seedIgnoreFile(dir);
		expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ patterns: [] });
		writeFileSync(file, JSON.stringify({ patterns: ['cv'] }));
		seedIgnoreFile(dir);
		expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ patterns: ['cv'] });
	});

	it('creates the file when missing and reloads it when its mtime changes', () => {
		const dir = tmp();
		const logs: string[] = [];
		const store = createIgnoreStore(dir, (m) => logs.push(m));
		expect(store.get()('CV.pdf')).toBe(false);
		expect(readFileSync(store.file, 'utf8')).toContain('patterns');

		writeFileSync(store.file, JSON.stringify({ patterns: ['cv'] }));
		utimesSync(store.file, new Date(), new Date(Date.now() + 5000));
		expect(store.get()('CV.pdf')).toBe(true);

		// a broken file keeps the last good list and logs once
		writeFileSync(store.file, '{ nope');
		utimesSync(store.file, new Date(), new Date(Date.now() + 10_000));
		expect(store.get()('CV.pdf')).toBe(true);
		expect(store.get()('CV.pdf')).toBe(true);
		expect(logs).toHaveLength(1);
	});
});
