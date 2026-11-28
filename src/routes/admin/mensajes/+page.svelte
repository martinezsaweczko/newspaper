<script lang="ts">
	import AdminNav from '#lib/components/AdminNav.svelte';
	import ChatThread from '#lib/components/ChatThread.svelte';
	import PresenceDot from '#lib/components/PresenceDot.svelte';
	import SiteHeader from '#lib/components/SiteHeader.svelte';
	import SoundToggle from '#lib/components/SoundToggle.svelte';
	import { live, onLive } from '#lib/chat/live.svelte.ts';
	import { MAX_MESSAGE_LENGTH } from '#lib/chat/types.ts';
	import { formatMessageTime, isoFromLocalDate } from '#lib/format/date.ts';
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const today = isoFromLocalDate(new Date());
	const online = $derived(new Set(live.online));
	const keyOf = (readerId: number) => String(readerId);
	const href = (readerId: number) => resolve(`/admin/mensajes?lector=${readerId}`);

	// Any message or read receipt reloads the inbox from the server (it also marks the open
	// conversation read, so a reply arriving while it is open never shows as unread).
	$effect(() => {
		const reload = () => void invalidate('app:mensajes');
		const offMessage = onLive('message', reload);
		const offRead = onLive('read', reload);
		return () => {
			offMessage();
			offRead();
		};
	});

	let sending = $state(false);
	let textarea: HTMLTextAreaElement | undefined = $state();

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			(event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
		}
	}
</script>

<svelte:head>
	<title>Mensajes · Administración · NewsPaper</title>
</svelte:head>

<div class="mx-auto max-w-[1440px] px-4 sm:px-8">
	<SiteHeader user={data.user} skipLabel="Saltar a los mensajes" />
	<AdminNav current="mensajes" pending={data.pending} />

	<main id="main" class="pb-24">
		<div
			class="flex flex-col gap-1 border-b border-ink py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
		>
			<h1 class="font-serif text-[24px] leading-tight font-semibold sm:text-[30px]">Mensajes</h1>
			<div class="flex items-center gap-3">
				<p class="text-[14px] text-ink-soft tabular-nums" aria-live="polite">
					{live.unread === 0
						? 'Todo leído'
						: live.unread === 1
							? '1 mensaje sin leer'
							: `${live.unread} mensajes sin leer`}
				</p>
				<SoundToggle label />
			</div>
		</div>

		{#if data.missing}
			<p class="mt-4 text-[14px] text-error" role="alert">
				Esa persona no puede recibir mensajes: no existe, está bloqueada o es administradora.
			</p>
		{/if}

		<div class="mt-6 grid gap-8 lg:grid-cols-[minmax(280px,360px)_1fr]">
			<!-- Conversations (on a phone, only when none is open) -->
			<div class={['min-w-0', data.selected && 'max-lg:hidden']}>
				<form method="GET" class="flex items-end gap-2">
					<div class="flex flex-1 flex-col gap-1">
						<label for="lector" class="text-[13px] text-ink-soft">Escribir a</label>
						<select
							id="lector"
							name="lector"
							required
							class="h-11 rounded-[6px] border border-control bg-sheet px-2 text-[15px] text-ink"
						>
							<option value="">Elige un lector…</option>
							{#each data.readers as reader (reader.id)}
								<option value={reader.id} selected={reader.id === data.selected?.id}
									>{reader.name}{online.has(reader.key) ? ' · en línea' : ''}</option
								>
							{/each}
						</select>
					</div>
					<button
						type="submit"
						class="h-11 cursor-pointer rounded-[6px] border border-ink px-3 text-[14px] text-ink hover:bg-shelf"
						>Abrir</button
					>
				</form>

				<h2
					class="mt-6 flex items-baseline justify-between border-t-[3px] border-ink pt-2 font-serif text-[20px] font-semibold"
				>
					Conversaciones
					<span class="font-sans text-[14px] font-normal text-ink-soft tabular-nums"
						>{data.conversations.length}</span
					>
				</h2>
				{#if data.conversations.length === 0}
					<p class="py-4 text-[14px] text-ink-soft">
						Todavía no hay conversaciones. Cuando un lector escriba, aparecerá aquí.
					</p>
				{:else}
					<ul class="divide-y divide-hairline">
						{#each data.conversations as c (c.readerId)}
							{@const active = c.readerId === data.selected?.id}
							<li>
								<a
									href={href(c.readerId)}
									aria-current={active ? 'page' : undefined}
									class={[
										'-mx-2 flex gap-3 rounded-[6px] px-2 py-3 hover:bg-shelf',
										active && 'bg-shelf'
									]}
								>
									<span class="pt-1.5"><PresenceDot online={online.has(keyOf(c.readerId))} /></span>
									<span class="min-w-0 flex-1">
										<span class="flex items-baseline justify-between gap-2">
											<span
												class={['truncate text-[15px] text-ink', c.unread > 0 && 'font-semibold']}
												>{c.name}</span
											>
											<span class="flex-none text-[12px] text-ink-soft tabular-nums"
												>{formatMessageTime(c.last.sentAt, today)}</span
											>
										</span>
										<span class="flex items-center justify-between gap-2">
											<span class="truncate text-[13px] text-ink-soft"
												>{c.last.direction === 'out' ? 'Administración: ' : ''}{c.last.body}</span
											>
											{#if c.unread > 0}
												<span
													class="min-w-5 flex-none rounded-full bg-ink px-1.5 text-center text-[12px] leading-5 text-on-ink tabular-nums"
													>{c.unread}<span class="sr-only"> sin leer</span></span
												>
											{/if}
										</span>
										<span class="sr-only"
											>{online.has(keyOf(c.readerId)) ? 'en línea' : 'desconectado'}</span
										>
									</span>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<!-- The open conversation -->
			<section
				class={[
					'flex h-[min(680px,75dvh)] min-w-0 flex-col overflow-hidden rounded-[10px] border border-hairline bg-sheet',
					!data.selected && 'max-lg:hidden'
				]}
				aria-label={data.selected ? `Conversación con ${data.selected.name}` : 'Conversación'}
			>
				{#if data.selected}
					{@const person = data.selected}
					<header class="border-b border-hairline px-4 py-3">
						<a
							href={resolve('/admin/mensajes')}
							class="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[6px] px-2 text-[14px] text-ink hover:bg-shelf lg:hidden"
							><span aria-hidden="true">‹</span> Conversaciones</a
						>
						<h2 class="font-serif text-[20px] leading-tight font-semibold">{person.name}</h2>
						<p class="mt-0.5 flex items-center gap-2 text-[13px] text-ink-soft">
							<PresenceDot online={online.has(person.key)} />
							{online.has(person.key) ? 'En línea' : 'Desconectado'} · {person.email}
						</p>
					</header>

					<ChatThread
						messages={person.messages}
						mine="out"
						empty="Aún no os habéis escrito. El mensaje le llegará al momento si está en línea, o cuando vuelva."
					/>

					<form
						method="POST"
						action={`?lector=${person.id}&/enviar`}
						class="border-t border-hairline p-3"
						use:enhance={() => {
							sending = true;
							return async ({ result, update }) => {
								await update({ reset: result.type === 'success' });
								sending = false;
								textarea?.focus();
							};
						}}
					>
						<input type="hidden" name="lector" value={person.id} />
						<label for="texto" class="sr-only">Mensaje para {person.name}</label>
						<div class="flex items-end gap-2">
							<textarea
								id="texto"
								name="texto"
								bind:this={textarea}
								onkeydown={onKeydown}
								rows="2"
								required
								maxlength={MAX_MESSAGE_LENGTH}
								placeholder={`Escribe a ${person.name}…`}
								aria-invalid={form?.error ? 'true' : undefined}
								aria-describedby="texto-hint"
								defaultValue={typeof form?.text === 'string' ? form.text : ''}
								class="max-h-40 min-h-12 flex-1 resize-none rounded-[6px] border border-control bg-paper px-3 py-2 text-base leading-snug text-ink"
							></textarea>
							<button
								type="submit"
								disabled={sending}
								class="h-12 cursor-pointer rounded-[6px] bg-ink px-4 text-[15px] font-medium text-on-ink hover:opacity-90 disabled:cursor-progress disabled:opacity-60"
								>Enviar</button
							>
						</div>
						<p id="texto-hint" class="mt-1 min-h-4 text-[12px]" aria-live="polite">
							{#if form?.error}
								<span class="text-error">{form.error}</span>
							{:else}
								<span class="text-ink-soft"
									>Intro para enviar · Mayús+Intro para una línea nueva · todos los administradores
									ven esta conversación</span
								>
							{/if}
						</p>
					</form>
				{:else}
					<p class="m-auto max-w-[36ch] px-6 text-center text-[14px] text-ink-soft">
						Elige una conversación, o escribe a un lector desde «Escribir a».
					</p>
				{/if}
			</section>
		</div>
	</main>
</div>
