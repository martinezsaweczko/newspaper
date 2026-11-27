<script lang="ts">
	/**
	 * The reader's line to the administration: a button in the bottom-right corner (the online dot
	 * and the unread count) opening a panel with the conversation. Messages go out with a POST to
	 * /chat/messages and come in live over the shared stream (`onLive`).
	 */
	import { live, onLive } from '#lib/chat/live.svelte.ts';
	import { MAX_MESSAGE_LENGTH, type ChatMessage } from '#lib/chat/types.ts';
	import ChatThread from './ChatThread.svelte';
	import PresenceDot from './PresenceDot.svelte';
	import SoundToggle from './SoundToggle.svelte';

	let open = $state(false);
	let messages: ChatMessage[] = $state([]);
	let loaded = $state(false);
	let failed = $state(false);
	let text = $state('');
	let sending = $state(false);
	let error = $state('');
	let field: HTMLTextAreaElement | undefined = $state();
	let toggle: HTMLButtonElement | undefined = $state();

	const length = $derived([...text].length);
	const tooLong = $derived(length > MAX_MESSAGE_LENGTH);

	/** Add or replace by id: a sent message comes back both in the POST answer and on the stream. */
	function upsert(message: ChatMessage) {
		const at = messages.findIndex((m) => m.id === message.id);
		if (at === -1) messages = [...messages, message].sort((a, b) => a.id - b.id);
		else messages[at] = message;
	}

	async function load() {
		failed = false;
		try {
			const res = await fetch('/chat/messages', { headers: { accept: 'application/json' } });
			if (!res.ok) throw new Error(String(res.status));
			const data = (await res.json()) as { messages: ChatMessage[] };
			for (const m of data.messages) upsert(m);
			loaded = true;
		} catch {
			failed = true;
		}
	}

	$effect(() => {
		const offMessage = onLive('message', (m) => {
			if (loaded) upsert(m);
		});
		const offRead = onLive('read', (r) => {
			if (r.direction === 'in') messages = messages.map((m) => ({ ...m, read: true }));
		});
		return () => {
			offMessage();
			offRead();
		};
	});

	// While the panel is open, the administration's replies count as read.
	let marking = false;
	$effect(() => {
		if (!open || !loaded || live.unread === 0 || marking) return;
		marking = true;
		void fetch('/chat/read', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}'
		}).finally(() => (marking = false));
	});

	async function show() {
		open = true;
		if (!loaded) void load();
		await Promise.resolve();
		field?.focus();
	}

	function hide() {
		open = false;
		toggle?.focus();
	}

	async function send(event?: SubmitEvent) {
		event?.preventDefault();
		if (sending || tooLong || text.trim() === '') return;
		sending = true;
		error = '';
		try {
			const res = await fetch('/chat/messages', {
				method: 'POST',
				headers: { 'content-type': 'application/json', accept: 'application/json' },
				body: JSON.stringify({ text })
			});
			const data = (await res.json().catch(() => ({}))) as {
				message?: ChatMessage;
				error?: string;
			};
			if (!res.ok || !data.message) {
				error = data.error ?? 'No se ha podido enviar. Inténtalo de nuevo.';
				return;
			}
			upsert(data.message);
			text = '';
		} catch {
			error = 'Sin conexión. Inténtalo de nuevo.';
		} finally {
			sending = false;
			field?.focus();
		}
	}

	function onKeydown(event: KeyboardEvent) {
		// Enter sends, Shift+Enter is a new line (and so is Enter while composing an accent).
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			void send();
		}
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (open && e.key === 'Escape') hide();
	}}
/>

{#if open}
	<section
		id="chat-panel"
		aria-label="Mensajes con la administración"
		class="chat-panel fixed inset-x-2 bottom-2 z-30 flex h-[min(560px,80dvh)] flex-col overflow-hidden rounded-[10px] border border-hairline bg-sheet sm:inset-x-auto sm:right-6 sm:bottom-24 sm:w-[380px]"
	>
		<header class="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3">
			<div>
				<h2 class="font-serif text-[19px] leading-tight font-semibold">Administración</h2>
				<p class="mt-0.5 flex items-center gap-2 text-[13px] text-ink-soft" role="status">
					<PresenceDot online={live.admins} />
					{live.admins === null
						? 'Conectando…'
						: live.admins
							? 'En línea'
							: 'Desconectada: verá tu mensaje al volver'}
				</p>
			</div>
			<div class="-mt-1 -mr-2 flex items-center">
				<SoundToggle />
				<button
					type="button"
					onclick={hide}
					class="min-h-11 min-w-11 cursor-pointer rounded-[6px] text-[22px] leading-none text-ink hover:bg-shelf"
					aria-label="Cerrar los mensajes">×</button
				>
			</div>
		</header>

		{#if failed}
			<div class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
				<p class="text-[14px] text-ink-soft">No se han podido cargar los mensajes.</p>
				<button
					type="button"
					onclick={load}
					class="min-h-11 cursor-pointer rounded-[6px] px-3 text-[14px] text-ink underline underline-offset-4"
					>Reintentar</button
				>
			</div>
		{:else if !loaded}
			<p class="flex flex-1 items-center justify-center text-[14px] text-ink-soft">Cargando…</p>
		{:else}
			<ChatThread
				{messages}
				mine="in"
				empty="¿Tienes alguna duda sobre el quiosco? Escríbenos y te responderemos aquí."
			/>
		{/if}

		<form onsubmit={send} class="border-t border-hairline p-3">
			<label for="chat-text" class="sr-only">Tu mensaje</label>
			<div class="flex items-end gap-2">
				<textarea
					id="chat-text"
					bind:this={field}
					bind:value={text}
					onkeydown={onKeydown}
					rows="2"
					placeholder="Escribe tu mensaje…"
					aria-invalid={tooLong || error ? 'true' : undefined}
					aria-describedby="chat-hint"
					class="max-h-40 min-h-12 flex-1 resize-none rounded-[6px] border border-control bg-paper px-3 py-2 text-base leading-snug text-ink"
				></textarea>
				<button
					type="submit"
					disabled={sending || tooLong || text.trim() === ''}
					class="h-12 cursor-pointer rounded-[6px] bg-ink px-4 text-[15px] font-medium text-on-ink hover:opacity-90 disabled:cursor-default disabled:opacity-50"
					>Enviar</button
				>
			</div>
			<p id="chat-hint" class="mt-1 min-h-4 text-[12px]" aria-live="polite">
				{#if error}
					<span class="text-error">{error}</span>
				{:else if length > MAX_MESSAGE_LENGTH - 200}
					<span class={tooLong ? 'text-error' : 'text-ink-soft'}
						>{length} / {MAX_MESSAGE_LENGTH} caracteres</span
					>
				{:else}
					<span class="text-ink-soft">Intro para enviar · Mayús+Intro para una línea nueva</span>
				{/if}
			</p>
		</form>
	</section>
{/if}

<button
	type="button"
	bind:this={toggle}
	onclick={() => (open ? hide() : show())}
	aria-expanded={open}
	aria-controls="chat-panel"
	class={[
		'chat-panel fixed right-4 bottom-4 z-30 flex min-h-12 cursor-pointer items-center gap-2 rounded-full border border-control bg-sheet px-4 text-[15px] font-medium text-ink hover:bg-shelf sm:right-6 sm:bottom-6',
		open && 'max-sm:hidden'
	]}
>
	<PresenceDot online={live.admins} />
	Mensajes
	{#if live.unread > 0}
		<span
			class="min-w-5 rounded-full bg-ink px-1.5 text-center text-[12px] leading-5 text-on-ink tabular-nums"
			>{live.unread}<span class="sr-only"> sin leer</span></span
		>
	{/if}
</button>
