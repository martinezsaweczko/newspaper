import { migrate } from 'drizzle-orm/mysql2/migrator';
import path from 'node:path';
import { createDb, type Db } from './index.ts';

/**
 * Migrations live in <cwd>/drizzle: the repo root in dev and tests, /app in the container (the
 * Containerfile copies ./drizzle next to ./build). MIGRATIONS_DIR overrides it.
 */
export function migrationsFolder(): string {
	return process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), 'drizzle');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The URL without its password, for logs. */
export function redactUrl(url: string): string {
	try {
		const u = new URL(url);
		if (u.password) u.password = '***';
		return u.toString();
	} catch {
		return '<invalid DATABASE_URL>';
	}
}

/** Wait while MySQL is still starting (container boot). Throws after `attempts`. */
export async function waitForDb(
	url: string,
	{ attempts = 30, delayMs = 2000 }: { attempts?: number; delayMs?: number } = {}
): Promise<void> {
	let lastError: unknown;
	for (let i = 1; i <= attempts; i++) {
		const { pool } = createDb(url, 1);
		try {
			await pool.query('SELECT 1');
			return;
		} catch (err) {
			lastError = err;
			if (i < attempts) {
				console.warn(`[db] ${redactUrl(url)} not ready (${i}/${attempts}), retrying`);
				await sleep(delayMs);
			}
		} finally {
			await pool.end().catch(() => {});
		}
	}
	throw new Error(
		`Database ${redactUrl(url)} unreachable after ${attempts} attempts: ${(lastError as Error)?.message}`
	);
}

/** Apply every pending migration in /drizzle (idempotent). */
export async function runMigrations(db: Db, folder = migrationsFolder()): Promise<void> {
	await migrate(db, { migrationsFolder: folder });
}
