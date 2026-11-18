<script lang="ts">
	import Nameplate from '#lib/components/Nameplate.svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	/** SvelteKit's own English fallbacks, worded in Spanish. */
	const KIT_MESSAGES: Record<string, string> = {
		'Not Found': 'No hemos encontrado lo que buscas.',
		'Internal Error': 'Error interno del servidor.'
	};
	const message = $derived(
		page.error?.message
			? (KIT_MESSAGES[page.error.message] ?? page.error.message)
			: 'Error inesperado.'
	);
</script>

<svelte:head>
	<title>{page.status} · NewsPaper</title>
</svelte:head>

<div class="mx-auto max-w-[1440px] px-4 pt-4 sm:px-8">
	<Nameplate />
	<main class="mt-10 max-w-[60ch] pb-24">
		<h1 class="font-serif text-[28px] leading-tight font-semibold">
			{page.status === 404 ? 'Esta página no está en el quiosco' : 'Algo ha salido mal'}
		</h1>
		<p class="mt-3 text-base text-ink">
			{message}
			<a href={resolve('/')} class="underline underline-offset-4">Volver a los periódicos de hoy</a>
		</p>
	</main>
</div>
