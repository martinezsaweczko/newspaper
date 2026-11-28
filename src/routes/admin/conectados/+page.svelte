<script lang="ts">
	import AdminNav from '#lib/components/AdminNav.svelte';
	import PresenceDot from '#lib/components/PresenceDot.svelte';
	import SiteHeader from '#lib/components/SiteHeader.svelte';
	import { live } from '#lib/chat/live.svelte.ts';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const known = $derived(live.admins !== null);
	const online = $derived(new Set(live.online));
	const byName = (a: { name: string }, b: { name: string }) =>
		a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
	const groups = $derived([
		{
			id: 'online',
			title: 'En línea',
			empty: 'No hay nadie conectado ahora mismo.',
			people: data.people.filter((p) => online.has(p.key)).sort(byName)
		},
		{
			id: 'offline',
			title: 'Desconectados',
			empty: 'Todos los lectores están conectados.',
			people: data.people.filter((p) => !online.has(p.key)).sort(byName)
		}
	]);
</script>

<svelte:head>
	<title>Conectados · Administración · NewsPaper</title>
</svelte:head>

<div class="mx-auto max-w-[1440px] px-4 sm:px-8">
	<SiteHeader user={data.user} skipLabel="Saltar a los conectados" />
	<AdminNav current="conectados" pending={data.pending} />

	<main id="main" class="pb-24">
		<div
			class="flex flex-col gap-1 border-b border-ink py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
		>
			<h1 class="font-serif text-[24px] leading-tight font-semibold sm:text-[30px]">Conectados</h1>
			<p class="text-[14px] text-ink-soft tabular-nums" aria-live="polite">
				{#if !known}
					Comprobando quién está conectado…
				{:else}
					{groups[0].people.length === 1
						? '1 persona en línea'
						: `${groups[0].people.length} personas en línea`}
				{/if}
			</p>
		</div>

		{#if known}
			{#each groups as group (group.id)}
				<section class="mt-8" aria-labelledby={`grupo-${group.id}`}>
					<h2
						id={`grupo-${group.id}`}
						class="flex items-baseline justify-between border-t-[3px] border-ink pt-2 font-serif text-[20px] font-semibold"
					>
						{group.title}
						<span class="font-sans text-[14px] font-normal text-ink-soft tabular-nums"
							>{group.people.length}</span
						>
					</h2>
					{#if group.people.length === 0}
						<p class="py-4 text-[14px] text-ink-soft">{group.empty}</p>
					{:else}
						<ul class="divide-y divide-hairline">
							{#each group.people as person (person.key)}
								<li class="flex min-h-14 items-center gap-3 py-2">
									<PresenceDot online={group.id === 'online'} size="md" />
									<div class="min-w-0 flex-1">
										<p class="truncate text-[15px] text-ink">
											{person.name}
											{#if person.key === data.me}<span class="text-ink-soft"> (tú)</span>{/if}
										</p>
										<p class="truncate text-[13px] text-ink-soft">
											{person.email ?? 'Administrador local'}
										</p>
									</div>
									{#if person.admin}
										<span
											class="flex-none rounded-full border border-hairline px-2 text-[12px] leading-5 text-ink-soft"
											>Admin</span
										>
									{:else}
										<a
											href={resolve(`/admin/mensajes?lector=${person.key}`)}
											class="flex min-h-11 flex-none items-center rounded-[6px] px-2 text-[14px] text-ink underline-offset-4 hover:underline"
											aria-label={`Escribir a ${person.name}`}>Escribir</a
										>
									{/if}
									<span class="sr-only">{group.id === 'online' ? 'en línea' : 'desconectado'}</span>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/each}
		{/if}
		<p class="mt-8 max-w-[68ch] text-[13px] text-ink-soft">
			Se actualiza solo. Una persona aparece en línea mientras tiene el quiosco abierto en alguna
			pestaña, y hasta 30 segundos después de cerrarla. No se guarda ningún historial de conexiones.
		</p>
	</main>
</div>
