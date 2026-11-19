import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { localAdmin } from '../auth/current.ts';
import { createTestDb, type TestDb } from '../db/test-db.ts';
import { readingEvents, users } from '../db/schema.ts';
import {
	createReadingLog,
	filterOptions,
	isFirstChunk,
	listReadings,
	parseReaderKey,
	readerKey,
	readerOf,
	topNewspapers,
	topReaders,
	totalsSince,
	type EditionInfo,
	type Reader
} from './log.ts';

describe('isFirstChunk', () => {
	it('counts a plain GET and a Range from byte 0, not later chunks', () => {
		expect(isFirstChunk(null)).toBe(true);
		expect(isFirstChunk('')).toBe(true);
		expect(isFirstChunk('bytes=0-')).toBe(true);
		expect(isFirstChunk('bytes=0-65535')).toBe(true);
		expect(isFirstChunk('bytes=65536-131071')).toBe(false);
		expect(isFirstChunk('bytes=-500')).toBe(false);
		expect(isFirstChunk('bytes=10-20')).toBe(false);
	});
});

describe('reader keys', () => {
	it('round-trips Google ids and local admins, and rejects anything else', () => {
		const google: Reader = { userId: 12, localUsername: null };
		const local: Reader = { userId: null, localUsername: 'david' };
		expect(parseReaderKey(readerKey(google))).toEqual(google);
		expect(parseReaderKey(readerKey(local))).toEqual(local);
		for (const bad of ['', '0', '-1', 'local:', 'local:../x', '12a', 'x']) {
			expect(parseReaderKey(bad)).toBeNull();
		}
		expect(readerOf(localAdmin('david'))).toEqual(local);
	});
});

let t: TestDb | null = null;
beforeAll(async () => {
	t = await createTestDb();
}, 60_000);
afterAll(async () => {
	await t?.drop();
});

const ed = (path: string, slug: string, region = 'Galicia', date = '2026-11-18'): EditionInfo => ({
	path,
	mastheadSlug: slug,
	region,
	date
});
const voz = ed('la-voz-2026-11-18.pdf', 'la-voz');
const pais = ed('el-pais-2026-11-18.pdf', 'el-pais', 'Nacional');
const t0 = new Date('2026-11-18T08:00:00Z');
const plus = (min: number) => new Date(t0.getTime() + min * 60_000);

describe('reading log (needs local MySQL)', () => {
	let ana: Reader;
	let bea: Reader;
	const admin: Reader = { userId: null, localUsername: 'root-admin' };

	beforeEach(async (ctx) => {
		if (!t) return ctx.skip();
		await t.db.delete(readingEvents);
		await t.db.delete(users);
		const make = async (email: string, name: string) => {
			const [{ id }] = await t!.db
				.insert(users)
				.values({ email, name, status: 'approved', createdAt: t0 })
				.$returningId();
			return { userId: id, localUsername: null } as Reader;
		};
		ana = await make('ana@example.com', 'Ana');
		bea = await make('bea@example.com', '');
	});

	it('records an opening once per 30 minutes, then again after the window', async () => {
		const seen: string[] = [];
		const log = createReadingLog(() => t!.db, {
			onRecorded: (e, k) => seen.push(`${e.mastheadSlug}:${k}`)
		});
		expect(await log.record(ana, voz, 'open', t0)).toBe(true);
		expect(await log.record(ana, voz, 'open', plus(5))).toBe(false);
		expect(await log.record(ana, voz, 'open', plus(29))).toBe(false);
		expect(await log.record(ana, voz, 'open', plus(31))).toBe(true);
		expect(seen).toEqual(['la-voz:open', 'la-voz:open']);
		expect((await listReadings(t!.db, {})).total).toBe(2);
	});

	it('dedupes parallel requests and, after a restart, through SQL', async () => {
		const log = createReadingLog(() => t!.db);
		const results = await Promise.all([1, 2, 3].map(() => log.record(ana, voz, 'open', t0)));
		expect(results.filter(Boolean)).toHaveLength(1);
		const restarted = createReadingLog(() => t!.db);
		expect(await restarted.record(ana, voz, 'open', plus(10))).toBe(false);
		expect((await listReadings(t!.db, {})).total).toBe(1);
	});

	it('keeps open and download apart, and readers and editions apart', async () => {
		const log = createReadingLog(() => t!.db);
		expect(await log.record(ana, voz, 'open', t0)).toBe(true);
		expect(await log.record(ana, voz, 'download', plus(1))).toBe(true);
		expect(await log.record(bea, voz, 'open', plus(2))).toBe(true);
		expect(await log.record(ana, pais, 'open', plus(3))).toBe(true);
		const { rows } = await listReadings(t!.db, {});
		expect(rows.map((r) => [r.reader.name, r.slug, r.kind])).toEqual([
			['Ana', 'el-pais', 'open'],
			['bea@example.com', 'la-voz', 'open'],
			['Ana', 'la-voz', 'download'],
			['Ana', 'la-voz', 'open']
		]);
		expect(rows[0]).toMatchObject({ region: 'Nacional', editionDate: '2026-11-18' });
	});

	it('records a local admin by name, without a users row', async () => {
		const log = createReadingLog(() => t!.db);
		expect(await log.record(admin, voz, 'open', t0)).toBe(true);
		expect(await log.record(admin, voz, 'open', plus(1))).toBe(false);
		const [row] = await t!.db.select().from(readingEvents);
		expect(row).toMatchObject({ userId: null, localUsername: 'root-admin', editionPath: voz.path });
		const { rows } = await listReadings(t!.db, { reader: admin });
		expect(rows[0].reader).toEqual({
			key: 'local:root-admin',
			name: 'root-admin',
			email: null,
			local: true
		});
	});

	it('lets a failed insert be retried', async () => {
		let broken = true;
		const log = createReadingLog(() => (broken ? (null as never) : t!.db));
		await expect(log.record(ana, voz, 'open', t0)).rejects.toThrow();
		broken = false;
		expect(await log.record(ana, voz, 'open', plus(1))).toBe(true);
	});

	it('aggregates totals, top newspapers and readers, and filters and pages the log', async () => {
		const log = createReadingLog(() => t!.db);
		await log.record(ana, voz, 'open', t0);
		await log.record(ana, pais, 'open', plus(1));
		await log.record(bea, voz, 'open', plus(2));
		await log.record(admin, voz, 'download', plus(3));
		// a week earlier: outside "since"
		await log.record(bea, pais, 'open', new Date(t0.getTime() - 8 * 86_400_000));

		expect(await totalsSince(t!.db, plus(-60))).toEqual({ openings: 4, readers: 3, newspapers: 2 });
		expect(await topNewspapers(t!.db, plus(-60))).toEqual([
			{ slug: 'la-voz', region: 'Galicia', openings: 3, readers: 3 },
			{ slug: 'el-pais', region: 'Nacional', openings: 1, readers: 1 }
		]);
		const top = await topReaders(t!.db, plus(-60));
		expect(top.map((r) => [r.key, r.openings, r.newspapers])).toEqual([
			[String(ana.userId), 2, 2],
			['local:root-admin', 1, 1],
			[String(bea.userId), 1, 1]
		]);
		expect(top[0].lastAt).toEqual(plus(1));

		expect((await listReadings(t!.db, { reader: bea })).total).toBe(2);
		expect((await listReadings(t!.db, { masthead: 'el-pais' })).total).toBe(2);
		expect((await listReadings(t!.db, { region: 'Galicia' })).total).toBe(3);
		const day = (d: Date) =>
			`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		expect((await listReadings(t!.db, { from: day(t0), to: day(t0) })).total).toBe(4);
		const page = await listReadings(t!.db, {}, { limit: 2, offset: 2 });
		expect(page.total).toBe(5);
		expect(page.rows.map((r) => r.slug)).toEqual(['el-pais', 'la-voz']);

		const options = await filterOptions(t!.db);
		expect(options.readers.map((r) => r.name)).toEqual(['Ana', 'bea@example.com', 'root-admin']);
		expect(options.newspapers).toEqual(['el-pais', 'la-voz']);
		expect(options.regions).toEqual(['Galicia', 'Nacional']);
	});
});
