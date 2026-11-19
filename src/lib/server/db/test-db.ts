/**
 * Throwaway databases for integration tests: `newspaper_test_<random>` on the local MySQL
 * (`npm run db:up`), migrated, removed again by `drop()`. Returns null when MySQL is unreachable
 * so the suite can skip cleanly. Never imported by app code.
 */
import { randomBytes } from 'node:crypto';
import { createPool, type Pool } from 'mysql2/promise';
import { createDb, type DbHandle } from './index.ts';
import { runMigrations } from './migrate.ts';

/** Root on the compose `db` service (MYSQL_ROOT_PASSWORD default in compose.yaml). */
export const TEST_ADMIN_URL =
	process.env.TEST_DATABASE_ADMIN_URL ?? 'mysql://root:newspaper-root@127.0.0.1:3307';

const PREFIX = 'newspaper_test_';

export interface TestDb extends DbHandle {
	name: string;
	url: string;
	drop(): Promise<void>;
}

async function withAdmin<T>(run: (admin: Pool) => Promise<T>): Promise<T> {
	const admin = createPool({ uri: TEST_ADMIN_URL, connectionLimit: 1, connectTimeout: 3000 });
	try {
		return await run(admin);
	} finally {
		await admin.end().catch(() => {});
	}
}

export async function createTestDb(): Promise<TestDb | null> {
	const name = `${PREFIX}${randomBytes(6).toString('hex')}`;
	try {
		await withAdmin((admin) => admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`));
	} catch (err) {
		console.warn(`[test-db] MySQL unreachable, skipping DB tests: ${(err as Error).message}`);
		return null;
	}
	const base = new URL(TEST_ADMIN_URL);
	base.pathname = `/${name}`;
	const url = base.toString();
	const handle = createDb(url, 4);
	await runMigrations(handle.db);
	return {
		...handle,
		name,
		url,
		async drop() {
			await handle.pool.end().catch(() => {});
			if (!name.startsWith(PREFIX)) return; // only ever our own throwaway databases
			await withAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS \`${name}\``));
		}
	};
}
