import { db } from '#lib/server/auth/index.ts';
import { pendingUsers } from '#lib/server/reading/views.ts';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/** The hook already turns non-admins away from /admin/**; this is the second lock. */
export const load: LayoutServerLoad = async ({ locals }) => {
	if (locals.user?.role !== 'admin' || locals.user.status !== 'approved') {
		error(403, 'Esta sección es solo para administradores.');
	}
	return { pending: await pendingUsers(db()) };
};
