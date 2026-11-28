<script lang="ts">
	/** Mute or unmute the new-message drop (remembered in this browser). */
	import { setSound, sound } from '#lib/chat/sound.svelte.ts';

	let { label = false }: { /** Show the words next to the speaker. */ label?: boolean } = $props();
</script>

<button
	type="button"
	onclick={() => setSound(!sound.enabled)}
	aria-pressed={sound.enabled}
	aria-label={label ? undefined : 'Sonido de los mensajes nuevos'}
	title={sound.enabled
		? 'Silenciar los mensajes nuevos'
		: 'Activar el sonido de los mensajes nuevos'}
	class="flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-[6px] px-2 text-[14px] text-ink hover:bg-shelf"
>
	<svg
		viewBox="0 0 24 24"
		width="18"
		height="18"
		fill="none"
		stroke="currentColor"
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M4 9v6h4l5 4V5L8 9H4z" />
		{#if sound.enabled}
			<path d="M16.5 8.5a5 5 0 0 1 0 7" />
			<path d="M19 6a8.5 8.5 0 0 1 0 12" />
		{:else}
			<path d="M17 9l5 6M22 9l-5 6" />
		{/if}
	</svg>
	{#if label}
		<span>{sound.enabled ? 'Sonido activado' : 'Sonido desactivado'}</span>
	{/if}
</button>
