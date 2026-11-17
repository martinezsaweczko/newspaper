import { library } from '#lib/server/library/index.ts';
import { backIssues } from '#lib/server/library/newsstand.ts';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const issues = backIssues(library().editions, params.slug);
	if (issues.length === 0) error(404, 'No editions of this paper');
	return { issues, masthead: issues[0].masthead, region: issues[0].region };
};
