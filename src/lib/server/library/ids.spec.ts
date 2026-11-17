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

	it('follows a symlink that stays inside the root', () => {
		expect(resolveId(root, encodeId('alias.pdf'))?.stat.isFile()).toBe(true);
	});

	it.each([
		['traversal', '../secret.pdf'],
		['nested traversal', 'x/../../secret.pdf'],
		['absolute path', '/etc/secret.pdf'],
		['subfolder', 'sub/file.pdf'],
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

	it('rejects malformed ids', () => {
		expect(resolveId(root, '')).toBeNull();
		expect(resolveId(root, 'not base64!')).toBeNull();
		expect(resolveId(root, '..%2F..%2Fetc%2Fpasswd')).toBeNull();
		// non-canonical encodings (padding bits set) do not round-trip
		expect(encodeId('a.pdf')).toBe('YS5wZGY');
		expect(decodeId('YS5wZGZ')).toBeNull();
	});
});
