import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeId, resolveId } from './ids.ts';
import { createScanner, scanFolder, scanTree } from './scan.ts';

let base: string;
let root: string;

function pdf(rel: string) {
	const file = path.join(root, ...rel.split('/'));
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, '%PDF-1.4\n');
}

beforeEach(() => {
	base = mkdtempSync(path.join(tmpdir(), 'np-scan-'));
	root = path.join(base, 'papers');
	mkdirSync(root);
});

afterEach(() => rmSync(base, { recursive: true, force: true }));

const files = () =>
	scanFolder(root)
		.map((e) => e.file)
		.sort();

describe('scanFolder', () => {
	it('reads PDFs in subfolders, with ids that resolve back', () => {
		pdf('el-pais-2026-11-17.pdf');
		pdf('nacional/abc-2026-11-17.pdf');
		pdf('internacional/le-monde-2026-11-17.pdf');
		pdf('magazine/semana/hola-2026-11-17.pdf');
		writeFileSync(path.join(root, 'nacional', 'notes.txt'), 'x');
		expect(files()).toEqual([
			'el-pais-2026-11-17.pdf',
			'internacional/le-monde-2026-11-17.pdf',
			'magazine/semana/hola-2026-11-17.pdf',
			'nacional/abc-2026-11-17.pdf'
		]);
		for (const e of scanFolder(root)) {
			expect(decodeId(e.id)).toBe(e.file);
			expect(resolveId(root, e.id)?.rel).toBe(e.file);
		}
	});

	it('parses the masthead from the file name, never the folder', () => {
		pdf('internacional/le-monde-2026-11-17.pdf');
		const [e] = scanFolder(root);
		expect(e).toMatchObject({
			name: 'le-monde-2026-11-17.pdf',
			masthead: 'Le Monde',
			slug: 'le-monde',
			date: '2026-11-17',
			dateSource: 'filename'
		});
	});

	it('skips hidden files and folders', () => {
		pdf('abc-2026-11-17.pdf');
		pdf('.hidden-2026-11-17.pdf');
		pdf('.private/el-mundo-2026-11-17.pdf');
		pdf('nacional/.cache/el-mundo-2026-11-17.pdf');
		pdf('nacional/.partial.pdf');
		expect(files()).toEqual(['abc-2026-11-17.pdf']);
	});

	it('stops at the depth limit', () => {
		pdf('a/b/c/d/deep-2026-11-17.pdf');
		pdf('a/b/c/d/e/too-deep-2026-11-17.pdf');
		expect(files()).toEqual(['a/b/c/d/deep-2026-11-17.pdf']);
	});

	it('never follows symlinked folders (no loops, no escape)', () => {
		pdf('nacional/abc-2026-11-17.pdf');
		mkdirSync(path.join(base, 'outside'));
		writeFileSync(path.join(base, 'outside', 'secret-2026-11-17.pdf'), 'x');
		symlinkSync(path.join(base, 'outside'), path.join(root, 'linked'));
		symlinkSync(root, path.join(root, 'nacional', 'loop'));
		expect(files()).toEqual(['nacional/abc-2026-11-17.pdf']);
	});

	it('keeps a symlinked file only when it stays inside the root', () => {
		pdf('nacional/abc-2026-11-17.pdf');
		writeFileSync(path.join(base, 'secret-2026-11-17.pdf'), 'x');
		symlinkSync(path.join(base, 'secret-2026-11-17.pdf'), path.join(root, 'escape.pdf'));
		symlinkSync(path.join(root, 'nacional', 'abc-2026-11-17.pdf'), path.join(root, 'alias.pdf'));
		expect(files()).toEqual(['alias.pdf', 'nacional/abc-2026-11-17.pdf']);
	});

	it('reuses unchanged editions of the previous scan, and re-parses changed ones', () => {
		pdf('nacional/abc-2026-11-17.pdf');
		pdf('nacional/hola.pdf');
		const first = scanTree(root).editions;
		const later = new Date(Date.UTC(2026, 10, 18, 12));
		utimesSync(path.join(root, 'nacional', 'hola.pdf'), later, later);
		const second = scanTree(root, first).editions;
		const byFile = (list: typeof first, file: string) => list.find((e) => e.file === file);
		expect(byFile(second, 'nacional/abc-2026-11-17.pdf')).toBe(
			byFile(first, 'nacional/abc-2026-11-17.pdf')
		);
		expect(byFile(second, 'nacional/hola.pdf')).not.toBe(byFile(first, 'nacional/hola.pdf'));
		expect(byFile(second, 'nacional/hola.pdf')?.date).toBe('2026-11-18');
	});

	it('returns nothing for a missing root', () => {
		expect(scanTree(path.join(base, 'missing'))).toEqual({ editions: [], dirs: [] });
	});
});

describe('createScanner', () => {
	it('re-scans when a subfolder changes, before the TTL', () => {
		pdf('nacional/abc-2026-11-17.pdf');
		const scan = vi.fn(scanTree);
		const next = createScanner(root, 60_000, scan);
		expect(next(1000)).toHaveLength(1);
		expect(next(1001)).toHaveLength(1);
		expect(scan).toHaveBeenCalledTimes(1);

		pdf('nacional/el-pais-2026-11-17.pdf');
		// mtime granularity: make the change visible even on coarse file systems
		const later = new Date(Date.now() + 5000);
		utimesSync(path.join(root, 'nacional'), later, later);
		expect(next(1002)).toHaveLength(2);
		expect(scan).toHaveBeenCalledTimes(2);
	});

	it('re-scans after the TTL even without folder changes', () => {
		pdf('abc-2026-11-17.pdf');
		const scan = vi.fn(scanTree);
		const next = createScanner(root, 5000, scan);
		next(1000);
		next(2000);
		expect(scan).toHaveBeenCalledTimes(1);
		next(7000);
		expect(scan).toHaveBeenCalledTimes(2);
	});
});
