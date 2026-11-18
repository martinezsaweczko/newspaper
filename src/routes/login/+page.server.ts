import { isoFromLocalDate } from '#lib/format/date.ts';
import { loginThrottle } from '#lib/server/auth/index.ts';
import { sanitizeNext } from '#lib/server/auth/next.ts';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from '#lib/server/auth/session.ts';
import { authenticate } from '#lib/server/auth/users.ts';
import { config, sessionSecret } from '#lib/server/config.ts';
import { recordLogin } from '#lib/server/observability/metrics.ts';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const next = sanitizeNext(url.searchParams.get('next'));
	if (locals.user) redirect(303, next);
	return { next, today: isoFromLocalDate(new Date()) };
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, url }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '').slice(0, 64);
		const password = String(form.get('password') ?? '').slice(0, 1024);
		const next = sanitizeNext(String(form.get('next') ?? url.searchParams.get('next') ?? '/'));
		const key = getClientAddress();

		const wait = loginThrottle.retryAfter(key);
		if (wait > 0) {
			recordLogin('throttled');
			const minutes = Math.ceil(wait / 60);
			return fail(429, {
				username,
				message: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
			});
		}
		if (!username || !password) {
			recordLogin('failure');
			return fail(400, { username, message: 'Enter your username and password.' });
		}

		const user = await authenticate(config.dataDir, username, password);
		if (!user) {
			loginThrottle.fail(key);
			recordLogin('failure');
			return fail(400, { username, message: 'That username and password do not match.' });
		}

		loginThrottle.reset(key);
		recordLogin('success');
		cookies.set(SESSION_COOKIE, signSession(user, sessionSecret()), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: config.cookieSecure,
			maxAge: SESSION_TTL_SECONDS
		});
		redirect(303, next);
	}
};
