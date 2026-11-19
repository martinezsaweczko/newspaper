<script lang="ts">
	import AccountNotice from '#lib/components/AccountNotice.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<AccountNotice user={data.user} title="Tu solicitud está pendiente de aprobación" recheck>
	<p>
		Has entrado con Google como <span class="font-medium">{data.user?.email}</span>. Quien gestiona
		este quiosco tiene que aprobar tu acceso antes de que puedas leer los periódicos.
	</p>
	<p class="text-ink-soft">No hace falta que hagas nada más: vuelve a entrar más tarde.</p>
</AccountNotice>
