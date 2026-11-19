import { defineConfig } from 'drizzle-kit';

// `npm run db:generate` diffs the schema against the snapshots in ./drizzle; it never connects.
export default defineConfig({
	dialect: 'mysql',
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dbCredentials: {
		url: process.env.DATABASE_URL ?? 'mysql://newspaper:newspaper@127.0.0.1:3307/newspaper'
	}
});
