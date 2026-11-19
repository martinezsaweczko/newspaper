/**
 * The Google sign-in round trip, without the HTTP plumbing (the routes under /auth/google only
 * move cookies and redirects). `state`, `nonce` and the PKCE verifier travel in one short-lived
 * signed httpOnly cookie; the callback is a GET, so the state check is its CSRF protection.
 */
import { timingSafeEqual } from 'node:crypto';
import { sanitizeNext } from './next.ts';
import { OidcError, randomToken, type IdClaims, type OidcClient } from './oidc.ts';
import { readToken, signToken } from './session.ts';

export const FLOW_COOKIE = 'np_oidc';
export const FLOW_TTL_SECONDS = 10 * 60;
/** The cookie is only sent to the callback. */
export const FLOW_COOKIE_PATH = '/auth/google';
const PURPOSE = 'oidc-flow';

interface FlowState {
	s: string;
	n: string;
	cv: string;
	next: string;
	exp: number;
}

/**
 * Why the button was pressed. `register` asks the provider to show its account chooser
 * (`prompt=select_account`) so a newcomer picks the right Google account; `signin` keeps the
 * provider's default prompt. Both run the same flow: a new account is created pending approval.
 */
export type SignInIntent = 'signin' | 'register';

/** Whitelist the `?intent=` query value: only `register` is recognised, anything else signs in. */
export function parseIntent(raw: string | null | undefined): SignInIntent {
	return raw === 'register' ? 'register' : 'signin';
}

/** Start a sign-in: the provider URL to redirect to and the flow cookie to set. */
export async function beginSignIn(
	client: OidcClient,
	secret: string,
	next: string | null | undefined,
	now = Date.now(),
	intent: SignInIntent = 'signin'
): Promise<{ url: string; cookie: string }> {
	const flow: FlowState = {
		s: randomToken(),
		n: randomToken(),
		cv: randomToken(48),
		next: sanitizeNext(next),
		exp: Math.floor(now / 1000) + FLOW_TTL_SECONDS
	};
	const url = await client.authorizationUrl({ state: flow.s, nonce: flow.n, verifier: flow.cv });
	// The OIDC client always asks for the account chooser; only registration keeps it, so a
	// returning reader signs in with Google's default prompt (often a single click).
	url.searchParams.delete('prompt');
	if (intent === 'register') url.searchParams.set('prompt', 'select_account');
	return { url: url.toString(), cookie: signToken(flow, secret, PURPOSE) };
}

function readFlow(cookie: string | undefined, secret: string, now: number): FlowState | null {
	const data = readToken(cookie, secret, PURPOSE, 4096);
	if (!data) return null;
	const { s, n, cv, next, exp } = data;
	if (typeof s !== 'string' || typeof n !== 'string' || typeof cv !== 'string') return null;
	if (typeof next !== 'string' || typeof exp !== 'number' || exp * 1000 <= now) return null;
	return { s, n, cv, next, exp };
}

const sameString = (a: string, b: string) => {
	const x = Buffer.from(a);
	const y = Buffer.from(b);
	return x.length === y.length && timingSafeEqual(x, y);
};

export interface VerifiedIdentity {
	sub: string;
	/** Lowercase. */
	email: string;
	name: string;
	picture: string | null;
}

export function identityFromClaims(claims: IdClaims): VerifiedIdentity {
	const email = String(claims.email).trim().toLowerCase();
	const name = typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim() : email;
	const picture =
		typeof claims.picture === 'string' && /^https:\/\//.test(claims.picture)
			? claims.picture.slice(0, 2048)
			: null;
	return { sub: claims.sub, email, name: name.slice(0, 200), picture };
}

/**
 * Finish a sign-in from the callback's query and the flow cookie: check state, exchange the code
 * (with the PKCE verifier) and verify the ID token. Throws OidcError with a reason on failure.
 */
export async function finishSignIn(
	client: OidcClient,
	secret: string,
	params: URLSearchParams,
	cookie: string | undefined,
	now = Date.now()
): Promise<{ identity: VerifiedIdentity; next: string }> {
	const flow = readFlow(cookie, secret, now);
	const state = params.get('state');
	if (!flow || !state || !sameString(state, flow.s)) {
		throw new OidcError('state', 'missing, expired or mismatched state');
	}
	if (params.get('error')) throw new OidcError('denied', 'provider returned an error');
	const code = params.get('code');
	if (!code || code.length > 2048) throw new OidcError('token', 'no authorization code');
	const idToken = await client.exchangeCode(code, flow.cv);
	const claims = await client.verifyIdToken(idToken, flow.n);
	return { identity: identityFromClaims(claims), next: sanitizeNext(flow.next) };
}
