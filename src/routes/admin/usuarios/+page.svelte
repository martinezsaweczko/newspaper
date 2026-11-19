<script lang="ts">
	import SiteHeader from '#lib/components/SiteHeader.svelte';
	import { formatDate } from '#lib/format/date.ts';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const TABS = [
		{ view: 'pendientes', label: 'Pendientes' },
		{ view: 'aprobados', label: 'Aprobados' },
		{ view: 'bloqueados', label: 'Bloqueados' }
	] as const;

	const EMPTY: Record<(typeof TABS)[number]['view'], string> = {
		pendientes:
			'No hay solicitudes esperando. Las nuevas aparecen aquí en cuanto alguien entra con Google.',
		aprobados: 'Todavía no hay lectores aprobados.',
		bloqueados: 'No hay cuentas bloqueadas.'
	};

	type Row = (typeof data.rows)[number];
	type Action = { action: string; label: string; primary?: boolean };

	function actionsFor(row: Row): Action[] {
		const self = row.id === data.me;
		if (row.status === 'pending') {
			return [
				{ action: 'approve', label: 'Aprobar', primary: true },
				{ action: 'block', label: 'Bloquear' }
			];
		}
		if (row.status === 'blocked') return [{ action: 'unblock', label: 'Desbloquear' }];
		if (self) return [];
		return [
			row.role === 'admin'
				? { action: 'demote', label: 'Quitar admin' }
				: { action: 'promote', label: 'Hacer admin' },
			{ action: 'block', label: 'Bloquear' }
		];
	}
</script>

<svelte:head>
	<title>Usuarios · Administración · NewsPaper</title>
</svelte:head>

<div class="mx-auto max-w-[1440px] px-4 sm:px-8">
	<SiteHeader user={data.user} skipLabel="Saltar a los usuarios" />

	<main id="main" class="pb-24">
		<div
			class="flex flex-col gap-1 border-b border-ink py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
		>
			<h1 class="font-serif text-[24px] leading-tight font-semibold sm:text-[30px]">Usuarios</h1>
			<p class="text-[14px] text-ink-soft tabular-nums">
				{data.counts.pendientes === 1
					? '1 solicitud pendiente'
					: `${data.counts.pendientes} solicitudes pendientes`}
			</p>
		</div>

		<nav aria-label="Estado de las cuentas" class="mt-4 flex flex-wrap gap-1">
			{#each TABS as tab (tab.view)}
				{@const active = tab.view === data.view}
				<a
					href={resolve(`/admin/usuarios?vista=${tab.view}`)}
					aria-current={active ? 'page' : undefined}
					class={[
						'flex min-h-11 items-center gap-2 rounded-[6px] px-3 text-[14px]',
						active ? 'bg-shelf font-medium text-ink' : 'text-ink-soft hover:text-ink'
					]}
				>
					{tab.label}
					<span
						class={[
							'min-w-6 rounded-full px-1.5 text-center text-[12px] leading-5 tabular-nums',
							tab.view === 'pendientes' && data.counts.pendientes > 0
								? 'bg-ink text-on-ink'
								: 'border border-hairline text-ink-soft'
						]}
						>{data.counts[tab.view]}<span class="sr-only">
							{data.counts[tab.view] === 1 ? 'cuenta' : 'cuentas'}</span
						></span
					>
				</a>
			{/each}
		</nav>

		<div aria-live="polite" class="mt-4 min-h-6 text-[14px]">
			{#if form?.message}
				<p class="font-medium text-error">{form.message}</p>
			{:else if data.notice}
				<p class="text-ink">{data.notice}</p>
			{/if}
		</div>

		{#if data.rows.length === 0}
			<p class="mt-4 max-w-[60ch] border-t border-hairline pt-4 text-base text-ink-soft">
				{EMPTY[data.view]}
			</p>
		{:else}
			<ul class="mt-2 border-t border-ink">
				{#each data.rows as row (row.id)}
					<li
						class="grid gap-x-6 gap-y-2 border-b border-hairline py-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-center"
					>
						<div class="min-w-0">
							<p class="truncate font-serif text-[17px] font-semibold">
								{row.name}
								{#if row.role === 'admin'}
									<span class="ml-1 font-sans text-[13px] font-normal text-ink-soft"
										>· Administrador</span
									>
								{/if}
								{#if row.id === data.me}
									<span class="ml-1 font-sans text-[13px] font-normal text-ink-soft">· Tú</span>
								{/if}
							</p>
							<p class="truncate text-[14px] text-ink-soft">{row.email}</p>
						</div>
						<dl class="grid grid-cols-[auto_1fr] gap-x-3 text-[13px] text-ink-soft tabular-nums">
							<dt>Alta</dt>
							<dd class="text-ink">{formatDate(row.registered)}</dd>
							<dt>Último acceso</dt>
							<dd class="text-ink">{row.lastLogin ? formatDate(row.lastLogin) : 'Nunca'}</dd>
						</dl>
						<div class="flex flex-wrap gap-2 sm:justify-end">
							{#each actionsFor(row) as item (item.action)}
								<form method="POST" use:enhance>
									<input type="hidden" name="id" value={row.id} />
									<input type="hidden" name="vista" value={data.view} />
									<button
										type="submit"
										name="action"
										value={item.action}
										aria-label={`${item.label}: ${row.name}`}
										class={[
											'h-11 cursor-pointer rounded-[6px] px-4 text-[14px] font-medium',
											item.primary
												? 'bg-ink text-on-ink hover:opacity-90'
												: 'border border-control text-ink hover:bg-shelf'
										]}
									>
										{item.label}
									</button>
								</form>
							{/each}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</main>
</div>
