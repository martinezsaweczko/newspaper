import { isoFromLocalDate } from '#lib/format/date.ts';
import {
	ADMIN_ACTIONS,
	applyAdminAction,
	deleteUser,
	groupByStatus,
	listUsers,
	type AdminAction,
	type AdminError
} from '#lib/server/admin/users.ts';
import { db, userCache } from '#lib/server/auth/index.ts';
import type { UserRow, UserStatus } from '#lib/server/db/schema.ts';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/** The tab in the URL (`?vista=`), in Spanish, and the status it lists. */
const VIEWS = { pendientes: 'pending', aprobados: 'approved', bloqueados: 'blocked' } as const;
type View = keyof typeof VIEWS;
const isView = (v: string | null): v is View => v !== null && v in VIEWS;

const DONE: Record<AdminAction, (name: string) => string> = {
	approve: (n) => `Has aprobado el acceso de ${n}.`,
	block: (n) => `${n} queda bloqueado y su sesión se ha cerrado.`,
	unblock: (n) => `${n} puede volver a leer.`,
	promote: (n) => `${n} ya es administrador.`,
	demote: (n) => `${n} ya no es administrador.`
};

const ERRORS: Record<AdminError, string> = {
	self: 'No puedes bloquearte ni quitarte la administración a ti mismo.',
	'last-admin': 'Tiene que quedar al menos un administrador.',
	'not-found': 'Esa cuenta ya no existe.',
	'invalid-state': 'Esa cuenta ha cambiado mientras tanto. Recarga la página.'
};

/** Deleting has its own wording: the account is gone, so there is no name to show. */
const DELETED = 'Cuenta eliminada. Su historial de lectura se ha borrado con ella.';
const DELETE_ERRORS: Record<AdminError, string> = {
	...ERRORS,
	self: 'No puedes eliminar tu propia cuenta.',
	'last-admin': 'No se puede eliminar al último administrador.'
};
/** The confirmation field the delete form must carry (the no-JS path needs it as much). */
const CONFIRM = 'si';

const view = (row: UserRow) => ({
	id: row.id,
	name: row.name || row.email,
	email: row.email,
	role: row.role,
	status: row.status,
	/** ISO dates, formatted by the page with #lib/format/date.ts. */
	registered: isoFromLocalDate(row.createdAt),
	lastLogin: row.lastLoginAt ? isoFromLocalDate(row.lastLoginAt) : null
});

export const load: PageServerLoad = async ({ url, locals }) => {
	const rows = await listUsers(db());
	const groups = groupByStatus(rows);
	const asked = url.searchParams.get('vista');
	const current: View = isView(asked)
		? asked
		: groups.pending.length > 0
			? 'pendientes'
			: 'aprobados';

	// `?hecho=approve:12` after a successful action (post/redirect/get)
	let notice: string | null = null;
	const [action, id] = (url.searchParams.get('hecho') ?? '').split(':');
	if (action === 'delete') notice = DELETED;
	else if (ADMIN_ACTIONS.includes(action as AdminAction)) {
		const row = rows.find((r) => r.id === Number(id));
		if (row) notice = DONE[action as AdminAction](row.name || row.email);
	}

	const counts = Object.fromEntries(
		Object.entries(VIEWS).map(([v, s]) => [v, groups[s as UserStatus].length])
	) as Record<View, number>;
	const me = locals.user?.kind === 'google' ? locals.user.id : null;
	const listed = groups[VIEWS[current]].map(view);
	// `?eliminar=12`: the confirmation step for deleting that account (works without JS)
	const askedDelete = Number(url.searchParams.get('eliminar'));
	const confirmDelete =
		listed.some((r) => r.id === askedDelete) && askedDelete !== me ? askedDelete : null;
	return { view: current, counts, rows: listed, me, notice, confirmDelete };
};

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		const actor = locals.user;
		if (!actor) error(401, 'Inicia sesión primero.');
		const form = await request.formData();
		const action = String(form.get('action') ?? '') as AdminAction;
		const id = Number(form.get('id'));
		const back = String(form.get('vista') ?? url.searchParams.get('vista') ?? '');
		const vista = isView(back) ? back : 'pendientes';

		if ((action as string) === 'delete') {
			if (!Number.isSafeInteger(id) || id < 1) return fail(400, { message: 'Acción no válida.' });
			if (form.get('confirm') !== CONFIRM) {
				return fail(400, { message: 'Confirma la eliminación antes de borrar la cuenta.' });
			}
			const result = await deleteUser(db(), actor, id);
			// their next request finds no user: signed out everywhere
			userCache.invalidate(id);
			if (!result.ok) return fail(409, { message: DELETE_ERRORS[result.error] });
			redirect(303, `/admin/usuarios?vista=${vista}&hecho=delete`);
		}

		if (!ADMIN_ACTIONS.includes(action) || !Number.isSafeInteger(id) || id < 1) {
			return fail(400, { message: 'Acción no válida.' });
		}
		const result = await applyAdminAction(db(), actor, action, id);
		userCache.invalidate(id);
		if (!result.ok) return fail(409, { message: ERRORS[result.error] });
		redirect(303, `/admin/usuarios?vista=${vista}&hecho=${action}:${id}`);
	}
};
