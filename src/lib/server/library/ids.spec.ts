import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodeId, encodeId, resolveId } from './ids.ts';

let base: string;
let root: string;

beforeAll(() => {
	base = mkdtempSync(path.join(tmpdir(), 'np-ids-'));
	root = path.join(base, 'papers');
	mkdirSync(root);
	writeFileSync(path.join(root, 'la-voz-de-galicia-2026-11-17.pdf'), '%PDF-1.4\n');
	writeFileSync(path.join(root, 'Última Hora 2026-11-17.pdf'), '%PDF-1.4\n');
	writeFileSync(path.join(root, 'notes.txt'), 'x');
	writeFileSync(path.join(root, '.hidden.pdf'), 'x');
	mkdirSync(path.join(root, 'folder.pdf'));
	writeFileSync(path.join(base, 'secret.pdf'), 'outside');
	symlinkSync(path.join(base, 'secret.pdf'), path.join(root, 'escape.pdf'));
	symlinkSync(path.join(root, 'la-voz-de-galicia-2026-11-17.pdf'), path.join(root, 'alias.pdf'));
	mkdirSync(path.join(root, 'nacional', 'galicia'), { recursive: true });
	writeFileSync(path.join(root, 'nacional', 'el-pais-2026-11-17.pdf'), '%PDF-1.4\n');
	writeFileSync(
		path.join(root, 'nacional', 'galicia', 'Faro de Vigo 2026-11-17.pdf'),
		'%PDF-1.4\n'
	);
	mkdirSync(path.join(root, '.private'));
	writeFileSync(path.join(root, '.private', 'el-mundo-2026-11-17.pdf'), '%PDF-1.4\n');
	writeFileSync(path.join(root, 'nacional', '.hidden.pdf'), '%PDF-1.4\n');
	mkdirSync(path.join(root, 'a', 'b', 'c', 'd', 'e'), { recursive: true });
	writeFileSync(path.join(root, 'a', 'b', 'c', 'd', 'deep-2026-11-17.pdf'), '%PDF-1.4\n');
	writeFileSync(path.join(root, 'a', 'b', 'c', 'd', 'e', 'too-deep-2026-11-17.pdf'), '%PDF-1.4\n');
	mkdirSync(path.join(base, 'outside'));
	writeFileSync(path.join(base, 'outside', 'secret.pdf'), 'outside');
	symlinkSync(path.join(base, 'outside'), path.join(root, 'linked'));
	symlinkSync(path.join(root, 'nacional'), path.join(root, 'loop'));
});

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('ids', () => {
	it('round-trips names, accents included', () => {
		for (const name of ['la-voz-de-galicia-2026-11-17.pdf', 'Última Hora 2026-11-17.pdf']) {
			const id = encodeId(name);
			expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
			expect(decodeId(id)).toBe(name);
			expect(resolveId(root, id)?.rel).toBe(name);
		}
	});

	it('round-trips nested paths, and gives the file name alone', () => {
		for (const rel of [
			'nacional/el-pais-2026-11-17.pdf',
			'nacional/galicia/Faro de Vigo 2026-11-17.pdf',
			'a/b/c/d/deep-2026-11-17.pdf'
		]) {
			const id = encodeId(rel);
			expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
			expect(decodeId(id)).toBe(rel);
			const resolved = resolveId(root, id);
			expect(resolved?.rel).toBe(rel);
			expect(resolved?.name).toBe(rel.split('/').pop());
			expect(resolved?.abs).toBe(path.join(root, ...rel.split('/')));
		}
	});

	it('follows a symlink that stays inside the root', () => {
		expect(resolveId(root, encodeId('alias.pdf'))?.stat.isFile()).toBe(true);
	});

	it.each([
		['traversal', '../secret.pdf'],
		['nested traversal', 'x/../../secret.pdf'],
		['absolute path', '/etc/secret.pdf'],
		['missing subfolder', 'sub/file.pdf'],
		['hidden folder', '.private/el-mundo-2026-11-17.pdf'],
		['hidden file in a subfolder', 'nacional/.hidden.pdf'],
		['dot segment', 'nacional/./el-pais-2026-11-17.pdf'],
		['traversal back in', 'nacional/../nacional/el-pais-2026-11-17.pdf'],
		['empty segment', 'nacional//el-pais-2026-11-17.pdf'],
		['leading slash', '/nacional/el-pais-2026-11-17.pdf'],
		['backslash separator', 'nacional\\el-pais-2026-11-17.pdf'],
		['deeper than the limit', 'a/b/c/d/e/too-deep-2026-11-17.pdf'],
		['symlinked folder leaving the root', 'linked/secret.pdf'],
		['symlinked folder inside the root', 'loop/el-pais-2026-11-17.pdf'],
		['a folder', 'nacional'],
		['backslash', '..\\secret.pdf'],
		['not a pdf', 'notes.txt'],
		['hidden file', '.hidden.pdf'],
		['directory', 'folder.pdf'],
		['symlink leaving the root', 'escape.pdf'],
		['missing file', 'missing-2026-11-17.pdf'],
		['NUL byte', 'a\0.pdf']
	])('rejects %s', (_label, rel) => {
		expect(resolveId(root, encodeId(rel))).toBeNull();
	});

	it('rejects a file on the ignore list', () => {
		const id = encodeId('la-voz-de-galicia-2026-11-17.pdf');
		const ignore = (file: string) => file.startsWith('la-voz');
		expect(resolveId(root, id, { ignore })).toBeNull();
		expect(resolveId(root, encodeId('alias.pdf'), { ignore })?.rel).toBe('alias.pdf');
	});

	it('matches the ignore list on the file name, never the folders', () => {
		const seen: string[] = [];
		const ignore = (file: string) => (seen.push(file), file.startsWith('nacional'));
		const rel = 'nacional/el-pais-2026-11-17.pdf';
		expect(resolveId(root, encodeId(rel), { ignore })?.rel).toBe(rel);
		expect(seen).toEqual(['el-pais-2026-11-17.pdf']);
		expect(resolveId(root, encodeId(rel), { ignore: (f) => f.startsWith('el-pais') })).toBeNull();
	});

	it('rejects malformed ids', () => {
		expect(resolveId(root, '')).toBeNull();
		expect(resolveId(root, 'not base64!')).toBeNull();
		expect(resolveId(root, '..%2F..%2Fetc%2Fpasswd')).toBeNull();
		// non-canonical encodings (padding bits set) do not round-trip
		expect(encodeId('a.pdf')).toBe('YS5wZGY');
		expect(decodeId('YS5wZGZ')).toBeNull();
	});
});
