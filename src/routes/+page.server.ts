import { library } from '#lib/server/library/index.ts';
import { buildNewsstand, findElsewhere } from '#lib/server/library/newsstand.ts';
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
	// An empty search: the mastheads it matches on other days (ignore list and region respected).
	const elsewhere =
		stand.q && stand.shown === 0
			? findElsewhere(editions, { q: stand.q, date: stand.date, region: stand.region })
			: [];
	return { stand, elsewhere, total: editions.length };
};
