/**
 * What the admin dashboard shows: the overview, the filtered log and its CSV. Pure over a Drizzle
 * handle, the masthead names and the clock; the routes only pass the URL in.
 */
import {
	formatDate,
	formatDateTime,
	isoFromLocalDateTime,
	parseTypedDate
} from '#lib/format/date.ts';
import { count, eq } from 'drizzle-orm';
import { logSearch } from '#lib/admin-url.ts';
import type { Db } from '../db/index.ts';
import { users, type ReadingKind } from '../db/schema.ts';
import { titleCase } from '../library/text.ts';
import {
	filterOptions,
	listReadings,
	parseReaderKey,
	readerKey,
	topNewspapers,
	topReaders,
	totalsSince,
	type ReaderSummary,
	type ReadingFilter,
	type ReadingRow
} from './log.ts';

export { logSearch };

export const PAGE_SIZE = 50;
const DAY_MS = 86_400_000;

/** A slug's display name: the folder's masthead, or the slug title-cased once the files are gone. */
export function nameOf(slug: string, names: Map<string, string>): string {
	return names.get(slug) ?? titleCase(slug.split('-').filter(Boolean));
}

export interface ReadingView {
	id: number;
	/** Local wall-clock `YYYY-MM-DDTHH:mm`, formatted by the page. */
	at: string;
	reader: ReaderSummary;
	masthead: string;
	slug: string;
	region: string;
	/** ISO date. */
	editionDate: string;
	kind: ReadingKind;
}

const toView = (row: ReadingRow, names: Map<string, string>): ReadingView => ({
	id: row.id,
	at: isoFromLocalDateTime(row.at),
	reader: row.reader,
	masthead: nameOf(row.slug, names),
	slug: row.slug,
	region: row.region,
	editionDate: row.editionDate,
	kind: row.kind
});

/** newspaper_users and newspaper_readers_active, in one round of queries. */
export async function gaugeValues(db: Db, now = new Date()) {
	const byStatus = await db
		.select({ status: users.status, n: count() })
		.from(users)
		.groupBy(users.status);
	const since = (days: number) => new Date(now.getTime() - days * DAY_MS);
	const [d1, d7, d30] = await Promise.all(
		[1, 7, 30].map(async (days) => (await totalsSince(db, since(days))).readers)
	);
	const usersBy = { pending: 0, approved: 0, blocked: 0 };
	for (const row of byStatus) usersBy[row.status] = Number(row.n);
	return { users: usersBy, readers: { '1d': d1, '7d': d7, '30d': d30 } };
}

export async function pendingUsers(db: Db): Promise<number> {
	const [row] = await db.select({ n: count() }).from(users).where(eq(users.status, 'pending'));
	return Number(row?.n ?? 0);
}

export async function overview(db: Db, names: Map<string, string>, now = new Date()) {
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	const month = new Date(now.getTime() - 30 * DAY_MS);
	const [day, week, thirty, newspapers, readers, recent] = await Promise.all([
		totalsSince(db, today),
		totalsSince(db, new Date(now.getTime() - 7 * DAY_MS)),
		totalsSince(db, month),
		topNewspapers(db, month, 8),
		topReaders(db, month, 8),
		listReadings(db, {}, { limit: 20 })
	]);
	return {
		totals: [
			{ label: 'Hoy', ...day },
			{ label: 'Últimos 7 días', ...week },
			{ label: 'Últimos 30 días', ...thirty }
		],
		newspapers: newspapers.map((n) => ({ ...n, masthead: nameOf(n.slug, names) })),
		readers: readers.map((r) => ({ ...r, lastAt: isoFromLocalDateTime(r.lastAt) })),
		recent: recent.rows.map((r) => toView(r, names))
	};
}

/** The log's filters as they travel in the URL (Spanish names, see /admin/lecturas). */
export interface LogQuery {
	usuario: string | null;
	periodico: string | null;
	region: string | null;
	/** ISO dates. */
	desde: string | null;
	hasta: string | null;
	pagina: number;
}

const SLUG = /^[a-z0-9-]{1,160}$/;

export function parseLogQuery(params: URLSearchParams): LogQuery {
	const reader = parseReaderKey(params.get('usuario'));
	const periodico = params.get('periodico');
	const region = params.get('region')?.trim().slice(0, 120) || null;
	let desde = parseTypedDate(params.get('desde'));
	let hasta = parseTypedDate(params.get('hasta'));
	if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
	const page = Number(params.get('pagina'));
	return {
		usuario: reader ? readerKey(reader) : null,
		periodico: periodico && SLUG.test(periodico) ? periodico : null,
		region,
		desde,
		hasta,
		pagina: Number.isSafeInteger(page) && page > 1 ? page : 1
	};
}

export function toFilter(query: LogQuery): ReadingFilter {
	return {
		reader: parseReaderKey(query.usuario),
		masthead: query.periodico,
		region: query.region,
		from: query.desde,
		to: query.hasta
	};
}

export async function logPage(db: Db, names: Map<string, string>, query: LogQuery) {
	const filter = toFilter(query);
	const [first, options] = await Promise.all([
		listReadings(db, filter, { limit: PAGE_SIZE, offset: (query.pagina - 1) * PAGE_SIZE }),
		filterOptions(db)
	]);
	const pages = Math.max(1, Math.ceil(first.total / PAGE_SIZE));
	// a page past the end (rows deleted, a hand-typed URL): show the last one
	const page =
		query.pagina > pages
			? await listReadings(db, filter, { limit: PAGE_SIZE, offset: (pages - 1) * PAGE_SIZE })
			: first;
	const current = Math.min(query.pagina, pages);
	return {
		query: { ...query, pagina: current },
		total: page.total,
		pages,
		from: page.total === 0 ? 0 : (current - 1) * PAGE_SIZE + 1,
		to: (current - 1) * PAGE_SIZE + page.rows.length,
		rows: page.rows.map((r) => toView(r, names)),
		options: {
			readers: options.readers,
			newspapers: options.newspapers
				.map((slug) => ({ slug, masthead: nameOf(slug, names) }))
				.sort((a, b) => a.masthead.localeCompare(b.masthead, 'es')),
			regions: options.regions
		}
	};
}

export const KIND_LABEL: Record<ReadingKind, string> = { open: 'Abierto', download: 'Descargado' };

export function readerLabel(reader: ReaderSummary): string {
	return reader.local ? `admin local: ${reader.name}` : reader.name;
}

/** One CSV field: quoted, and defused against spreadsheet formulas (`=`, `+`, `-`, `@`). */
function csvField(value: string): string {
	const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
	return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * The log as CSV for a spreadsheet in Spanish: `;`-separated, CRLF, UTF-8 with a BOM, the same
 * dates as the table.
 */
export function toCsv(rows: ReadingView[]): string {
	const header = ['Fecha y hora', 'Lector', 'Email', 'Periódico', 'Región', 'Edición', 'Tipo'];
	const lines = rows.map((r) =>
		[
			formatDateTime(r.at),
			readerLabel(r.reader),
			r.reader.email ?? '',
			r.masthead,
			r.region,
			formatDate(r.editionDate),
			KIND_LABEL[r.kind]
		]
			.map(csvField)
			.join(';')
	);
	return '﻿' + [header.map(csvField).join(';'), ...lines].join('\r\n') + '\r\n';
}

export async function csvRows(db: Db, names: Map<string, string>, query: LogQuery) {
	const { rows } = await listReadings(db, toFilter(query));
	return rows.map((r) => toView(r, names));
}
