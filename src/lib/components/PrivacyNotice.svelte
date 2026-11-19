<script lang="ts">
	import { resolve } from '$app/paths';
	/** The reading-log notice shown on /login and /pendiente. Small print, never hidden. */
	let { class: className = '' }: { class?: string } = $props();
</script>

<p class={['text-[13px] leading-relaxed text-ink-soft', className]}>
	<span class="font-medium text-ink">Aviso de privacidad.</span> Este quiosco registra tu actividad
	de lectura (qué periódicos abres y cuándo) y la conserva. Solo la ven quienes lo administran. Más
	detalles en la
	<a href={resolve('/privacidad')} class="text-ink underline underline-offset-4"
		>Política de privacidad</a
	>.
</p>
