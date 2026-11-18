import { contentDisposition, parseRange } from '#lib/server/http/range.ts';
import { resolveId } from '#lib/server/library/ids.ts';
import { config } from '#lib/server/config.ts';
import { addPdfBytes } from '#lib/server/observability/metrics.ts';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { RequestHandler } from './$types';

/** Stream an edition with HTTP Range support; inline by default, `?download=1` for attachment. */
export const GET: RequestHandler = ({ params, request, url }) => {
	const edition = resolveId(config.newspaperDir, params.id);
	if (!edition) return new Response('Not found', { status: 404 });

	const { size, mtime, mtimeMs } = edition.stat;
	const etag = `"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`;
	const disposition = url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
	const headers: Record<string, string> = {
		'content-type': 'application/pdf',
		'accept-ranges': 'bytes',
		'content-disposition': contentDisposition(disposition, edition.rel),
		'cache-control': 'private, max-age=3600',
		'last-modified': mtime.toUTCString(),
		etag
	};

	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers });
	}

	// If-Range: honour the range only while the validator still matches
	const ifRange = request.headers.get('if-range');
	const rangeHeader = !ifRange || ifRange === etag ? request.headers.get('range') : null;
	const range = parseRange(rangeHeader, size);

	if (range.kind === 'unsatisfiable') {
		return new Response(null, {
			status: 416,
			headers: { ...headers, 'content-range': `bytes */${size}` }
		});
	}

	const [start, end] = range.kind === 'partial' ? [range.start, range.end] : [0, size - 1];
	const length = size === 0 ? 0 : end - start + 1;
	const body =
		request.method === 'HEAD' || length === 0
			? null
			: (Readable.toWeb(
					// counted as the bytes actually leave the file, so aborted downloads count less
					createReadStream(edition.abs, { start, end }).on('data', (chunk) =>
						addPdfBytes(chunk.length)
					)
				) as ReadableStream);

	if (range.kind === 'partial') {
		return new Response(body, {
			status: 206,
			headers: {
				...headers,
				'content-range': `bytes ${start}-${end}/${size}`,
				'content-length': String(length)
			}
		});
	}
	return new Response(body, { headers: { ...headers, 'content-length': String(size) } });
};
