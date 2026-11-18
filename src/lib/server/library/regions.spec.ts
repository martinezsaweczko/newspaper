import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	createRegionMap,
	createRegionStore,
	defaultRegions,
	NATIONAL,
	seedRegionsFile,
	validateRegions
} from './regions.ts';

describe('createRegionMap', () => {
	const map = createRegionMap([
		{ name: 'Andalucía', match: ['Sur', 'Diario de Sevilla'] },
		{ name: 'Galicia', match: ['La Voz de Galicia'] },
		{ name: 'Asturias', match: ['la voz'] },
		{ name: 'Aragón', match: ['Heraldo de Aragón'] }
	]);

	it.each([
		['Diario de Sevilla', 'Andalucía'],
		['DIARIO DE SEVILLA', 'Andalucía'],
		['Sur', 'Andalucía'],
		['Europa Sur', 'Andalucía'],
		['Heraldo de Aragon', 'Aragón'], // no accent in the filename
		['heraldo-de-aragón', 'Aragón'],
		['La Voz de Galicia', 'Galicia'], // longest pattern wins over "la voz"
		['La Voz', 'Asturias'],
		['Surf Magazine', NATIONAL], // whole words only
		['Gaceta Nacional', NATIONAL]
	])('%s -> %s', (masthead, region) => {
		expect(map.regionOf(masthead)).toBe(region);
	});

	it('keeps the file order and leaves Nacional out of it', () => {
		expect(map.order).toEqual(['Andalucía', 'Galicia', 'Asturias', 'Aragón']);
	});
});

describe('default mapping', () => {
	const map = createRegionMap(defaultRegions);
	it.each([
		['La Voz de Galicia', 'Galicia'],
		['Faro de Vigo', 'Galicia'],
		['La Vanguardia', 'Catalunya'],
		['Ara', 'Catalunya'],
		['El Correo', 'País Vasco'],
		['El Correo Gallego', 'Galicia'],
		['Levante EMV', 'Comunitat Valenciana'],
		['Las Provincias', 'Comunitat Valenciana'],
		['La Provincia', 'Canarias'],
		['Diario de Sevilla', 'Andalucía'],
		['El Eco de Sevilla', 'Andalucía'],
		['Heraldo de Aragon', 'Aragón'],
		['La Nueva España', 'Asturias'],
		['El Norte de Castilla', 'Castilla y León'],
		['Canarias7', 'Canarias'],
		['La Verdad', 'Murcia'],
		['Diario de Navarra', 'Navarra'],
		['Ultima Hora', 'Baleares'],
		['El Diario Montañés', 'Cantabria'],
		['El Periodico de Aragon', 'Aragón'],
		['Gaceta Nacional', NATIONAL],
		['El Observador', NATIONAL]
	])('%s -> %s', (masthead, region) => {
		expect(map.regionOf(masthead)).toBe(region);
	});
});

describe('validateRegions', () => {
	it('rejects malformed files', () => {
		expect(() => validateRegions({})).toThrow();
		expect(() => validateRegions({ regions: [{ name: '', match: [] }] })).toThrow();
		expect(() => validateRegions({ regions: [{ name: 'X', match: 'x' }] })).toThrow();
	});
});

describe('createRegionStore', () => {
	let dir: string;
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('seeds regions.json once and reloads it when its mtime changes', () => {
		dir = mkdtempSync(path.join(tmpdir(), 'np-regions-'));
		const file = seedRegionsFile(dir);
		expect(JSON.parse(readFileSync(file, 'utf8')).regions.length).toBe(defaultRegions.length);

		const store = createRegionStore(dir, () => {});
		expect(store.get().regionOf('Gaceta Nacional')).toBe(NATIONAL);

		writeFileSync(file, JSON.stringify({ regions: [{ name: 'Test', match: ['gaceta'] }] }));
		utimesSync(file, new Date(), new Date(Date.now() + 5000));
		expect(store.get().regionOf('Gaceta Nacional')).toBe('Test');

		// a broken edit keeps the last good mapping
		const logs: string[] = [];
		const store2 = createRegionStore(dir, (m) => logs.push(m));
		expect(store2.get().regionOf('Gaceta Nacional')).toBe('Test');
		writeFileSync(file, '{ not json');
		utimesSync(file, new Date(), new Date(Date.now() + 10000));
		expect(store2.get().regionOf('Gaceta Nacional')).toBe('Test');
		expect(logs).toHaveLength(1);
	});

	it('creates regions.json when it is missing', () => {
		dir = mkdtempSync(path.join(tmpdir(), 'np-regions-'));
		const store = createRegionStore(dir, () => {});
		expect(store.get().regionOf('Faro de Vigo')).toBe('Galicia');
		expect(readFileSync(store.file, 'utf8')).toContain('Galicia');
	});
});
