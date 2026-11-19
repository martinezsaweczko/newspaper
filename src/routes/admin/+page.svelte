<script lang="ts">
	import SiteHeader from '#lib/components/SiteHeader.svelte';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Administración · NewsPaper</title>
</svelte:head>

<div class="mx-auto max-w-[1440px] px-4 sm:px-8">
	<SiteHeader user={data.user} skipLabel="Saltar al contenido" />
	<main id="main" class="pb-24">
		<div class="border-b border-ink py-3">
			<h1 class="font-serif text-[24px] leading-tight font-semibold sm:text-[30px]">
				Administración
			</h1>
		</div>
		<ul class="mt-6 flex max-w-[60ch] flex-col">
			<li class="border-b border-hairline py-4">
				<a
					href={resolve('/admin/usuarios')}
					class="font-serif text-[20px] font-semibold underline-offset-4 hover:underline"
					>Usuarios</a
				>
				<p class="mt-1 text-[14px] text-ink-soft">
					Aprueba las solicitudes de acceso, bloquea cuentas y decide quién administra el quiosco.
				</p>
			</li>
		</ul>
	</main>
</div>
