import { editionFacts, resolveEdition } from '#lib/server/library/index.ts';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** The in-app reader: the edition's masthead and date; the PDF itself loads from `/pdf/[id]`. */
export const load: PageServerLoad = ({ params }) => {
	const edition = resolveEdition(params.id);
	if (!edition) error(404, 'No hay ninguna edición con esa dirección');
	const facts = editionFacts(edition);
	return {
		id: params.id,
		masthead: facts.masthead,
		slug: facts.mastheadSlug,
		region: facts.region,
		date: facts.date
	};
};
