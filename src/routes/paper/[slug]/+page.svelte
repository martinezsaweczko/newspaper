<script lang="ts">
	import FrontPage from '#lib/components/FrontPage.svelte';
	import { SHELF_GRID } from '#lib/components/shelf.ts';
	import SiteHeader from '#lib/components/SiteHeader.svelte';
	import { formatDate, formatDateline } from '#lib/format/date.ts';
	import { standUrl } from '#lib/stand-url.ts';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const newest = $derived(data.issues[0]);
	const oldest = $derived(data.issues[data.issues.length - 1]);
	const count = $derived(data.issues.length);
</script>

<svelte:head>
	<title>{data.masthead} · NewsPaper</title>
</svelte:head>

<div class="mx-auto max-w-[1440px] px-4 sm:px-8">
	<SiteHeader user={data.user} />

	<main id="main" class="pb-24">
		<div
			class="flex flex-col gap-2 border-b border-ink py-3 sm:flex-row sm:items-end sm:justify-between"
		>
			<div>
				<a
					href={resolve(standUrl({ date: newest.date }))}
					class="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[6px] px-2 text-[14px] text-ink hover:bg-shelf"
				>
					<span aria-hidden="true">‹</span> Volver al quiosco
				</a>
				<h1
					class="font-serif text-[26px] leading-tight font-bold tracking-[-0.02em] sm:text-[32px]"
				>
					{data.masthead}
				</h1>
			</div>
			<p class="text-[14px] text-ink-soft tabular-nums">
				{data.region} · {count}
				{count === 1 ? 'edición' : 'ediciones'}{#if count > 1}, del {formatDate(oldest.date)} al {formatDate(
						newest.date
					)}{/if}
			</p>
		</div>

		<section class="mt-6" aria-label="Números anteriores, del más reciente al más antiguo">
			<ul class={[SHELF_GRID, 'gap-y-8 sm:gap-y-10']}>
				{#each data.issues as edition, i (edition.id)}
					<li class="min-w-0">
						<FrontPage {edition} priority={i < 6}>
							{#snippet caption()}
								<p class="font-serif text-[17px] leading-snug font-semibold text-ink">
									{formatDateline(edition.date)}
								</p>
								<a
									href={resolve('/pdf/[id]?download=1', { id: edition.id })}
									data-sveltekit-reload
									download
									class="-ml-1 inline-flex min-h-11 items-center rounded-[6px] px-1 text-[14px] text-ink-soft underline-offset-4 hover:text-ink hover:underline sm:min-h-0"
									aria-label={`Descargar en PDF la edición del ${formatDate(edition.date)}`}
									>Descargar PDF</a
								>
							{/snippet}
						</FrontPage>
					</li>
				{/each}
			</ul>
		</section>
	</main>
</div>
