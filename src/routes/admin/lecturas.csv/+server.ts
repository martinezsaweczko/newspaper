import { isoFromLocalDate } from '#lib/format/date.ts';
import { db } from '#lib/server/auth/index.ts';
import { mastheadNames } from '#lib/server/library/index.ts';
import { csvRows, parseLogQuery, toCsv } from '#lib/server/reading/views.ts';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** The reading log as CSV, with the same filters as /admin/lecturas (no paging). */
export const GET: RequestHandler = async ({ url, locals }) => {
	// the hook already guards /admin/**; endpoints do not run the admin layout's load
	if (locals.user?.role !== 'admin' || locals.user.status !== 'approved') {
		error(403, 'Esta sección es solo para administradores.');
	}
	const rows = await csvRows(db(), mastheadNames(), parseLogQuery(url.searchParams));
	return new Response(toCsv(rows), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="lecturas-${isoFromLocalDate(new Date())}.csv"`,
			'cache-control': 'no-store'
		}
	});
};
