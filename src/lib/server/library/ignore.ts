import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import defaults from '../ignore.default.json';
import { normalise } from './text.ts';

/** True when a file of the shared folder is on the ignore list. */
export type IgnoreMatcher = (file: string) => boolean;

/** Validate the parsed contents of an ignore file. Throws with a readable reason. */
export function validateIgnore(data: unknown): string[] {
	const patterns = (data as { patterns?: unknown })?.patterns;
	if (!Array.isArray(patterns) || !patterns.every((p) => typeof p === 'string')) {
		throw new Error('expected { "patterns": [ "...", ... ] } (strings)');
	}
	return patterns;
}

/**
 * Patterns are compared case- and accent-insensitively on whole words of the normalised file
 * name without its `.pdf` extension, the same way as region patterns (`cv` matches
 * `CV_David.pdf`, never `Cvitae.pdf`; `acta de reunion` matches `Acta de reunión.pdf`).
 */
export function createIgnoreMatcher(patterns: string[]): IgnoreMatcher {
	const words = patterns.map(normalise).filter((p) => p !== '');
	if (words.length === 0) return () => false;
	return (file) => {
		const haystack = ` ${normalise(file.replace(/\.pdf$/i, ''))} `;
		return words.some((w) => haystack.includes(` ${w} `));
	};
}

/** Create an empty `DATA_DIR/ignore.json` (from ignore.default.json) when it does not exist. */
export function seedIgnoreFile(dataDir: string): string {
	const file = path.join(dataDir, 'ignore.json');
	if (!existsSync(file)) {
		mkdirSync(dataDir, { recursive: true });
		writeFileSync(file, JSON.stringify({ patterns: validateIgnore(defaults) }, null, '\t') + '\n', {
			flag: 'wx'
		});
	}
	return file;
}

/**
 * Reads `DATA_DIR/ignore.json`, reloading it whenever its mtime changes.
 * A broken file keeps the last good list (or none) and logs the reason once.
 */
export function createIgnoreStore(dataDir: string, log: (msg: string) => void = console.warn) {
	const file = path.join(dataDir, 'ignore.json');
	let loadedMtime = -1;
	let current: IgnoreMatcher = createIgnoreMatcher([]);

	return {
		file,
		get(): IgnoreMatcher {
			let mtime: number;
			try {
				mtime = statSync(file).mtimeMs;
			} catch {
				try {
					seedIgnoreFile(dataDir);
					mtime = statSync(file).mtimeMs;
				} catch (err) {
					if (loadedMtime !== -2) log(`ignore: cannot create ${file}: ${String(err)}`);
					loadedMtime = -2;
					return current;
				}
			}
			if (mtime === loadedMtime) return current;
			loadedMtime = mtime;
			try {
				current = createIgnoreMatcher(validateIgnore(JSON.parse(readFileSync(file, 'utf8'))));
			} catch (err) {
				log(
					`ignore: ignoring invalid ${file} (${(err as Error).message}); keeping the last good list`
				);
			}
			return current;
		}
	};
}
