<script lang="ts">
	import type { CurrentUser } from '#lib/types.ts';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import PrivacyNotice from './PrivacyNotice.svelte';
	import SiteHeader from './SiteHeader.svelte';

	/** The page a signed-in account sees while it cannot read: pending approval or blocked. */
	let {
		user,
		title,
		children,
		recheck = false
	}: { user: CurrentUser | null; title: string; children: Snippet; recheck?: boolean } = $props();
</script>

<svelte:head>
	<title>{title} · NewsPaper</title>
</svelte:head>

<div class="mx-auto max-w-[1440px] px-4 sm:px-8">
	<SiteHeader {user} skipLabel="Saltar al contenido" />
	<main id="main" class="max-w-[60ch] pt-10 pb-24">
		<h1 class="font-serif text-[28px] leading-tight font-semibold">{title}</h1>
		<div class="mt-3 flex flex-col gap-3 text-base leading-relaxed text-ink">
			{@render children()}
		</div>
		<div class="mt-8 flex flex-wrap items-center gap-3">
			{#if recheck}
				<!-- a full reload: the guard sends an approved account on to the stand -->
				<a
					href={resolve('/')}
					data-sveltekit-reload
					class="flex h-12 items-center rounded-[6px] bg-ink px-5 text-base font-medium text-on-ink transition-opacity hover:opacity-90"
					>Comprobar de nuevo</a
				>
			{/if}
			<form method="POST" action="/logout">
				<button
					type="submit"
					class="h-12 cursor-pointer rounded-[6px] border border-ink px-5 text-base font-medium text-ink hover:bg-shelf"
				>
					Cerrar sesión
				</button>
			</form>
		</div>
		<PrivacyNotice class="mt-10 border-t border-hairline pt-4" />
	</main>
</div>
