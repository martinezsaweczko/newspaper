<script lang="ts">
	import LegalPage from '#lib/components/LegalPage.svelte';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/**
	 * Keep this text in sync with what the app really stores: src/lib/server/db/schema.ts (users,
	 * reading_events), the cookies in auth/session.ts and auth/google.ts, and the observability.
	 * Bump UPDATED on every change to the text.
	 */
	const UPDATED = '2026-11-19';
	const operator = $derived(data.legal.operator ?? 'el administrador de este quiosco');
	const Operator = $derived(operator.charAt(0).toUpperCase() + operator.slice(1));
</script>

<LegalPage
	user={data.user}
	kind="privacy"
	title="Política de privacidad"
	description="Qué datos guarda este quiosco privado de periódicos, para qué, durante cuánto tiempo y cómo ejercer tus derechos."
	updated={UPDATED}
>
	<p>
		NewsPaper es un quiosco privado: una colección de periódicos en PDF que solo pueden leer las
		personas autorizadas. Esta página explica, sin letra pequeña, qué datos tuyos guarda, para qué y
		qué puedes hacer con ellos.
	</p>

	<h2>Quién es el responsable</h2>
	<p>
		{Operator} es responsable del tratamiento de tus datos.
		{#if data.legal.email}
			Para cualquier cuestión sobre ellos puedes escribir a
			<a href="mailto:{data.legal.email}">{data.legal.email}</a>.
		{:else}
			Para cualquier cuestión sobre ellos, dirígete a quien te dio acceso a este quiosco.
		{/if}
	</p>

	<h2>Qué datos guardamos</h2>
	<ul>
		<li>
			<strong>Al iniciar sesión con Google:</strong> tu nombre, tu dirección de correo, el identificador
			de tu cuenta de Google y la dirección de tu foto de perfil. Google nos dice también si tu correo
			está verificado; lo comprobamos para dejarte entrar, pero no lo guardamos.
		</li>
		<li>
			<strong>Tu cuenta en el quiosco:</strong> su estado (pendiente, aprobada o bloqueada), tu papel
			(lector o administrador), la fecha de registro, la fecha de aprobación y quién la aprobó, y la fecha
			de tu último acceso.
		</li>
		<li>
			<strong>El registro de lectura:</strong> cada vez que abres o descargas una edición anotamos cuál
			fue (el periódico, su región, la fecha de la edición y el archivo), si la abriste o la descargaste,
			y el día y la hora.
		</li>
		<li>
			<strong>Datos técnicos:</strong> los registros de funcionamiento del servidor y sus métricas no
			contienen datos personales; las métricas no distinguen entre usuarios. Las trazas de diagnóstico,
			cuando están activadas, identifican la cuenta con un número interno y no contienen tu correo ni
			tu dirección IP. Para frenar intentos repetidos en el acceso de administración, el servidor cuenta
			en memoria los intentos fallidos por dirección IP durante unos minutos, sin guardarlos.
		</li>
	</ul>

	<h2>Para qué los usamos</h2>
	<ul>
		<li>
			<strong>Darte acceso al quiosco</strong> y mantener tu sesión abierta: es lo que pides al registrarte
			(ejecución de esa relación, artículo 6.1.b del RGPD).
		</li>
		<li>
			<strong>Aprobar, bloquear o retirar cuentas</strong>, para que solo entren las personas
			autorizadas: interés legítimo del responsable en controlar el acceso (artículo 6.1.f del
			RGPD).
		</li>
		<li>
			<strong>Saber qué se lee</strong>: qué periódicos se abren, cuándo y quién los abre. Se te
			avisa antes de registrarte y es el interés legítimo del responsable en conocer el uso de su
			quiosco (artículo 6.1.f del RGPD). Puedes oponerte escribiendo a la dirección de contacto.
		</li>
	</ul>
	<p>
		No usamos tus datos para publicidad, no elaboramos perfiles comerciales y no tomamos decisiones
		automatizadas sobre ti.
	</p>

	<h2>Cuánto tiempo los conservamos</h2>
	<p>
		Los datos de tu cuenta se guardan mientras la cuenta exista. El registro de lectura se conserva
		sin límite de tiempo, por decisión del responsable, para poder consultar el historial completo
		del quiosco. Puedes pedir en cualquier momento que se borre tu cuenta o tu registro de lectura.
		Para borrar tu cuenta, el administrador la elimina del quiosco y, con ella, todo tu historial de
		lectura.
	</p>

	<h2>Con quién los compartimos</h2>
	<p>
		Con nadie. No vendemos ni cedemos tus datos a terceros. Google interviene solo como proveedor
		del inicio de sesión, con su propia política de privacidad. Los datos se guardan en el propio
		servidor del responsable, y el registro de lectura solo lo ven quienes administran el quiosco.
	</p>

	<h2>Cookies</h2>
	<p>
		Usamos solo cookies técnicas, imprescindibles para que el quiosco funcione, y por eso no te
		pedimos consentimiento para ellas:
	</p>
	<ul>
		<li>
			<strong>np_session</strong>: mantiene tu sesión iniciada durante 7 días como máximo.
		</li>
		<li>
			<strong>np_oidc</strong>: guarda durante 10 minutos el estado del inicio de sesión con Google
			y se borra al terminar.
		</li>
	</ul>
	<p>No hay cookies de analítica ni de publicidad, propias ni de terceros.</p>

	<h2>Tus derechos</h2>
	<p>
		Puedes pedir el acceso a tus datos, su rectificación o su supresión, oponerte a su tratamiento,
		pedir que se limite y recibirlos en un formato que puedas llevarte (portabilidad).
		{#if data.legal.email}
			Escribe a <a href="mailto:{data.legal.email}">{data.legal.email}</a> indicando el correo de tu cuenta.
		{:else}
			Pídelo a quien te dio acceso, indicando el correo de tu cuenta.
		{/if}
		Si crees que no se han atendido bien tus derechos, puedes reclamar ante la Agencia Española de Protección
		de Datos en <a href="https://www.aepd.es" rel="external noopener">www.aepd.es</a>.
	</p>
	<p>
		Las condiciones de uso del quiosco están en las
		<a href={resolve('/condiciones')}>Condiciones del servicio</a>.
	</p>
</LegalPage>
