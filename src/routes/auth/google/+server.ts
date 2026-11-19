import {
	beginSignIn,
	FLOW_COOKIE,
	FLOW_COOKIE_PATH,
	FLOW_TTL_SECONDS,
	parseIntent
} from '#lib/server/auth/google.ts';
import { googleClient } from '#lib/server/auth/index.ts';
import { config, sessionSecret } from '#lib/server/config.ts';
import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Start Google sign-in (`?intent=register` shows the account chooser): set the signed flow cookie and send the browser to Google. */
export const GET: RequestHandler = async ({ url, cookies }) => {
	const client = googleClient();
	if (!client) error(404, 'Not Found');
	let target: string;
	let external: string[] | undefined;
	try {
		const { url: providerUrl, cookie } = await beginSignIn(
			client,
			sessionSecret(),
			url.searchParams.get('next'),
			Date.now(),
			parseIntent(url.searchParams.get('intent'))
		);
		cookies.set(FLOW_COOKIE, cookie, {
			path: FLOW_COOKIE_PATH,
			httpOnly: true,
			sameSite: 'lax',
			secure: config.cookieSecure,
			maxAge: FLOW_TTL_SECONDS
		});
		target = providerUrl;
		// Kit refuses external redirects unless allowed: allow exactly the provider's origin
		external = [new URL(providerUrl).origin];
	} catch (err) {
		console.error(`[auth] could not start Google sign-in: ${(err as Error).message}`);
		target = '/login?error=google';
	}
	redirect(303, target, { external });
};
