import type { Edition } from '#lib/types.ts';
import { config } from '../config.ts';
import { createThumbnailer } from '../thumbs.ts';
import { createRegionStore } from './regions.ts';
import { dedupeEditions } from './dedupe.ts';
import { resolveId } from './ids.ts';
import { createIgnoreStore } from './ignore.ts';
import { setEditionCount } from '../observability/metrics.ts';
import { withSpan } from '../observability/trace.ts';
import { createScanner, scanFolder } from './scan.ts';
import path from 'node:path';

const scan = createScanner(config.newspaperDir, 5000, (root) =>
	withSpan('newspaper.library.scan', {}, (span) => {
		const editions = scanFolder(root);
		span.setAttribute('newspaper.editions', editions.length);
		setEditionCount(editions.length);
		return editions;
	})
);
const regions = createRegionStore(config.dataDir);
const ignored = createIgnoreStore(config.dataDir);

export const thumbnailer = createThumbnailer({ cacheDir: path.join(config.dataDir, 'thumbs') });

/**
 * Every edition in the shared folder with its region, plus the region order of regions.json.
 * Files on the ignore list are left out, and download copies of one edition count once.
 */
export function library(): { editions: Edition[]; regionOrder: string[] } {
	const map = regions.get();
	const ignore = ignored.get();
	const editions = dedupeEditions(scan().filter((e) => !ignore(e.file))).map((e) => ({
		id: e.id,
		masthead: e.masthead,
		slug: e.slug,
		date: e.date,
		dateSource: e.dateSource,
		size: e.size,
		mtimeMs: e.mtimeMs,
		region: map.regionOf(e.masthead)
	}));
	return { editions, regionOrder: map.order };
}

/** `resolveId` in the shared folder, with ignored files treated as missing (404). */
export function resolveEdition(id: string) {
	return resolveId(config.newspaperDir, id, { ignore: ignored.get() });
}
