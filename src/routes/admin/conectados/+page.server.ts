import { listUsers } from '#lib/server/admin/users.ts';
import { db } from '#lib/server/auth/index.ts';
import { readUsers } from '#lib/server/auth/users.ts';
import { config } from '#lib/server/config.ts';
import { userLabel } from '#lib/user-label.ts';
import type { PageServerLoad } from './$types';

/**
 * Everyone who can be online: approved Google accounts and the users.json admins. Who is online
 * comes live from `/chat/stream`, so the page never has to reload.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const google = (await listUsers(db()))
		.filter((row) => row.status === 'approved')
		.map((row) => ({
			key: userLabel({ kind: 'google', id: row.id, name: row.name }),
			name: row.name || row.email,
			email: row.email as string | null,
			admin: row.role === 'admin'
		}));
	const local = Object.keys(readUsers(config.dataDir).users).map((name) => ({
		key: userLabel({ kind: 'local', id: null, name }),
		name,
		email: null,
		admin: true
	}));
	return { people: [...google, ...local], me: locals.user ? userLabel(locals.user) : null };
};
