<script lang="ts">
	import PdfReader from '#lib/components/PdfReader.svelte';
	import SiteHeader from '#lib/components/SiteHeader.svelte';
	import { formatDate, formatDateline } from '#lib/format/date.ts';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const pdf = $derived(resolve('/pdf/[id]', { id: data.id }));
	const download = $derived(resolve('/pdf/[id]?download=1', { id: data.id }));
</script>

<svelte:head>
	<title>{data.masthead}, {formatDateline(data.date)} · NewsPaper</title>
</svelte:head>

<div class="mx-auto max-w-[1440px] px-4 sm:px-8">
	<SiteHeader user={data.user} skipLabel="Saltar a la edición" />

	<main id="main" class="pb-24">
		<div
			class="flex flex-col gap-2 border-b border-ink py-3 sm:flex-row sm:items-end sm:justify-between"
		>
			<div>
				<a
					href={resolve('/paper/[slug]', { slug: data.slug })}
					class="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[6px] px-2 text-[14px] text-ink hover:bg-shelf"
				>
					<span aria-hidden="true">‹</span> Números anteriores
				</a>
				<h1
					class="font-serif text-[26px] leading-tight font-bold tracking-[-0.02em] sm:text-[32px]"
				>
					{data.masthead}
				</h1>
				<p class="text-[14px] text-ink-soft">{formatDateline(data.date)} · {data.region}</p>
			</div>
			<p class="flex gap-4 text-[14px]">
				<a
					href={pdf}
					data-sveltekit-reload
					class="inline-flex min-h-11 items-center text-ink-soft underline-offset-4 hover:text-ink hover:underline sm:min-h-0"
					>Abrir en el navegador</a
				>
				<a
					href={download}
					data-sveltekit-reload
					download
					class="inline-flex min-h-11 items-center text-ink underline underline-offset-4 sm:min-h-0"
					aria-label={`Descargar en PDF la edición del ${formatDate(data.date)}`}>Descargar PDF</a
				>
			</p>
		</div>

		{#key data.id}
			<PdfReader src={pdf} label={`${data.masthead}, ${formatDate(data.date)}`}>
				{#snippet fallback()}
					<p class="text-[14px] text-ink-soft">
						Puedes <a href={pdf} data-sveltekit-reload class="text-ink underline underline-offset-4"
							>abrirla con el visor del navegador</a
						>
						o
						<a
							href={download}
							data-sveltekit-reload
							download
							class="text-ink underline underline-offset-4">descargarla</a
						>.
					</p>
				{/snippet}
			</PdfReader>
		{/key}
	</main>
</div>
