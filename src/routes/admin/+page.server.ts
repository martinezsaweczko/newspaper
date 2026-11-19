import { db } from '#lib/server/auth/index.ts';
import { mastheadNames } from '#lib/server/library/index.ts';
import { overview } from '#lib/server/reading/views.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => overview(db(), mastheadNames());
