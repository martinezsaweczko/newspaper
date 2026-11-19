// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { CurrentUser } from '#lib/types.ts';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** The signed-in person (Google account or local admin), or null. */
			user: CurrentUser | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
