<script lang="ts">
	import AccountNotice from '#lib/components/AccountNotice.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<AccountNotice user={data.user} title="Tu acceso está bloqueado">
	<p>
		Quien gestiona este quiosco ha bloqueado la cuenta
		<span class="font-medium">{data.user?.email}</span>, así que no puedes leer los periódicos.
	</p>
	<p class="text-ink-soft">Si crees que es un error, pídele que revise tu acceso.</p>
</AccountNotice>
