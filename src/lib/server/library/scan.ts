import { readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { encodeId } from './ids.ts';
import { parseEditionName } from './parse.ts';

/** An edition as found on disk, before a region is assigned. */
export interface ScannedEdition {
	id: string;
	file: string;
	masthead: string;
	slug: string;
	date: string;
	dateSource: 'filename' | 'mtime';
	size: number;
	mtimeMs: number;
}

/** List the PDFs of the flat shared folder. Hidden files, folders and other files are ignored. */
export function scanFolder(root: string): ScannedEdition[] {
	let entries;
	try {
		entries = readdirSync(root, { withFileTypes: true });
	} catch {
		return [];
	}
	let realRoot: string;
	try {
		realRoot = realpathSync(root);
	} catch {
		return [];
	}

	const editions: ScannedEdition[] = [];
	for (const entry of entries) {
		const name = entry.name;
		if (name.startsWith('.') || !/\.pdf$/i.test(name)) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;
		const abs = path.join(root, name);
		try {
			if (entry.isSymbolicLink() && !realpathSync(abs).startsWith(realRoot + path.sep)) continue;
			const stat = statSync(abs);
			if (!stat.isFile()) continue;
			const parsed = parseEditionName(name, stat.mtime);
			editions.push({
				id: encodeId(name),
				file: name,
				...parsed,
				size: stat.size,
				mtimeMs: stat.mtimeMs
			});
		} catch {
			// vanished or unreadable while scanning: skip it
		}
	}
	return editions;
}

/** Re-scans at most every `ttlMs`, or right away when the folder's mtime changes. */
export function createScanner(root: string, ttlMs = 5000) {
	let cached: ScannedEdition[] = [];
	let at = 0;
	let dirMtime = -1;
	return (now = Date.now()): ScannedEdition[] => {
		let mtime = -1;
		try {
			mtime = statSync(root).mtimeMs;
		} catch {
			// missing folder: scanFolder returns []
		}
		if (mtime !== dirMtime || now - at > ttlMs) {
			cached = scanFolder(root);
			at = now;
			dirMtime = mtime;
		}
		return cached;
	};
}
