/**
 * Development only: empty the database in DATABASE_URL (every table, including Drizzle's
 * migration journal). The next server start migrates it again from /drizzle.
 *
 *   npm run db:reset -- --yes
 *
 * Refuses unless the host is loopback, NODE_ENV is not production and `--yes` is given.
 * Reads DATABASE_URL from the environment or .env.
 */
import { createConnection } from 'mysql2/promise';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

async function main() {
	const raw = process.env.DATABASE_URL;
	if (!raw) throw new Error('DATABASE_URL is not set (see .env.example).');
	const url = new URL(raw);
	const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
	if (process.env.NODE_ENV === 'production') throw new Error('Refusing: NODE_ENV=production.');
	if (!LOOPBACK.has(url.hostname)) {
		throw new Error(`Refusing: ${url.hostname} is not a loopback host (dev database only).`);
	}
	if (!database) throw new Error('DATABASE_URL names no database.');
	if (!process.argv.includes('--yes')) {
		console.error(`This empties every table in ${database} on ${url.host}. Re-run with --yes.`);
		process.exit(1);
	}

	const conn = await createConnection({ uri: raw, multipleStatements: false });
	try {
		const [rows] = await conn.query(
			'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ?',
			[database]
		);
		const tables = (rows as { name: string }[]).map((r) => r.name);
		await conn.query('SET FOREIGN_KEY_CHECKS = 0');
		for (const table of tables) await conn.query(`DROP TABLE \`${table.replace(/`/g, '``')}\``);
		await conn.query('SET FOREIGN_KEY_CHECKS = 1');
		console.log(`Dropped ${tables.length} tables from ${database}. Start the app to migrate.`);
	} finally {
		await conn.end();
	}
}

main().catch((err: Error) => {
	console.error(err.message);
	process.exit(1);
});
