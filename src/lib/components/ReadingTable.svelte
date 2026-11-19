<script lang="ts">
	/**
	 * Rows of the reading log. A reader or a newspaper links to the log filtered by it (keeping the
	 * filters already in effect). On phones each row folds into two lines.
	 */
	import { logUrl, type LogFilters } from '#lib/admin-url.ts';
	import { formatDate, formatDateTime } from '#lib/format/date.ts';
	import { resolve } from '$app/paths';

	interface Row {
		id: number;
		at: string;
		reader: { key: string; name: string; email: string | null; local: boolean };
		masthead: string;
		slug: string;
		region: string;
		editionDate: string;
		kind: 'open' | 'download';
	}

	let {
		rows,
		caption,
		filters = {}
	}: { rows: Row[]; caption: string; filters?: LogFilters } = $props();

	const KIND = { open: 'Abierto', download: 'Descargado' } as const;
	const readerName = (r: Row['reader']) => (r.local ? `admin local: ${r.name}` : r.name);
</script>

<table class="mt-2 w-full text-[14px]">
	<caption class="sr-only">{caption}</caption>
	<thead>
		<tr class="text-left text-[13px] text-ink-soft">
			<th scope="col" class="py-2 pr-4 font-normal whitespace-nowrap">Fecha y hora</th>
			<th scope="col" class="py-2 pr-4 font-normal">Lector</th>
			<th scope="col" class="hidden py-2 pr-4 font-normal md:table-cell">Periódico</th>
			<th scope="col" class="hidden py-2 pr-4 font-normal lg:table-cell">Región</th>
			<th scope="col" class="hidden py-2 pr-4 text-right font-normal md:table-cell">Edición</th>
			<th scope="col" class="hidden py-2 font-normal md:table-cell">Tipo</th>
		</tr>
	</thead>
	<tbody>
		{#each rows as row (row.id)}
			<tr class="border-t border-hairline align-top">
				<td class="py-2.5 pr-4 whitespace-nowrap text-ink-soft tabular-nums"
					>{formatDateTime(row.at)}</td
				>
				<td class="w-full max-w-0 py-2.5 pr-4 md:w-[30%]">
					<a
						href={resolve(logUrl({ ...filters, usuario: row.reader.key }))}
						class="block truncate font-medium underline-offset-4 hover:underline"
						>{readerName(row.reader)}</a
					>
					{#if row.reader.email && row.reader.email !== row.reader.name}
						<span class="block truncate text-[13px] text-ink-soft">{row.reader.email}</span>
					{/if}
					<!-- phones: the newspaper and the kind under the reader -->
					<span class="block truncate text-[13px] text-ink-soft md:hidden">
						<a
							href={resolve(logUrl({ ...filters, periodico: row.slug }))}
							class="text-ink underline-offset-4 hover:underline">{row.masthead}</a
						>
						· {formatDate(row.editionDate)}{row.kind === 'download' ? ' · Descargado' : ''}
					</span>
				</td>
				<td class="hidden max-w-0 py-2.5 pr-4 md:table-cell">
					<a
						href={resolve(logUrl({ ...filters, periodico: row.slug }))}
						class="block truncate font-serif text-[16px] font-semibold underline-offset-4 hover:underline"
						>{row.masthead}</a
					>
				</td>
				<td class="hidden py-2.5 pr-4 text-ink-soft lg:table-cell">{row.region}</td>
				<td class="hidden py-2.5 pr-4 text-right whitespace-nowrap tabular-nums md:table-cell"
					>{formatDate(row.editionDate)}</td
				>
				<td class="hidden py-2.5 whitespace-nowrap md:table-cell">
					<span class={row.kind === 'download' ? 'text-ink' : 'text-ink-soft'}
						>{KIND[row.kind]}</span
					>
				</td>
			</tr>
		{/each}
	</tbody>
</table>
