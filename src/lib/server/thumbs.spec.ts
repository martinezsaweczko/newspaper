import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { makeSamplePdf } from '../../../scripts/make-samples.mjs';
import { createThumbnailer, thumbKey } from './thumbs.ts';

const hasPdftoppm = (() => {
	try {
		execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
})();

const dir = mkdtempSync(path.join(tmpdir(), 'np-thumbs-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function source(name: string, bytes: Buffer) {
	const abs = path.join(dir, name);
	writeFileSync(abs, bytes);
	const stat = statSync(abs);
	return { abs, rel: name, mtimeMs: stat.mtimeMs, size: stat.size };
}

describe('thumbKey', () => {
	it('changes with path, mtime and size', () => {
		const base = { rel: 'a.pdf', mtimeMs: 1, size: 2 };
		expect(thumbKey(base)).toMatch(/^[0-9a-f]{64}$/);
		expect(thumbKey({ ...base, mtimeMs: 3 })).not.toBe(thumbKey(base));
		expect(thumbKey({ ...base, size: 3 })).not.toBe(thumbKey(base));
		expect(thumbKey({ ...base, rel: 'b.pdf' })).not.toBe(thumbKey(base));
	});
});

describe.skipIf(!hasPdftoppm)('createThumbnailer (pdftoppm)', () => {
	const thumbs = createThumbnailer({ cacheDir: path.join(dir, 'thumbs'), concurrency: 2 });

	it('renders page 1 to a cached JPEG and dedupes concurrent requests', async () => {
		const src = source(
			'gaceta-nacional-2026-11-17.pdf',
			makeSamplePdf(['gaceta-nacional-2026-11-17.pdf', 'Gaceta Nacional', 'Prueba', 0.4], 0)
		);
		const [a, b] = await Promise.all([thumbs.get(src), thumbs.get(src)]);
		expect(a.file).toBe(b.file);
		expect([a.cached, b.cached]).toEqual([false, false]);
		const jpeg = readFileSync(a.file);
		expect(jpeg.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
		expect(thumbs.stats()).toEqual({ running: 0, queued: 0, inFlight: 0 });

		const mtime = statSync(a.file).mtimeMs;
		const again = await thumbs.get(src); // served from the cache, not re-rendered
		expect(again.cached).toBe(true);
		expect(statSync(a.file).mtimeMs).toBe(mtime);
	});

	it('fails on a broken PDF and remembers the failure', async () => {
		const src = source('broken.pdf', Buffer.from('%PDF-1.4 nope'));
		await expect(thumbs.get(src)).rejects.toThrow(/pdftoppm/);
		await expect(thumbs.get(src)).rejects.toThrow(/cached failure/);
	});
});
