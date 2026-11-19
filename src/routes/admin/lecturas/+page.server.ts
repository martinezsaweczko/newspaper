import { db } from '#lib/server/auth/index.ts';
import { mastheadNames } from '#lib/server/library/index.ts';
import { logPage, parseLogQuery } from '#lib/server/reading/views.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) =>
	logPage(db(), mastheadNames(), parseLogQuery(url.searchParams));
