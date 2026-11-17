/** Build a newsstand URL from its filter state; empty values are left out. */
export function standUrl(state: {
	date?: string | null;
	region?: string | null;
	q?: string | null;
}): '/' | `/?${string}` {
	const params = new URLSearchParams();
	if (state.date) params.set('date', state.date);
	if (state.region) params.set('region', state.region);
	if (state.q) params.set('q', state.q);
	const query = params.toString();
	return query ? `/?${query}` : '/';
}
