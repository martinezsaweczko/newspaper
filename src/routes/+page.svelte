<script lang="ts">
	import FrontPage from '#lib/components/FrontPage.svelte';
	import { SHELF_GRID, shelfSpan } from '#lib/components/shelf.ts';
	import SiteHeader from '#lib/components/SiteHeader.svelte';
	import { formatLongDate, formatShortDate, formatWeekdayDate } from '#lib/format/date.ts';
	import { standUrl } from '#lib/stand-url.ts';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const stand = $derived(data.stand);

	let form: HTMLFormElement | undefined = $state();
	let timer: ReturnType<typeof setTimeout> | undefined;

	function submitSoon(delay = 0) {
		clearTimeout(timer);
		timer = setTimeout(() => form?.requestSubmit(), delay);
	}

	const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
	const filtered = $derived(Boolean(stand.region || stand.q));
	// eager-load roughly the first screen of front pages
	const eagerIds = $derived(
		new Set(
			stand.groups
				.flatMap((g) => g.editions)
				.slice(0, 6)
				.map((e) => e.id)
		)
	);
</script>

<svelte:head>
	<title>{stand.date ? `${formatLongDate(stand.date)} · NewsPaper` : 'NewsPaper'}</title>
</svelte:head>

<div class="mx-auto max-w-[1440px] px-4 sm:px-8">
	<SiteHeader user={data.user} />

	<main id="main" class="pb-24">
		{#if !stand.date}
			<section class="mt-12 max-w-[60ch]" aria-labelledby="empty-title">
				<h1 id="empty-title" class="font-serif text-[28px] leading-tight font-semibold">
					The stand is empty
				</h1>
				<p class="mt-3 text-base leading-relaxed text-ink">
					No newspapers have arrived yet. Editions appear here as soon as their PDFs are placed in
					the shared folder; each one is shown by its front page, grouped by region.
				</p>
			</section>
		{:else}
			<div
				class="flex flex-col gap-1 border-b border-ink py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
			>
				<h1
					class="font-serif text-[24px] leading-tight font-semibold tracking-[-0.01em] sm:text-[30px]"
				>
					{formatLongDate(stand.date)}
				</h1>
				<p class="text-[14px] text-ink-soft tabular-nums">
					{plural(stand.onDate, 'front page', 'front pages')} from {plural(
						stand.regions.length,
						'region',
						'regions'
					)}
				</p>
			</div>

			<form
				bind:this={form}
				method="GET"
				action="/"
				data-sveltekit-keepfocus
				data-sveltekit-noscroll
				data-sveltekit-replacestate
				class="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between"
				role="search"
				aria-label="Choose a day, region or paper"
			>
				<nav class="flex items-center gap-1" aria-label="Days">
					{#if stand.prev}
						<a
							class="inline-flex min-h-11 items-center gap-1 rounded-[6px] px-2 text-[14px] text-ink hover:bg-shelf"
							href={resolve(standUrl({ date: stand.prev, region: stand.region, q: stand.q }))}
							rel="prev"
							aria-label={`Previous day with papers: ${formatLongDate(stand.prev)}`}
						>
							<span aria-hidden="true">‹</span>
							{formatShortDate(stand.prev)}
						</a>
					{:else}
						<span
							class="inline-flex min-h-11 items-center gap-1 px-2 text-[14px] text-ink-soft"
							aria-disabled="true"><span aria-hidden="true">‹</span> Earliest</span
						>
					{/if}

					<label class="sr-only" for="date">Day</label>
					<select
						id="date"
						name="date"
						class="h-11 min-w-0 cursor-pointer rounded-[6px] border border-control bg-sheet px-3 text-base text-ink tabular-nums sm:text-[14px]"
						onchange={() => submitSoon()}
					>
						{#each stand.dates as d (d)}
							<option value={d} selected={d === stand.date}>{formatWeekdayDate(d)}</option>
						{/each}
					</select>

					{#if stand.next}
						<a
							class="inline-flex min-h-11 items-center gap-1 rounded-[6px] px-2 text-[14px] text-ink hover:bg-shelf"
							href={resolve(standUrl({ date: stand.next, region: stand.region, q: stand.q }))}
							rel="next"
							aria-label={`Next day with papers: ${formatLongDate(stand.next)}`}
						>
							{formatShortDate(stand.next)}
							<span aria-hidden="true">›</span>
						</a>
					{:else}
						<span
							class="inline-flex min-h-11 items-center gap-1 px-2 text-[14px] text-ink-soft"
							aria-disabled="true">Latest <span aria-hidden="true">›</span></span
						>
					{/if}
				</nav>

				<div class="flex items-center gap-3">
					<label class="sr-only" for="region">Region</label>
					<select
						id="region"
						name="region"
						class="h-11 w-[42%] min-w-0 cursor-pointer rounded-[6px] border border-control bg-sheet px-3 text-base text-ink sm:w-auto sm:text-[14px]"
						onchange={() => submitSoon()}
					>
						<option value="" selected={!stand.region}>All regions</option>
						{#each stand.regions as r (r)}
							<option value={r} selected={r === stand.region}>{r}</option>
						{/each}
					</select>

					<label class="sr-only" for="q">Find a paper</label>
					<input
						id="q"
						name="q"
						type="search"
						value={stand.q}
						placeholder="Find a paper…"
						autocomplete="off"
						spellcheck="false"
						maxlength="80"
						class="h-11 w-full min-w-0 flex-1 rounded-[6px] border border-control bg-sheet px-3 text-base text-ink placeholder:text-ink-soft sm:w-[280px] sm:text-[14px]"
						oninput={() => submitSoon(300)}
					/>
					<noscript>
						<button
							type="submit"
							class="h-11 rounded-[6px] bg-ink px-4 text-[14px] font-medium text-on-ink"
							>Show</button
						>
					</noscript>
				</div>
			</form>

			<p class="sr-only" aria-live="polite">
				{plural(stand.shown, 'paper', 'papers')} shown
			</p>

			{#if stand.groups.length === 0}
				<section class="mt-6 border-t-[3px] border-ink pt-4" aria-labelledby="none-title">
					<h2 id="none-title" class="font-serif text-[24px] leading-tight font-semibold">
						No paper matches
					</h2>
					<p class="mt-2 text-base text-ink">
						Nothing {stand.q ? `called “${stand.q}”` : ''}
						{stand.region ? `from ${stand.region}` : ''} on {formatLongDate(stand.date)}.
						<a class="underline underline-offset-4" href={resolve(standUrl({ date: stand.date }))}
							>Show every paper of the day</a
						>
					</p>
				</section>
			{/if}

			<div class={[SHELF_GRID, 'mt-4 gap-y-14']}>
				{#each stand.groups as group (group.region)}
					{@const headingId = `region-${group.region.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}`}
					<section
						class={[shelfSpan(group.editions.length), 'grid grid-cols-subgrid content-start']}
						aria-labelledby={headingId}
					>
						<div
							class="col-span-full flex flex-wrap items-baseline justify-between gap-x-4 border-t-[3px] border-ink pt-2"
						>
							<h2
								id={headingId}
								class="font-serif text-[22px] leading-tight font-semibold tracking-[-0.01em] sm:text-[24px]"
							>
								{group.region}
							</h2>
							<span class="text-[14px] text-ink-soft tabular-nums">
								{plural(group.editions.length, 'paper', 'papers')}
							</span>
						</div>
						<ul class="col-span-full mt-5 grid grid-cols-subgrid gap-y-8 sm:gap-y-10">
							{#each group.editions as edition (edition.id)}
								<li class="min-w-0">
									<FrontPage {edition} priority={eagerIds.has(edition.id)} />
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			</div>

			{#if filtered && stand.groups.length > 0}
				<p class="mt-10 text-[14px] text-ink-soft">
					Showing {plural(stand.shown, 'paper', 'papers')} of {stand.onDate}.
					<a
						class="text-ink underline underline-offset-4"
						href={resolve(standUrl({ date: stand.date }))}>Show all</a
					>
				</p>
			{/if}
		{/if}
	</main>
</div>
