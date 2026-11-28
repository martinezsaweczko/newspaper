<script lang="ts">
	/**
	 * The messages of one conversation as bubbles: mine on the right in ink, theirs on the left on
	 * the shelf tone, the author over the first of a run, the time under each, and "Visto" under my
	 * last message once the other side read it. Keeps the newest in view.
	 */
	import type { ChatMessage } from '#lib/chat/types.ts';
	import { formatMessageTime, isoFromLocalDate } from '#lib/format/date.ts';
	import { tick } from 'svelte';

	let {
		messages,
		mine,
		empty
	}: {
		messages: ChatMessage[];
		/** Which direction is the viewer's own: `in` for the reader, `out` for an admin. */
		mine: 'in' | 'out';
		empty: string;
	} = $props();

	const today = isoFromLocalDate(new Date());
	let list: HTMLElement | undefined = $state();
	const lastMine = $derived(messages.findLastIndex((m) => m.direction === mine));

	// Keep the newest message in view whenever one arrives.
	$effect(() => {
		void messages.length;
		void tick().then(() => list?.scrollTo({ top: list.scrollHeight }));
	});
</script>

<div bind:this={list} class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
	{#if messages.length === 0}
		<p class="py-6 text-center text-[14px] text-ink-soft">{empty}</p>
	{:else}
		<ol class="flex flex-col gap-1" aria-label="Mensajes">
			{#each messages as message, i (message.id)}
				{@const own = message.direction === mine}
				{@const first = i === 0 || messages[i - 1].sender !== message.sender}
				<li class={['flex flex-col', own ? 'items-end' : 'items-start', first && i > 0 && 'mt-3']}>
					{#if first}
						<p class="mb-0.5 px-1 text-[12px] text-ink-soft">{own ? 'Tú' : message.sender}</p>
					{/if}
					<p
						class={[
							'max-w-[85%] rounded-[10px] px-3 py-2 text-[15px] leading-snug break-words whitespace-pre-wrap',
							own ? 'bg-ink text-on-ink' : 'bg-shelf text-ink'
						]}
					>
						{message.body}
					</p>
					<p class="px-1 pt-0.5 text-[11px] text-ink-soft tabular-nums">
						<span class="sr-only">{own ? 'Enviado' : 'Recibido'}</span>
						{formatMessageTime(message.sentAt, today)}
						{#if own && i === lastMine && message.read}· Visto{/if}
					</p>
				</li>
			{/each}
		</ol>
	{/if}
</div>
