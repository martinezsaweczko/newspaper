#!/usr/bin/env node
/**
 * Generate synthetic newspaper editions (hand-written minimal PDFs, no dependencies) into a flat
 * folder, default ./newspapers. Every headline and story is invented; real masthead names are only
 * used as text so the regions mapping can be exercised.
 *
 *   node scripts/make-samples.mjs [target-dir]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const target = path.resolve(process.argv[2] ?? 'newspapers');

const W = 612;
const H = 900;

/** [filename, masthead, tagline, tone] — tone tints the photo blocks so pages differ. */
const EDITIONS = [
	['la-voz-de-galicia-2026-11-17.pdf', 'La Voz de Galicia', 'Diario independiente', 0.42],
	['faro-de-vigo-2026-11-17.pdf', 'Faro de Vigo', 'Decano de la prensa nacional', 0.55],
	['la-vanguardia-2026-11-17.pdf', 'La Vanguardia', 'Edición de Barcelona', 0.35],
	['diario de sevilla 17-11-2026.pdf', 'Diario de Sevilla', 'Sevilla y su provincia', 0.6],
	['El_Correo_20261117.pdf', 'El Correo', 'Bizkaia', 0.48],
	['heraldo_de_aragon_17_11_2026.pdf', 'Heraldo de Aragón', 'Zaragoza', 0.5],
	['gaceta-nacional-2026-11-17.pdf', 'Gaceta Nacional', 'Edición de la mañana', 0.3],
	['el-observador-2026-11-17.pdf', 'El Observador', 'Periódico de información general', 0.65],
	['la-voz-de-galicia-2026-11-16.pdf', 'La Voz de Galicia', 'Diario independiente', 0.4],
	['el-eco-de-sevilla-2026-11-16.pdf', 'El Eco de Sevilla', 'Semanario de la ciudad', 0.58],
	['gaceta-nacional-2026-11-16.pdf', 'Gaceta Nacional', 'Edición de la mañana', 0.32],
	['la-vanguardia-2026-11-15.pdf', 'La Vanguardia', 'Edición de Barcelona', 0.37]
];

const HEADLINES = [
	['El puerto amplía su muelle', 'para recibir grandes buques'],
	['La lluvia vuelve tras', 'cuarenta días de sequía'],
	['Abre el nuevo mercado', 'de abastos del centro'],
	['El tranvía llegará', 'a los barrios del norte'],
	['Récord de visitantes', 'en el museo provincial'],
	['Acuerdo para rehabilitar', 'el casco histórico']
];

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function dateOf(file) {
	const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(file);
	const compact = /(\d{4})(\d{2})(\d{2})/.exec(file);
	const dmy = /(\d{2})[-_](\d{2})[-_](\d{4})/.exec(file);
	const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : compact ? [compact[1], compact[2], compact[3]] : [dmy[3], dmy[2], dmy[1]];
	const date = new Date(Date.UTC(+y, +m - 1, +d));
	return `${DAYS[date.getUTCDay()]}, ${+d} de ${MONTHS[+m - 1]} de ${y}`;
}

/** PDF string literal in WinAnsi (latin1) with escapes. */
function str(text) {
	let out = '(';
	for (const ch of text) {
		const code = ch.charCodeAt(0);
		if (ch === '(' || ch === ')' || ch === '\\') out += '\\' + ch;
		else if (code < 32 || code > 126) out += '\\' + code.toString(8).padStart(3, '0');
		else out += ch;
	}
	return out + ')';
}

// rough average glyph widths (em) for centring with the standard 14 fonts
const width = (text, size, factor) => text.length * size * factor;

function text(font, size, x, y, value) {
	return `BT /${font} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td ${str(value)} Tj ET\n`;
}

function centred(font, size, y, value, factor) {
	return text(font, size, (W - width(value, size, factor)) / 2, y, value);
}

function rect(x, y, w, h, grey) {
	return `${grey} g ${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f\n`;
}

/** Grey bars standing in for running text. */
function column(x, top, w, lines, seed) {
	let s = '';
	for (let i = 0; i < lines; i++) {
		const short = (i + seed) % 7 === 6;
		s += rect(x, top - i * 9, short ? w * 0.55 : w, 3.2, 0.62);
	}
	return s;
}

function page([file, masthead, tagline, tone], index) {
	const [h1, h2] = HEADLINES[index % HEADLINES.length];
	const [s1, s2] = HEADLINES[(index + 2) % HEADLINES.length];
	const m = 36;
	let c = '';
	c += rect(0, 0, W, H, 0.97); // newsprint
	c += '0 g\n';
	c += centred('TB', masthead.length > 16 ? 50 : 60, H - 98, masthead, 0.5);
	c += centred('TI', 11, H - 116, tagline, 0.42);
	c += rect(m, H - 128, W - 2 * m, 2.4, 0);
	c += rect(m, H - 133, W - 2 * m, 0.6, 0);
	c += '0 g\n' + text('HV', 8.5, m, H - 146, dateOf(file));
	c += '0 g\n' + text('HV', 8.5, W - m - 92, H - 146, 'Precio: 1,80 euros');
	c += rect(m, H - 153, W - 2 * m, 0.6, 0);
	// lead story
	c += '0 g\n' + text('TB', 30, m, H - 192, h1);
	c += text('TB', 30, m, H - 224, h2);
	const photoTop = H - 244;
	const photoH = 250;
	c += rect(m, photoTop - photoH, 352, photoH, tone);
	c += rect(m + 40, photoTop - photoH, 140, photoH * 0.62, tone - 0.18);
	c += rect(m + 200, photoTop - photoH, 110, photoH * 0.4, tone - 0.1);
	c += rect(m + 250, photoTop - 70, 46, 46, Math.min(0.92, tone + 0.3));
	c += '0 g\n' + text('TI', 8, m, photoTop - photoH - 11, 'Imagen de archivo. Ilustración sintética.');
	c += column(m, photoTop - photoH - 26, 168, 22, index);
	c += column(m + 184, photoTop - photoH - 26, 168, 22, index + 3);
	// side column
	const sx = m + 368;
	const sw = W - m - sx;
	c += rect(sx - 8, 120, 0.6, photoTop - 120, 0);
	c += '0 g\n' + text('TB', 15, sx, photoTop - 12, s1);
	c += text('TB', 15, sx, photoTop - 29, s2);
	c += column(sx, photoTop - 46, sw, 16, index + 1);
	c += '0 g\n' + text('TB', 13, sx, photoTop - 205, 'Opinión');
	c += column(sx, photoTop - 222, sw, 26, index + 5);
	// bottom strip
	c += rect(m, 112, W - 2 * m, 0.6, 0);
	for (let i = 0; i < 3; i++) {
		const x = m + i * ((W - 2 * m) / 3);
		c += rect(x, 60, (W - 2 * m) / 3 - 12, 42, Math.min(0.9, tone + 0.15 * i));
	}
	c += '0 g\n' + text('HV', 7.5, m, 40, `Edición sintética de muestra · ${masthead}`);
	return c;
}

function pdf(content) {
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /TB 5 0 R /TI 6 0 R /HV 7 0 R >> >> /Contents 4 0 R >>`,
		`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}endstream`,
		'<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>',
		'<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic /Encoding /WinAnsiEncoding >>',
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
	];
	let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
	const offsets = [];
	objects.forEach((body, i) => {
		offsets.push(Buffer.byteLength(out, 'latin1'));
		out += `${i + 1} 0 obj\n${body}\nendobj\n`;
	});
	const xref = Buffer.byteLength(out, 'latin1');
	out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
	out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return Buffer.from(out, 'latin1');
}

export function makeSamplePdf(edition, index = 0) {
	return pdf(page(edition, index));
}

if (import.meta.url === `file://${process.argv[1]}`) {
	mkdirSync(target, { recursive: true });
	EDITIONS.forEach((edition, i) => writeFileSync(path.join(target, edition[0]), makeSamplePdf(edition, i)));
	console.log(`Wrote ${EDITIONS.length} synthetic editions to ${target}`);
}
