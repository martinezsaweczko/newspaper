<script lang="ts">
	import AdminNav from '#lib/components/AdminNav.svelte';
	import ReadingTable from '#lib/components/ReadingTable.svelte';
	import SiteHeader from '#lib/components/SiteHeader.svelte';
	import { csvUrl, logUrl } from '#lib/admin-url.ts';
	import { formatCount, plural } from '#lib/format/count.ts';
	import { formatDate } from '#lib/format/date.ts';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const q = $derived(data.query);
	const filters = $derived({
		usuario: q.usuario,
		periodico: q.periodico,
		region: q.region,
		desde: q.desde,
		hasta: q.hasta
	});
	const filtered = $derived(Object.values(filters).some(Boolean));

	const readerName = (r: { name: string; local: boolean }) =>
		r.local ? `admin local: ${r.name}` : r.name;

	/** The filters in effect, in words, for the line under the title. */
	const summary = $derived.by(() => {
		const parts: string[] = [];
		const reader = data.options.readers.find((r) => r.key === q.usuario);
		if (q.usuario) parts.push(reader ? readerName(reader) : 'un lector sin lecturas');
		const paper = data.options.newspapers.find((n) => n.slug === q.periodico);
		if (q.periodico) parts.push(paper?.masthead ?? q.periodico);
		if (q.region) parts.push(q.region);
		if (q.desde && q.hasta) parts.push(`del ${formatDate(q.desde)} al ${formatDate(q.hasta)}`);
		else if (q.desde) parts.push(`desde el ${formatDate(q.desde)}`);
		else if (q.hasta) parts.push(`hasta el ${formatDate(q.hasta)}`);
		return parts;
	});

	const field =
		'h-10 w-full rounded-[6px] border border-control bg-sheet px-3 text-base text-ink sm:text-[14px]';
</script>

<svelte:head>
	<title>Lecturas · Administración · NewsPaper</title>
</svelte:head>

<div class="mx-auto max-w-[1440px] px-4 sm:px-8">
	<SiteHeader user={data.user} skipLabel="Saltar a las lecturas" />
	<AdminNav current="lecturas" pending={data.pending} />

	<main id="main" class="pb-24">
		<div
			class="flex flex-col gap-3 border-b border-ink py-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6"
		>
			<div class="min-w-0">
				<h1 class="font-serif text-[24px] leading-tight font-semibold sm:text-[30px]">Lecturas</h1>
				<p class="mt-1 text-[14px] text-ink-soft tabular-nums" aria-live="polite">
					<span class="text-ink">{plural(data.total, 'lectura', 'lecturas')}</span>
					{#each summary as part (part)}
						· {part}
					{/each}
				</p>
			</div>
			<a
				href={resolve(csvUrl(filters))}
				download
				class="flex h-10 flex-none items-center self-start rounded-[6px] border border-control px-4 text-[14px] font-medium hover:bg-shelf sm:self-auto"
				>Descargar CSV</a
			>
		</div>

		<form
			method="GET"
			action={resolve('/admin/lecturas')}
			class="mt-4 grid grid-cols-2 items-end gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))_8.5rem_8.5rem_auto]"
		>
			<label class="col-span-2 flex flex-col gap-1 text-[13px] text-ink-soft md:col-span-1">
				Lector
				<select name="usuario" class={field}>
					<option value="">Todos</option>
					{#each data.options.readers as reader (reader.key)}
						<option value={reader.key} selected={reader.key === q.usuario}
							>{readerName(reader)}{reader.email && reader.email !== reader.name
								? ` (${reader.email})`
								: ''}</option
						>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1 text-[13px] text-ink-soft">
				Periódico
				<select name="periodico" class={field}>
					<option value="">Todos</option>
					{#each data.options.newspapers as paper (paper.slug)}
						<option value={paper.slug} selected={paper.slug === q.periodico}
							>{paper.masthead}</option
						>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1 text-[13px] text-ink-soft">
				Región
				<select name="region" class={field}>
					<option value="">Todas</option>
					{#each data.options.regions as region (region)}
						<option value={region} selected={region === q.region}>{region}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1 text-[13px] text-ink-soft">
				Desde
				<input
					name="desde"
					class={[field, 'tabular-nums']}
					inputmode="numeric"
					autocomplete="off"
					placeholder="dd/mm/aaaa"
					value={q.desde ? formatDate(q.desde) : ''}
				/>
			</label>
			<label class="flex flex-col gap-1 text-[13px] text-ink-soft">
				Hasta
				<input
					name="hasta"
					class={[field, 'tabular-nums']}
					inputmode="numeric"
					autocomplete="off"
					placeholder="dd/mm/aaaa"
					value={q.hasta ? formatDate(q.hasta) : ''}
				/>
			</label>
			<div class="col-span-2 flex items-center gap-4 md:col-span-1">
				<button
					type="submit"
					class="h-10 cursor-pointer rounded-[6px] bg-ink px-4 text-[14px] font-medium text-on-ink hover:opacity-90"
					>Filtrar</button
				>
				{#if filtered}
					<a
						href={resolve('/admin/lecturas')}
						class="-my-2 flex min-h-11 items-center text-[14px] whitespace-nowrap underline underline-offset-4"
						>Quitar filtros</a
					>
				{/if}
			</div>
		</form>

		{#if data.rows.length === 0}
			<p class="mt-6 max-w-[60ch] border-t border-hairline pt-4 text-base text-ink-soft">
				{filtered
					? 'Ninguna lectura coincide con estos filtros.'
					: 'Todavía no hay lecturas. Cada vez que alguien abre o descarga una edición queda anotada aquí.'}
			</p>
		{:else}
			<div class="mt-6">
				<ReadingTable rows={data.rows} caption="Registro de lecturas" {filters} />
			</div>
			<nav
				aria-label="Páginas"
				class="mt-4 flex items-center justify-between gap-4 border-t border-hairline pt-3 text-[14px]"
			>
				<span class="text-ink-soft tabular-nums"
					>{formatCount(data.from)}–{formatCount(data.to)} de {formatCount(data.total)}</span
				>
				<span class="flex gap-4">
					{#if q.pagina > 1}
						<a
							href={resolve(logUrl(filters, q.pagina - 1))}
							rel="prev"
							class="-my-2 flex min-h-11 items-center underline underline-offset-4">Anteriores</a
						>
					{/if}
					{#if q.pagina < data.pages}
						<a
							href={resolve(logUrl(filters, q.pagina + 1))}
							rel="next"
							class="-my-2 flex min-h-11 items-center underline underline-offset-4">Siguientes</a
						>
					{/if}
				</span>
			</nav>
		{/if}
	</main>
</div>
