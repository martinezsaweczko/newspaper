/**
 * CSRF guard for form posts. Kit's own origin check is off (`csrf.trustedOrigins: ['*']`) because
 * adapter-node assumes https and would reject every form POST on a plain-http LAN. Here the Origin
 * host must equal the Host header, ignoring the scheme.
 */
const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];

export function isCrossSiteForm(request: Request): boolean {
	if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return false;
	const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
	if (!FORM_TYPES.includes(type)) return false;
	const origin = request.headers.get('origin');
	const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
	if (!origin || !host) return true;
	try {
		return new URL(origin).host !== host;
	} catch {
		return true;
	}
}
