import { lstatSync, realpathSync, statSync, type Stats } from 'node:fs';
import path from 'node:path';

/** Edition id: base64url of the file's path relative to the shared folder. */
export function encodeId(relPath: string): string {
	return Buffer.from(relPath, 'utf8').toString('base64url');
}

export function decodeId(id: string): string | null {
	if (!/^[A-Za-z0-9_-]{1,1024}$/.test(id)) return null;
	const rel = Buffer.from(id, 'base64url').toString('utf8');
	// reject non-canonical encodings and invalid UTF-8 (which would not round-trip)
	return encodeId(rel) === id ? rel : null;
}

export interface ResolvedEdition {
	rel: string;
	abs: string;
	stat: Stats;
}

export interface ResolveOptions {
	/** Files on the ignore list (`DATA_DIR/ignore.json`) resolve to null as if missing. */
	ignore?: (file: string) => boolean;
}

/**
 * Turn an id into a file inside `root`, or null. Rejects traversal, absolute paths, anything that
 * is not a flat `*.pdf` file name, hidden files, ignored files, symlinks that leave the root, and
 * missing files.
 */
export function resolveId(
	root: string,
	id: string,
	options: ResolveOptions = {}
): ResolvedEdition | null {
	const rel = decodeId(id);
	if (rel === null) return null;
	if (rel.includes('/') || rel.includes('\\') || rel.includes('\0')) return null;
	if (rel.startsWith('.') || !/\.pdf$/i.test(rel) || path.isAbsolute(rel)) return null;
	if (options.ignore?.(rel)) return null;

	const abs = path.join(root, rel);
	try {
		const link = lstatSync(abs);
		if (link.isSymbolicLink()) {
			const realRoot = realpathSync(root);
			const real = realpathSync(abs);
			if (!real.startsWith(realRoot + path.sep)) return null;
		} else if (!link.isFile()) {
			return null;
		}
		const stat = statSync(abs);
		if (!stat.isFile()) return null;
		return { rel, abs, stat };
	} catch {
		return null;
	}
}
