<script lang="ts">
	import LegalPage from '#lib/components/LegalPage.svelte';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** Bump on every change to the text: the page announces changes by this date. */
	const UPDATED = '2026-11-19';
	const operator = $derived(data.legal.operator ?? 'el administrador de este quiosco');
</script>

<LegalPage
	user={data.user}
	kind="terms"
	title="Condiciones del servicio"
	description="Las condiciones para usar este quiosco privado de periódicos: acceso por invitación, lectura personal y sin garantías."
	updated={UPDATED}
>
	<p>
		Estas condiciones regulan el uso de NewsPaper, un quiosco privado de periódicos gestionado por
		{operator}. Al usarlo, las aceptas.
	</p>

	<h2>Un servicio privado</h2>
	<p>
		El quiosco es privado y se accede por invitación y aprobación. Registrarte con tu cuenta de
		Google solo crea una solicitud: quien administra el quiosco decide si la aprueba. Puede aprobar,
		bloquear o retirar cualquier acceso en cualquier momento.
	</p>
	<p>
		Tu acceso es personal e intransferible. No compartas tu cuenta ni dejes que otras personas lean
		a través de ella.
	</p>

	<h2>Los periódicos</h2>
	<p>
		Los periódicos y todo su contenido pertenecen a sus editores. Aquí están solo para tu lectura
		personal. No está permitido redistribuirlos, volver a publicarlos, compartirlos fuera del
		quiosco ni descargarlos de forma automatizada o masiva. Las descargas son solo para tu uso
		personal.
	</p>

	<h2>Sin garantías</h2>
	<p>
		El servicio se ofrece tal cual, sin garantía de disponibilidad ni de que siempre estén todas las
		ediciones. Puede interrumpirse, cambiar o cerrarse en cualquier momento.
	</p>

	<h2>Registro de lectura</h2>
	<p>
		El quiosco registra qué ediciones abres o descargas y cuándo, como se explica en la
		<a href={resolve('/privacidad')}>Política de privacidad</a>.
	</p>

	<h2>Ley aplicable y cambios</h2>
	<p>
		Estas condiciones se rigen por la ley española. Si cambian, los cambios se publicarán en esta
		misma página con una nueva fecha de actualización.
		{#if data.legal.email}
			Para cualquier duda, escribe a <a href="mailto:{data.legal.email}">{data.legal.email}</a>.
		{/if}
	</p>
</LegalPage>
