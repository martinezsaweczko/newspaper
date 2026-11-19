/**
 * The reading log: who opened which edition, and when. Pure over a Drizzle handle (the app passes
 * `db()`); the PDF route records, the admin dashboard queries.
 *
 * Dedupe: the same reader + edition + kind is recorded once per 30 minutes. A per-process TTL map
 * answers first (it is set before the first await, so the parallel requests a PDF viewer fires
 * cannot both insert); a SQL lookup over `(user_id | local_username, created_at)` is the fallback
 * after a restart or for another process. Rows are kept forever (operator's choice).
 */
import { and, count, countDistinct, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm';
import type { CurrentUser } from '../../types.ts';
import type { Db } from '../db/index.ts';
import { readingEvents, users, type ReadingKind } from '../db/schema.ts';
import { withSpan } from '../observability/trace.ts';

export const DEDUPE_WINDOW_MS = 30 * 60 * 1000;

/** Exactly one of the two is set: Google accounts by id, local admins by users.json name. */
export type Reader =
	{ userId: number; localUsername: null } | { userId: null; localUsername: string };

export function readerOf(user: CurrentUser): Reader | null {
	if (user.kind === 'google' && user.id !== null) return { userId: user.id, localUsername: null };
	if (user.kind === 'local' && user.name) return { userId: null, localUsername: user.name };
	return null;
}

/** The reader as it travels in a URL (`?usuario=12`, `?usuario=local:david`). */
export function readerKey(reader: Reader): string {
	return reader.userId !== null ? String(reader.userId) : `local:${reader.localUsername}`;
}

export function parseReaderKey(value: string | null | undefined): Reader | null {
	if (!value) return null;
	if (/^[1-9]\d{0,9}$/.test(value)) return { userId: Number(value), localUsername: null };
	const local = /^local:([a-z0-9][a-z0-9._-]{0,31})$/.exec(value);
	return local ? { userId: null, localUsername: local[1] } : null;
}

/**
 * Does this request start reading the file? A plain GET, or a Range from byte 0. Later chunks
 * (`bytes=65536-`) and suffix ranges (`bytes=-500`) belong to an opening already counted.
 */
export function isFirstChunk(range: string | null): boolean {
	if (range === null || range.trim() === '') return true;
	return /^\s*bytes\s*=\s*0\s*-/i.test(range);
}

export interface EditionInfo {
	/** Relative path of the PDF inside NEWSPAPER_DIR. */
	path: string;
	mastheadSlug: string;
	region: string;
	/** ISO `YYYY-MM-DD`. */
	date: string;
}

export interface ReadingLogOptions {
	windowMs?: number;
	/** Called once per recorded (not deduped) event: metrics. */
	onRecorded?: (edition: EditionInfo, kind: ReadingKind) => void;
}

const readerWhere = (reader: Reader): SQL =>
	reader.userId !== null
		? eq(readingEvents.userId, reader.userId)
		: eq(readingEvents.localUsername, reader.localUsername);

export function createReadingLog(getDb: () => Db, options: ReadingLogOptions = {}) {
	const windowMs = options.windowMs ?? DEDUPE_WINDOW_MS;
	/** key -> time of the last recorded event. */
	const recent = new Map<string, number>();

	function prune(now: number) {
		if (recent.size < 1000) return;
		for (const [key, at] of recent) if (now - at >= windowMs) recent.delete(key);
	}

	/** Record one opening or download; resolves to false when it was a duplicate. */
	async function record(
		reader: Reader,
		edition: EditionInfo,
		kind: ReadingKind,
		now = new Date()
	): Promise<boolean> {
		return withSpan(
			'newspaper.reading.record',
			{ 'newspaper.reading.kind': kind },
			async (span) => {
				const key = `${readerKey(reader)}\n${edition.path}\n${kind}`;
				const ms = now.getTime();
				const last = recent.get(key);
				if (last !== undefined && ms - last < windowMs) {
					span.setAttribute('deduped', true);
					return false;
				}
				prune(ms);
				recent.set(key, ms);
				try {
					const db = getDb();
					const [dupe] = await db
						.select({ id: readingEvents.id })
						.from(readingEvents)
						.where(
							and(
								readerWhere(reader),
								gte(readingEvents.createdAt, new Date(ms - windowMs)),
								eq(readingEvents.editionPath, edition.path),
								eq(readingEvents.kind, kind)
							)
						)
						.limit(1);
					span.setAttribute('deduped', Boolean(dupe));
					if (dupe) return false;
					await db.insert(readingEvents).values({
						userId: reader.userId,
						localUsername: reader.localUsername,
						editionPath: edition.path,
						mastheadSlug: edition.mastheadSlug,
						region: edition.region,
						editionDate: edition.date,
						kind,
						createdAt: now
					});
				} catch (err) {
					recent.delete(key); // let the next request try again
					throw err;
				}
				options.onRecorded?.(edition, kind);
				return true;
			}
		);
	}

	return { record };
}

export type ReadingLog = ReturnType<typeof createReadingLog>;

// ---------------------------------------------------------------------------------------------
// Queries for the dashboard

/** One aggregation key per reader, for COUNT(DISTINCT ...). */
const readerExpr = sql<string>`coalesce(concat('u', ${readingEvents.userId}), concat('l', ${readingEvents.localUsername}))`;

export interface Totals {
	openings: number;
	readers: number;
	newspapers: number;
}

/** Openings (opens + downloads), distinct readers and distinct newspapers since `since`. */
export async function totalsSince(db: Db, since: Date): Promise<Totals> {
	const [row] = await db
		.select({
			openings: count(),
			readers: countDistinct(readerExpr),
			newspapers: countDistinct(readingEvents.mastheadSlug)
		})
		.from(readingEvents)
		.where(gte(readingEvents.createdAt, since));
	return {
		openings: Number(row?.openings ?? 0),
		readers: Number(row?.readers ?? 0),
		newspapers: Number(row?.newspapers ?? 0)
	};
}

export interface NewspaperRank {
	slug: string;
	region: string;
	openings: number;
	readers: number;
}

export async function topNewspapers(db: Db, since: Date, limit = 10): Promise<NewspaperRank[]> {
	const openings = count();
	const rows = await db
		.select({
			slug: readingEvents.mastheadSlug,
			region: sql<string>`max(${readingEvents.region})`,
			openings,
			readers: countDistinct(readerExpr)
		})
		.from(readingEvents)
		.where(gte(readingEvents.createdAt, since))
		.groupBy(readingEvents.mastheadSlug)
		.orderBy(desc(openings), readingEvents.mastheadSlug)
		.limit(limit);
	return rows.map((r) => ({ ...r, openings: Number(r.openings), readers: Number(r.readers) }));
}

export interface ReaderSummary {
	key: string;
	name: string;
	email: string | null;
	local: boolean;
}

export interface ReaderRank extends ReaderSummary {
	openings: number;
	newspapers: number;
	lastAt: Date;
}

const readerSummary = (r: {
	userId: number | null;
	localUsername: string | null;
	name: string | null;
	email: string | null;
}): ReaderSummary =>
	r.userId !== null
		? {
				key: String(r.userId),
				name: r.name || r.email || `#${r.userId}`,
				email: r.email,
				local: false
			}
		: {
				key: `local:${r.localUsername}`,
				name: r.localUsername ?? '',
				email: null,
				local: true
			};

export async function topReaders(db: Db, since: Date, limit = 10): Promise<ReaderRank[]> {
	const openings = count();
	const rows = await db
		.select({
			userId: readingEvents.userId,
			localUsername: readingEvents.localUsername,
			name: sql<string | null>`max(${users.name})`,
			email: sql<string | null>`max(${users.email})`,
			openings,
			newspapers: countDistinct(readingEvents.mastheadSlug),
			lastAt: sql<Date>`max(${readingEvents.createdAt})`.mapWith(readingEvents.createdAt)
		})
		.from(readingEvents)
		.leftJoin(users, eq(users.id, readingEvents.userId))
		.where(gte(readingEvents.createdAt, since))
		.groupBy(readingEvents.userId, readingEvents.localUsername)
		.orderBy(desc(openings), desc(sql`max(${readingEvents.createdAt})`))
		.limit(limit);
	return rows.map((r) => ({
		...readerSummary(r),
		openings: Number(r.openings),
		newspapers: Number(r.newspapers),
		lastAt: r.lastAt
	}));
}

export interface ReadingFilter {
	reader?: Reader | null;
	masthead?: string | null;
	region?: string | null;
	/** ISO dates, inclusive, in the server's local time. */
	from?: string | null;
	to?: string | null;
}

/** Local midnight of an ISO date. */
export function localMidnight(iso: string): Date {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(y, m - 1, d);
}

function filterWhere(filter: ReadingFilter): SQL | undefined {
	const parts: SQL[] = [];
	if (filter.reader) parts.push(readerWhere(filter.reader));
	if (filter.masthead) parts.push(eq(readingEvents.mastheadSlug, filter.masthead));
	if (filter.region) parts.push(eq(readingEvents.region, filter.region));
	if (filter.from) parts.push(gte(readingEvents.createdAt, localMidnight(filter.from)));
	if (filter.to) {
		const end = localMidnight(filter.to);
		end.setDate(end.getDate() + 1);
		parts.push(lt(readingEvents.createdAt, end));
	}
	return parts.length ? and(...parts) : undefined;
}

export interface ReadingRow {
	id: number;
	at: Date;
	reader: ReaderSummary;
	slug: string;
	region: string;
	editionDate: string;
	kind: ReadingKind;
}

export interface ReadingPage {
	rows: ReadingRow[];
	total: number;
}

/** The log, newest first, filtered; `limit`/`offset` page it (no limit = everything, for CSV). */
export async function listReadings(
	db: Db,
	filter: ReadingFilter,
	{ limit, offset = 0 }: { limit?: number; offset?: number } = {}
): Promise<ReadingPage> {
	const where = filterWhere(filter);
	const query = db
		.select({
			id: readingEvents.id,
			at: readingEvents.createdAt,
			userId: readingEvents.userId,
			localUsername: readingEvents.localUsername,
			name: users.name,
			email: users.email,
			slug: readingEvents.mastheadSlug,
			region: readingEvents.region,
			editionDate: readingEvents.editionDate,
			kind: readingEvents.kind
		})
		.from(readingEvents)
		.leftJoin(users, eq(users.id, readingEvents.userId))
		.where(where)
		.orderBy(desc(readingEvents.createdAt), desc(readingEvents.id))
		.$dynamic();
	if (limit !== undefined) query.limit(limit).offset(offset);
	const [rows, [{ n }]] = await Promise.all([
		query,
		db.select({ n: count() }).from(readingEvents).where(where)
	]);
	return {
		total: Number(n),
		rows: rows.map((r) => ({
			id: r.id,
			at: r.at,
			reader: readerSummary(r),
			slug: r.slug,
			region: r.region,
			editionDate: r.editionDate,
			kind: r.kind
		}))
	};
}

/** Readers and newspapers that appear in the log, for the filter menus. */
export async function filterOptions(db: Db): Promise<{
	readers: ReaderSummary[];
	newspapers: string[];
	regions: string[];
}> {
	const [readers, newspapers, regions] = await Promise.all([
		db
			.selectDistinct({
				userId: readingEvents.userId,
				localUsername: readingEvents.localUsername,
				name: users.name,
				email: users.email
			})
			.from(readingEvents)
			.leftJoin(users, eq(users.id, readingEvents.userId)),
		db
			.selectDistinct({ slug: readingEvents.mastheadSlug })
			.from(readingEvents)
			.orderBy(readingEvents.mastheadSlug),
		db
			.selectDistinct({ region: readingEvents.region })
			.from(readingEvents)
			.orderBy(readingEvents.region)
	]);
	return {
		readers: readers
			.map(readerSummary)
			.sort((a, b) => a.name.localeCompare(b.name, 'es') || a.key.localeCompare(b.key)),
		newspapers: newspapers.map((r) => r.slug),
		regions: regions.map((r) => r.region)
	};
}
