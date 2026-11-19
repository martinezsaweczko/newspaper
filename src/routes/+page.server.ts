import { library } from '#lib/server/library/index.ts';
import { buildNewsstand } from '#lib/server/library/newsstand.ts';
import { isoFromLocalDate } from '#lib/format/date.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const { editions, regionOrder } = library();
	const stand = buildNewsstand(
		editions,
		{
			date: url.searchParams.get('date'),
			region: url.searchParams.get('region'),
			q: url.searchParams.get('q'),
			today: isoFromLocalDate(new Date())
		},
		regionOrder
	);
	return { stand, total: editions.length };
};
