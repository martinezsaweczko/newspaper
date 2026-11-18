import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import defaults from '../regions.default.json';
import { normalise } from './text.ts';

/** Mastheads that match no region. Always listed first. */
export const NATIONAL = 'Nacional';

export interface RegionConfig {
	name: string;
	match: string[];
}

export interface RegionMap {
	/** Region names in the order of the file (Nacional excluded). */
	order: string[];
	/** Name of the region for a masthead (display or normalised form). */
	regionOf(masthead: string): string;
}

/** Validate the parsed contents of a regions file. Throws with a readable reason. */
export function validateRegions(data: unknown): RegionConfig[] {
	const regions = (data as { regions?: unknown })?.regions;
	if (!Array.isArray(regions)) throw new Error('expected { "regions": [ ... ] }');
	return regions.map((r, i) => {
		const { name, match } = (r ?? {}) as { name?: unknown; match?: unknown };
		if (typeof name !== 'string' || name.trim() === '') {
			throw new Error(`regions[${i}].name must be a non-empty string`);
		}
		if (!Array.isArray(match) || !match.every((m) => typeof m === 'string')) {
			throw new Error(`regions[${i}].match must be an array of strings`);
		}
		return { name: name.trim(), match };
	});
}

/**
 * Build the matcher. Patterns are compared accent- and case-insensitively on whole words of the
 * normalised masthead; the longest matching pattern wins across all regions
 * (`la voz de galicia` beats `la voz`, `sur` never matches `surf`).
 */
export function createRegionMap(regions: RegionConfig[]): RegionMap {
	const patterns = regions
		.flatMap((region) => region.match.map((m) => ({ region: region.name, pattern: normalise(m) })))
		.filter((p) => p.pattern !== '')
		.sort((a, b) => b.pattern.length - a.pattern.length);

	const order = [...new Set(regions.map((r) => r.name))].filter((n) => n !== NATIONAL);

	return {
		order,
		regionOf(masthead) {
			const haystack = ` ${normalise(masthead)} `;
			for (const { region, pattern } of patterns) {
				if (haystack.includes(` ${pattern} `)) return region;
			}
			return NATIONAL;
		}
	};
}

export const defaultRegions: RegionConfig[] = validateRegions(defaults);

/** Copy the default mapping to `DATA_DIR/regions.json` when it does not exist yet. */
export function seedRegionsFile(dataDir: string): string {
	const file = path.join(dataDir, 'regions.json');
	if (!existsSync(file)) {
		mkdirSync(dataDir, { recursive: true });
		writeFileSync(file, JSON.stringify({ regions: defaultRegions }, null, '\t') + '\n', {
			flag: 'wx'
		});
	}
	return file;
}

/**
 * Reads `DATA_DIR/regions.json`, reloading it whenever its mtime changes.
 * A broken file keeps the last good mapping (or the defaults) and logs the reason once.
 */
export function createRegionStore(dataDir: string, log: (msg: string) => void = console.warn) {
	const file = path.join(dataDir, 'regions.json');
	let loadedMtime = -1;
	let current: RegionMap = createRegionMap(defaultRegions);

	return {
		file,
		get(): RegionMap {
			let mtime: number;
			try {
				mtime = statSync(file).mtimeMs;
			} catch {
				try {
					seedRegionsFile(dataDir);
					mtime = statSync(file).mtimeMs;
				} catch (err) {
					if (loadedMtime !== -2) log(`regions: cannot create ${file}: ${String(err)}`);
					loadedMtime = -2;
					return current;
				}
			}
			if (mtime === loadedMtime) return current;
			loadedMtime = mtime;
			try {
				current = createRegionMap(validateRegions(JSON.parse(readFileSync(file, 'utf8'))));
			} catch (err) {
				log(
					`regions: ignoring invalid ${file} (${(err as Error).message}); keeping the last good mapping`
				);
			}
			return current;
		}
	};
}
