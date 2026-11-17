/**
 * Front pages: page 1 of a PDF rendered to JPEG by pdftoppm (poppler-utils), cached on disk in
 * `DATA_DIR/thumbs/` under sha256(relpath|mtime|size). Concurrent requests for the same file share
 * one render; at most `concurrency` renders run at once; failures are remembered for a while.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';

export interface ThumbSource {
	abs: string;
	rel: string;
	mtimeMs: number;
	size: number;
}

export interface ThumbnailerOptions {
	cacheDir: string;
	concurrency?: number;
	timeoutMs?: number;
	failureTtlMs?: number;
	bin?: string;
}

export function thumbKey(source: Pick<ThumbSource, 'rel' | 'mtimeMs' | 'size'>): string {
	return createHash('sha256').update(`${source.rel}|${source.mtimeMs}|${source.size}`).digest('hex');
}

function run(bin: string, args: string[], timeoutMs: number): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile(bin, args, { timeout: timeoutMs, killSignal: 'SIGKILL', windowsHide: true }, (err, _out, stderr) => {
			if (err) reject(new Error(`${bin} failed: ${err.message}${stderr ? ` (${String(stderr).trim().slice(0, 200)})` : ''}`));
			else resolve();
		});
	});
}

export function createThumbnailer({
	cacheDir,
	concurrency = 3,
	timeoutMs = 30_000,
	failureTtlMs = 10 * 60_000,
	bin = 'pdftoppm'
}: ThumbnailerOptions) {
	const inFlight = new Map<string, Promise<string>>();
	const failures = new Map<string, number>();
	const queue: (() => void)[] = [];
	let running = 0;

	async function withSlot<T>(job: () => Promise<T>): Promise<T> {
		if (running >= concurrency) await new Promise<void>((resolve) => queue.push(resolve));
		running += 1;
		try {
			return await job();
		} finally {
			running -= 1;
			queue.shift()?.();
		}
	}

	async function render(source: ThumbSource, key: string, file: string): Promise<string> {
		mkdirSync(cacheDir, { recursive: true });
		const prefix = path.join(cacheDir, `.${key}.${process.pid}.tmp`);
		try {
			await withSlot(() =>
				run(
					bin,
					['-f', '1', '-l', '1', '-jpeg', '-jpegopt', 'quality=82', '-scale-to', '640', '-singlefile', source.abs, prefix],
					timeoutMs
				)
			);
			renameSync(`${prefix}.jpg`, file);
			return file;
		} finally {
			rmSync(`${prefix}.jpg`, { force: true });
		}
	}

	return {
		/** Path of the cached JPEG for this source, rendering it first when needed. */
		async get(source: ThumbSource, now = Date.now()): Promise<{ file: string; key: string }> {
			const key = thumbKey(source);
			const file = path.join(cacheDir, `${key}.jpg`);
			if (existsSync(file)) return { file, key };

			const failedAt = failures.get(key);
			if (failedAt !== undefined && now - failedAt < failureTtlMs) {
				throw new Error('front page could not be rendered (cached failure)');
			}

			let pending = inFlight.get(key);
			if (!pending) {
				pending = render(source, key, file)
					.catch((err) => {
						failures.set(key, Date.now());
						throw err;
					})
					.finally(() => inFlight.delete(key));
				inFlight.set(key, pending);
			}
			return { file: await pending, key };
		},
		/** For tests and diagnostics. */
		stats: () => ({ running, queued: queue.length, inFlight: inFlight.size })
	};
}
