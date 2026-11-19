import { readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { encodeId, MAX_FOLDER_DEPTH } from './ids.ts';
import { parseEditionName } from './parse.ts';

/** An edition as found on disk, before a region is assigned. */
export interface ScannedEdition {
	id: string;
	/** Path relative to the shared folder, `/`-separated (`nacional/el-pais-2026-11-17.pdf`). */
	file: string;
	/** The file name alone: the masthead, the date and the ignore list read only this. */
	name: string;
	masthead: string;
	slug: string;
	date: string;
	dateSource: 'filename' | 'mtime';
	/** The file name carried a download-copy marker (`Hola (1).pdf`). */
	copy: boolean;
	size: number;
	mtimeMs: number;
}

export interface ScanResult {
	editions: ScannedEdition[];
	/** Every folder that was read (absolute), the root first: their mtimes reveal added files. */
	dirs: string[];
}

/**
 * List the PDFs of the shared folder and its subfolders, at most `MAX_FOLDER_DEPTH` folders deep.
 * Subfolders are storage only (never regions). Hidden files and folders are skipped, symlinked
 * folders are never followed (no loops), and a symlinked file counts only when it stays inside
 * the root. Editions of `previous` whose path, size and mtime are unchanged are reused as they
 * are, so a rescan costs a `stat` per file and parses only new or changed names.
 */
export function scanTree(root: string, previous: ScannedEdition[] = []): ScanResult {
	const known = new Map(previous.map((e) => [e.file, e]));
	let realRoot: string;
	try {
		realRoot = realpathSync(root);
	} catch {
		return { editions: [], dirs: [] };
	}

	const editions: ScannedEdition[] = [];
	const dirs: string[] = [];
	const walk = (dir: string, relDir: string, depth: number) => {
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return; // vanished or unreadable folder
		}
		dirs.push(dir);
		for (const entry of entries) {
			const name = entry.name;
			if (name.startsWith('.')) continue;
			const abs = path.join(dir, name);
			const rel = relDir === '' ? name : `${relDir}/${name}`;
			if (entry.isDirectory()) {
				if (depth < MAX_FOLDER_DEPTH) walk(abs, rel, depth + 1);
				continue;
			}
			if (!/\.pdf$/i.test(name)) continue;
			if (!entry.isFile() && !entry.isSymbolicLink()) continue;
			try {
				if (entry.isSymbolicLink() && !realpathSync(abs).startsWith(realRoot + path.sep)) continue;
				const stat = statSync(abs);
				if (!stat.isFile()) continue;
				const prev = known.get(rel);
				if (prev && prev.size === stat.size && prev.mtimeMs === stat.mtimeMs) {
					editions.push(prev);
					continue;
				}
				editions.push({
					id: encodeId(rel),
					file: rel,
					name,
					...parseEditionName(name, stat.mtime),
					size: stat.size,
					mtimeMs: stat.mtimeMs
				});
			} catch {
				// vanished or unreadable while scanning: skip it
			}
		}
	};
	walk(root, '', 0);
	return { editions, dirs };
}

/** The editions of `scanTree`. */
export function scanFolder(root: string): ScannedEdition[] {
	return scanTree(root).editions;
}

/** mtimes of the folders of the last scan: changes when a file is added, removed or renamed. */
function treeSignature(dirs: string[]): string {
	return dirs
		.map((dir) => {
			try {
				return statSync(dir).mtimeMs;
			} catch {
				return -1;
			}
		})
		.join(',');
}

/**
 * Re-scans at most every `ttlMs`, or right away when the mtime of the root or of any folder seen
 * by the last scan changes (a file added, removed or renamed anywhere in the tree). Between
 * scans a request costs one `stat` per folder, not one per file. `scan` is injectable so the
 * library can wrap it in a span.
 */
export function createScanner(
	root: string,
	ttlMs = 5000,
	scan: (root: string, previous: ScannedEdition[]) => ScanResult = scanTree
) {
	let cached: ScanResult = { editions: [], dirs: [] };
	let at = 0;
	let signature: string | null = null;
	return (now = Date.now()): ScannedEdition[] => {
		const dirs = cached.dirs.length > 0 ? cached.dirs : [root];
		const current = treeSignature(dirs);
		if (current !== signature || now - at > ttlMs) {
			cached = scan(root, cached.editions);
			at = now;
			signature = treeSignature(cached.dirs.length > 0 ? cached.dirs : [root]);
		}
		return cached.editions;
	};
}
