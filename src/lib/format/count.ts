/**
 * Spanish count wording for the stand. Pure. One noun for an edition everywhere a count is shown:
 * "portada" (the stand shows each edition as its front page); "periódico" names the masthead.
 */

/** `1 portada`, `2 portadas`: the singular for exactly one, the plural otherwise (0 included). */
export function plural(n: number, one: string, many: string): string {
	return `${n} ${n === 1 ? one : many}`;
}

export const countFrontPages = (n: number) => plural(n, 'portada', 'portadas');

export interface StandCounts {
	/** Editions visible after the filters. */
	shown: number;
	/** Editions on the day before the filters. */
	onDate: number;
	/** Regions with an edition on the day. */
	regions: number;
	region: string | null;
	q: string;
}

/**
 * The line under the dateline. Unfiltered: `35 portadas de 4 regiones`. Filtered, the visible set
 * against the day, then the filters in effect: `3 de 35 portadas · Catalunya · «voz»`.
 */
export function standSummary({ shown, onDate, regions, region, q }: StandCounts): string {
	if (!region && !q)
		return `${countFrontPages(onDate)} de ${plural(regions, 'región', 'regiones')}`;
	const filters = [region, q ? `«${q}»` : null].filter(Boolean);
	return [`${shown} de ${countFrontPages(onDate)}`, ...filters].join(' · ');
}
