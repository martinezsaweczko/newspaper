/** The MySQL pool and its Drizzle handle. Pure: the URL is passed in (see config.ts). */
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { createPool, type Pool } from 'mysql2/promise';
import * as schema from './schema.ts';

export type Db = MySql2Database<typeof schema>;

export interface DbHandle {
	db: Db;
	pool: Pool;
}

export function createDb(url: string, connectionLimit = 10): DbHandle {
	// timezone 'Z': JS Dates are written and read as UTC, whatever the server's zone.
	const pool = createPool({ uri: url, connectionLimit, timezone: 'Z' });
	return { db: drizzle(pool, { schema, mode: 'default' }), pool };
}

/**
 * Vite re-evaluates server modules on every HMR reload, so a module-level pool would leak one
 * pool per edit in dev. Outside production the handle lives on globalThis under a symbol key;
 * production evaluates the module once and keeps a plain module variable.
 */
const HANDLE_KEY = Symbol.for('newspaper.db.handle');
type Store = { [HANDLE_KEY]?: DbHandle };
let handle: DbHandle | undefined;

/** The app-wide handle, created on first use from `url`. */
export function getDbHandle(url: string): DbHandle {
	const keepOnGlobal = process.env.NODE_ENV !== 'production';
	let current = keepOnGlobal ? (globalThis as Store)[HANDLE_KEY] : handle;
	if (!current) {
		current = createDb(url);
		if (keepOnGlobal) (globalThis as Store)[HANDLE_KEY] = current;
		else handle = current;
	}
	return current;
}

/** End the app-wide pool (graceful shutdown: its open sockets would keep the process alive). */
export async function closeDbHandle(): Promise<void> {
	const keepOnGlobal = process.env.NODE_ENV !== 'production';
	const current = keepOnGlobal ? (globalThis as Store)[HANDLE_KEY] : handle;
	if (keepOnGlobal) delete (globalThis as Store)[HANDLE_KEY];
	else handle = undefined;
	await current?.pool.end().catch(() => {});
}

export { schema };
