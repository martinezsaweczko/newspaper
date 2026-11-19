import { lstatSync, realpathSync, statSync, type Stats } from 'node:fs';
import path from 'node:path';

/** How many folders deep under the shared folder editions are read (`a/b/c/d/x.pdf`). */
export const MAX_FOLDER_DEPTH = 4;

/** Edition id: base64url of the file's `/`-separated path relative to the shared folder. */
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
	/** `/`-separated path relative to the root. */
	rel: string;
	/** The file name alone (the last segment of `rel`). */
	name: string;
	abs: string;
	stat: Stats;
}

export interface ResolveOptions {
	/**
	 * Files on the ignore list (`DATA_DIR/ignore.json`) resolve to null as if missing. Called
	 * with the file name only, never the folders.
	 */
	ignore?: (file: string) => boolean;
}

/**
 * Turn an id into a file inside `root`, or null. Accepts what `scanTree` lists: a `*.pdf` file at
 * most `MAX_FOLDER_DEPTH` folders deep. Rejects traversal (`.`/`..`/empty segments), absolute
 * paths, backslashes, hidden files or folders, ignored files, symlinked folders, symlinks that
 * leave the root, and missing files.
 */
export function resolveId(
	root: string,
	id: string,
	options: ResolveOptions = {}
): ResolvedEdition | null {
	const rel = decodeId(id);
	if (rel === null) return null;
	if (rel.includes('\\') || rel.includes('\0') || path.isAbsolute(rel)) return null;
	const segments = rel.split('/');
	if (segments.length > MAX_FOLDER_DEPTH + 1) return null;
	// hidden segments, and with them `.` and `..`; empty ones (`a//b`, a leading or trailing `/`)
	if (segments.some((s) => s === '' || s.startsWith('.'))) return null;
	const name = segments[segments.length - 1];
	if (!/\.pdf$/i.test(name)) return null;
	if (options.ignore?.(name)) return null;

	const abs = path.join(root, ...segments);
	try {
		// folders on the way must be real folders: the scan never follows symlinked ones
		let dir = root;
		for (const segment of segments.slice(0, -1)) {
			dir = path.join(dir, segment);
			if (!lstatSync(dir).isDirectory()) return null;
		}
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
		return { rel, name, abs, stat };
	} catch {
		return null;
	}
}
