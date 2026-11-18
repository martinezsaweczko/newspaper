import { thumbnailer } from '#lib/server/library/index.ts';
import { resolveId } from '#lib/server/library/ids.ts';
import { config } from '#lib/server/config.ts';
import { parseEditionName } from '#lib/server/library/parse.ts';
import { recordThumbnail } from '#lib/server/observability/metrics.ts';
import { withSpan } from '#lib/server/observability/trace.ts';
import { readFile } from 'node:fs/promises';
import type { RequestHandler } from './$types';

/** The edition's front page as JPEG (page 1, rendered once and cached on disk). */
export const GET: RequestHandler = async ({ params, request }) => {
	const edition = resolveId(config.newspaperDir, params.id);
	if (!edition) return new Response('No encontrado', { status: 404 });

	const masthead = parseEditionName(edition.rel, edition.stat.mtime).masthead;
	const started = performance.now();
	const seconds = () => (performance.now() - started) / 1000;
	let thumb;
	try {
		thumb = await withSpan(
			'newspaper.thumbnail.render',
			{ 'newspaper.masthead': masthead },
			async (span) => {
				const result = await thumbnailer.get({
					abs: edition.abs,
					rel: edition.rel,
					mtimeMs: edition.stat.mtimeMs,
					size: edition.stat.size
				});
				span.setAttribute('newspaper.thumbnail.cache_hit', result.cached);
				return result;
			}
		);
		recordThumbnail(thumb.cached ? 'hit' : 'miss', seconds());
	} catch (err) {
		recordThumbnail('error', seconds());
		console.warn(`[thumb] ${edition.rel}: ${(err as Error).message}`);
		return new Response('Portada no disponible', {
			status: 502,
			headers: { 'cache-control': 'no-store' }
		});
	}

	const etag = `"${thumb.key.slice(0, 32)}"`;
	const headers = {
		'cache-control': 'private, max-age=86400',
		etag
	};
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers });
	}
	const body = await readFile(thumb.file);
	return new Response(body, {
		headers: { ...headers, 'content-type': 'image/jpeg', 'content-length': String(body.length) }
	});
};
