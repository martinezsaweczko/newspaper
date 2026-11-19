import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { redactUrl, runMigrations } from './migrate.ts';
import { createTestDb, type TestDb } from './test-db.ts';

let t: TestDb | null = null;
beforeAll(async () => {
	t = await createTestDb();
}, 60_000);
afterAll(async () => {
	await t?.drop();
});

describe('migrations (needs local MySQL)', () => {
	it('create users and reading_events with their indexes, and re-run as a no-op', async (ctx) => {
		if (!t) return ctx.skip();
		await runMigrations(t.db); // second run: nothing pending
		const [tables] = await t.pool.query(
			'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? ORDER BY 1',
			[t.name]
		);
		expect((tables as { name: string }[]).map((r) => r.name)).toEqual([
			'__drizzle_migrations',
			'reading_events',
			'users'
		]);
		const [indexes] = await t.pool.query(
			`SELECT DISTINCT index_name AS name FROM information_schema.statistics
			 WHERE table_schema = ? AND table_name = 'reading_events' ORDER BY 1`,
			[t.name]
		);
		expect((indexes as { name: string }[]).map((r) => r.name)).toEqual(
			expect.arrayContaining([
				'reading_events_created_idx',
				'reading_events_local_created_idx',
				'reading_events_masthead_created_idx',
				'reading_events_user_created_idx'
			])
		);
		const [journal] = await t.pool.query('SELECT COUNT(*) AS n FROM __drizzle_migrations');
		expect((journal as { n: number }[])[0].n).toBe(2);
	});
});

describe('redactUrl', () => {
	it('hides the password in logs', () => {
		expect(redactUrl('mysql://newspaper:s3cret@db:3306/newspaper')).toBe(
			'mysql://newspaper:***@db:3306/newspaper'
		);
		expect(redactUrl('not a url')).toBe('<invalid DATABASE_URL>');
	});
});
