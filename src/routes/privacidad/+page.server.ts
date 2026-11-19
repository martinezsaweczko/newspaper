import { config } from '#lib/server/config.ts';
import type { PageServerLoad } from './$types';

/** Public page (see LEGAL_PATHS in auth/current.ts): who runs the stand and how to reach them. */
export const load: PageServerLoad = () => ({ legal: config.legal });
