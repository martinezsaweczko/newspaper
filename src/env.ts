import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) =>
	value === undefined || value === '' ? undefined : value;

export const variables = defineEnvVars({
	NEWSPAPER_DIR: {
		description: 'The shared flat folder of newspaper PDFs (read-only). Default ./newspapers',
		schema: (value) => optional(value) ?? './newspapers'
	},
	DATA_DIR: {
		description:
			'Writable app data: users.json, regions.json, ignore.json, thumbs/. Default ./data',
		schema: (value) => optional(value) ?? './data'
	},
	SESSION_SECRET: {
		description: 'HMAC key for session cookies. Required in production (32+ characters).',
		schema: (value) => optional(value)
	},
	COOKIE_SECURE: {
		description: 'Set to "true" behind https so the session cookie is Secure. Default false.',
		schema: (value) => /^(1|true|yes|on)$/i.test(value ?? '')
	},
	AUTH_DISABLED: {
		description:
			'Testing only: "true" skips the login under `npm run dev`. Ignored by production builds.',
		schema: (value) => /^(1|true|yes|on)$/i.test(value ?? '')
	},
	DATABASE_URL: {
		description:
			'MySQL connection URL, e.g. mysql://newspaper:newspaper@127.0.0.1:3307/newspaper. Required.',
		schema: (value) => {
			const url = optional(value);
			if (!url) throw new Error('DATABASE_URL is required (mysql://user:pass@host:port/db).');
			return url;
		}
	},
	GOOGLE_CLIENT_ID: {
		description: 'Google OAuth client id. Google sign-in is off unless id and secret are set.',
		schema: (value) => optional(value)
	},
	GOOGLE_CLIENT_SECRET: {
		description: 'Google OAuth client secret.',
		schema: (value) => optional(value)
	},
	GOOGLE_ISSUER: {
		description:
			'OpenID issuer whose /.well-known/openid-configuration is used. Default https://accounts.google.com (tests point it at a fake provider).',
		schema: (value) => optional(value) ?? 'https://accounts.google.com'
	},
	PUBLIC_ORIGIN: {
		description:
			'The origin users reach the app on, e.g. https://news.example.com or http://localhost:5173. The Google redirect URI is <origin>/auth/google/callback.',
		schema: (value) => optional(value)?.replace(/\/+$/, '')
	},
	ADMIN_EMAILS: {
		description:
			'Comma-separated emails that become approved admins on their first Google sign-in.',
		schema: (value) => optional(value) ?? ''
	}
});
