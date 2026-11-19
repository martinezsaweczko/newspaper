/** Links into the reading log (`/admin/lecturas`) and its CSV, from its filter state. */
export interface LogFilters {
	usuario?: string | null;
	periodico?: string | null;
	region?: string | null;
	/** ISO dates. */
	desde?: string | null;
	hasta?: string | null;
}

/** The query string of a filtered view (empty values dropped); `page` only when past the first. */
export function logSearch(filters: LogFilters, page?: number): '' | `?${string}` {
	const params = new URLSearchParams();
	for (const key of ['usuario', 'periodico', 'region', 'desde', 'hasta'] as const) {
		const value = filters[key];
		if (value) params.set(key, value);
	}
	if (page && page > 1) params.set('pagina', String(page));
	const s = params.toString();
	return s ? `?${s}` : '';
}

export function logUrl(
	filters: LogFilters,
	page?: number
): '/admin/lecturas' | `/admin/lecturas?${string}` {
	const search = logSearch(filters, page);
	return search ? `/admin/lecturas${search}` : '/admin/lecturas';
}

export function csvUrl(
	filters: LogFilters
): '/admin/lecturas.csv' | `/admin/lecturas.csv?${string}` {
	const search = logSearch(filters);
	return search ? `/admin/lecturas.csv${search}` : '/admin/lecturas.csv';
}
