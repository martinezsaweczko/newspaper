<script lang="ts">
	import AdminNav from '#lib/components/AdminNav.svelte';
	import ReadingTable from '#lib/components/ReadingTable.svelte';
	import SiteHeader from '#lib/components/SiteHeader.svelte';
	import { logUrl } from '#lib/admin-url.ts';
	import { formatCount, plural } from '#lib/format/count.ts';
	import { formatDateTime } from '#lib/format/date.ts';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const maxOpenings = $derived(Math.max(1, ...data.newspapers.map((n) => n.openings)));
</script>

<svelte:head>
	<title>Resumen · Administración · NewsPaper</title>
</svelte:head>

<div class="mx-auto max-w-[1440px] px-4 sm:px-8">
	<SiteHeader user={data.user} skipLabel="Saltar al resumen" />
	<AdminNav current="resumen" pending={data.pending} />

	<main id="main" class="pb-24">
		<div
			class="flex flex-col gap-3 border-b border-ink py-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6"
		>
			<div>
				<h1 class="font-serif text-[24px] leading-tight font-semibold sm:text-[30px]">Resumen</h1>
				<p class="mt-1 text-[14px] text-ink-soft">
					Quién lee qué en el quiosco: aperturas y descargas de ediciones.
				</p>
			</div>
			{#if data.pending > 0}
				<a
					href={resolve('/admin/usuarios?vista=pendientes')}
					class="flex h-10 flex-none items-center self-start rounded-[6px] bg-ink px-4 text-[14px] font-medium text-on-ink tabular-nums hover:opacity-90 sm:self-auto"
					>Pendientes: {data.pending}</a
				>
			{/if}
		</div>

		<!-- KPI strip: one container split by hairlines, one column per window -->
		<section aria-labelledby="kpi-title" class="mt-6">
			<h2 id="kpi-title" class="sr-only">Actividad</h2>
			<dl class="grid border-y border-hairline sm:grid-cols-3">
				{#each data.totals as window, i (window.label)}
					<div
						class={[
							'py-4 sm:px-6',
							i > 0 && 'border-t border-hairline sm:border-t-0 sm:border-l',
							i === 0 && 'sm:pl-0'
						]}
					>
						<dt class="text-[14px] text-ink-soft">{window.label}</dt>
						<dd class="mt-1">
							<span class="font-serif text-[30px] leading-none font-semibold tabular-nums"
								>{formatCount(window.openings)}</span
							>
							<span class="ml-1 text-[14px] text-ink-soft"
								>{window.openings === 1 ? 'apertura' : 'aperturas'}</span
							>
						</dd>
						<dd class="mt-2 text-[14px] text-ink-soft tabular-nums">
							<span class="text-ink">{plural(window.readers, 'lector', 'lectores')}</span>
							·
							<span class="text-ink">{plural(window.newspapers, 'periódico', 'periódicos')}</span>
						</dd>
					</div>
				{/each}
			</dl>
		</section>

		<div class="mt-10 grid items-start gap-10 lg:grid-cols-2">
			<section aria-labelledby="top-papers">
				<div class="flex items-baseline justify-between gap-4 border-t-[3px] border-ink pt-2">
					<h2 id="top-papers" class="font-serif text-[20px] font-semibold">
						Periódicos más leídos
					</h2>
					<span class="text-[13px] text-ink-soft">Últimos 30 días</span>
				</div>
				{#if data.newspapers.length === 0}
					<p class="mt-3 text-[14px] text-ink-soft">
						Nadie ha abierto todavía una edición en estos 30 días.
					</p>
				{:else}
					<ol class="mt-2">
						{#each data.newspapers as paper (paper.slug)}
							<li class="border-b border-hairline py-2.5">
								<div class="flex items-baseline justify-between gap-4">
									<a
										href={resolve(logUrl({ periodico: paper.slug }))}
										class="min-w-0 truncate font-serif text-[17px] font-semibold underline-offset-4 hover:underline"
										>{paper.masthead}</a
									>
									<span class="flex-none text-[14px] tabular-nums"
										>{formatCount(paper.openings)}
										<span class="text-ink-soft">
											· {plural(paper.readers, 'lector', 'lectores')}</span
										></span
									>
								</div>
								<div class="mt-1 flex items-center gap-3">
									<span class="w-28 flex-none truncate text-[13px] text-ink-soft"
										>{paper.region}</span
									>
									<span class="h-1.5 flex-1" aria-hidden="true">
										<span
											class="block h-full rounded-full bg-signal"
											style:width="{(paper.openings / maxOpenings) * 100}%"
										></span>
									</span>
								</div>
							</li>
						{/each}
					</ol>
				{/if}
			</section>

			<section aria-labelledby="top-readers">
				<div class="flex items-baseline justify-between gap-4 border-t-[3px] border-ink pt-2">
					<h2 id="top-readers" class="font-serif text-[20px] font-semibold">
						Lectores más activos
					</h2>
					<span class="text-[13px] text-ink-soft">Últimos 30 días</span>
				</div>
				{#if data.readers.length === 0}
					<p class="mt-3 text-[14px] text-ink-soft">Todavía no hay lecturas en estos 30 días.</p>
				{:else}
					<table class="mt-2 w-full text-[14px]">
						<thead>
							<tr class="text-left text-[13px] text-ink-soft">
								<th scope="col" class="py-2 font-normal">Lector</th>
								<th scope="col" class="py-2 text-right font-normal">Aperturas</th>
								<th scope="col" class="hidden py-2 pl-4 text-right font-normal sm:table-cell"
									>Periódicos</th
								>
								<th scope="col" class="py-2 pl-4 text-right font-normal">Última</th>
							</tr>
						</thead>
						<tbody>
							{#each data.readers as reader (reader.key)}
								<tr class="border-t border-hairline">
									<td class="max-w-0 py-2.5 pr-4">
										<a
											href={resolve(logUrl({ usuario: reader.key }))}
											class="block truncate font-medium underline-offset-4 hover:underline"
											>{reader.local ? `admin local: ${reader.name}` : reader.name}</a
										>
										{#if reader.email && reader.email !== reader.name}
											<span class="block truncate text-[13px] text-ink-soft">{reader.email}</span>
										{/if}
									</td>
									<td class="py-2.5 text-right tabular-nums">{formatCount(reader.openings)}</td>
									<td class="hidden py-2.5 pl-4 text-right tabular-nums sm:table-cell"
										>{formatCount(reader.newspapers)}</td
									>
									<td class="py-2.5 pl-4 text-right whitespace-nowrap text-ink-soft tabular-nums"
										>{formatDateTime(reader.lastAt)}</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</section>
		</div>

		<section aria-labelledby="recent" class="mt-10">
			<div class="flex items-baseline justify-between gap-4 border-t-[3px] border-ink pt-2">
				<h2 id="recent" class="font-serif text-[20px] font-semibold">Últimas aperturas</h2>
				<a
					href={resolve('/admin/lecturas')}
					class="-my-2 flex min-h-11 items-center text-[14px] underline underline-offset-4"
					>Ver todas las lecturas</a
				>
			</div>
			{#if data.recent.length === 0}
				<p class="mt-3 text-[14px] text-ink-soft">
					Cuando alguien abra o descargue una edición aparecerá aquí.
				</p>
			{:else}
				<ReadingTable rows={data.recent} caption="Las 20 aperturas más recientes" />
			{/if}
		</section>
	</main>
</div>
