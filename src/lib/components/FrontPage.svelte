<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatDate } from '#lib/format/date.ts';
	import type { Edition } from '#lib/types.ts';

	/** One edition on the stand: its rendered front page, opening the PDF. */
	let {
		edition,
		caption,
		priority = false
	}: {
		edition: Edition;
		/** Text under the page; defaults to the masthead name. */
		caption?: import('svelte').Snippet;
		/** Load eagerly (first row above the fold). */
		priority?: boolean;
	} = $props();

	let failed = $state(false);
	let img: HTMLImageElement | undefined = $state();

	// An SSR'd image may fail before hydration attaches onerror.
	$effect(() => {
		if (img && img.complete && img.naturalWidth === 0) failed = true;
	});

	const alt = $derived(`${edition.masthead}, front page, ${formatDate(edition.date)}`);
</script>

<figure class="flex flex-col gap-3">
	<a
		href={resolve('/pdf/[id]', { id: edition.id })}
		data-sveltekit-reload
		class="group block rounded-[2px] focus-visible:outline-offset-[6px]"
	>
		<div class="front-page relative aspect-[32/45] overflow-hidden bg-shelf">
			{#if failed}
				<div
					class="flex h-full flex-col items-center justify-center gap-3 bg-sheet px-4 text-center"
				>
					<span class="font-serif text-xl leading-tight font-bold text-ink">{edition.masthead}</span
					>
					<span class="text-[13px] text-ink-soft">Front page unavailable. Open the PDF.</span>
					<span class="sr-only">{alt}</span>
				</div>
			{:else}
				<img
					bind:this={img}
					src={resolve('/thumb/[id]', { id: edition.id })}
					{alt}
					width="640"
					height="900"
					loading={priority ? 'eager' : 'lazy'}
					fetchpriority={priority ? 'high' : 'auto'}
					decoding="async"
					class="h-full w-full object-cover object-top"
					onerror={() => (failed = true)}
				/>
			{/if}
		</div>
	</a>
	<figcaption class="min-w-0">
		{#if caption}
			{@render caption()}
		{:else}
			<a
				href={resolve('/paper/[slug]', { slug: edition.slug })}
				class="-my-1 inline-block py-1 font-serif text-[17px] leading-snug font-semibold text-ink underline-offset-4 hover:underline"
				aria-label={`${edition.masthead}, back issues`}
			>
				{edition.masthead}
			</a>
		{/if}
	</figcaption>
</figure>
