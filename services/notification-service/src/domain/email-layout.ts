/** Plantilla HTML común de todos los correos del sistema (estilos en línea para clientes de correo). */

export function escapeHtml(value: string | null | undefined) {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface EmailBody {
  heading: string;
  intro: string;
  /** Filas etiqueta → valor (se escapan). */
  details?: [string, string][];
  /** Bloques de texto con título (se escapan y respetan saltos de línea). */
  sections?: { title: string; body: string }[];
  /** Lista simple (se escapa). */
  list?: { title: string; items: string[] };
  callToAction?: { label: string; url: string };
  tone?: 'default' | 'alert';
}

const ACCENT = '#1f6f5c';
const DANGER = '#a83f3f';

export function renderEmail(body: EmailBody): { html: string; text: string } {
  const color = body.tone === 'alert' ? DANGER : ACCENT;
  const details = (body.details ?? [])
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#5b665f;font-size:14px;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:6px 0;color:#141a17;font-size:14px">${escapeHtml(v)}</td></tr>`,
    )
    .join('');
  const sections = (body.sections ?? [])
    .map(
      (s) =>
        `<h3 style="margin:20px 0 6px;font-size:14px;color:#141a17">${escapeHtml(s.title)}</h3><p style="margin:0;font-size:14px;line-height:1.5;color:#141a17;white-space:pre-line">${escapeHtml(s.body)}</p>`,
    )
    .join('');
  const list = body.list
    ? `<h3 style="margin:20px 0 6px;font-size:14px;color:#141a17">${escapeHtml(body.list.title)}</h3><ul style="margin:0;padding-left:20px;font-size:14px;color:#141a17">${body.list.items.map((i) => `<li style="margin:2px 0">${escapeHtml(i)}</li>`).join('')}</ul>`
    : '';
  const cta = body.callToAction
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(body.callToAction.url)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">${escapeHtml(body.callToAction.label)}</a></p>`
    : '';

  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f7f8f7;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8f7;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e5e1;border-radius:12px">
<tr><td style="background:${color};color:#ffffff;padding:18px 24px;border-radius:12px 12px 0 0;font-size:13px;letter-spacing:.5px">SISTEMA DECE · UNIDAD EDUCATIVA UETS</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 8px;font-size:20px;color:#141a17">${escapeHtml(body.heading)}</h1>
<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#141a17">${escapeHtml(body.intro)}</p>
${details ? `<table role="presentation" cellpadding="0" cellspacing="0">${details}</table>` : ''}
${sections}${list}${cta}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e2e5e1;font-size:12px;line-height:1.5;color:#5b665f">
Este es un correo automático enviado por el Sistema DECE de la Unidad Educativa UETS. <strong>Por favor, no responda a este mensaje</strong>: esta dirección no recibe correos.
</td></tr></table></td></tr></table></body></html>`;

  const text = [
    body.heading,
    '',
    body.intro,
    '',
    ...(body.details ?? []).map(([k, v]) => `${k}: ${v}`),
    ...(body.sections ?? []).flatMap((s) => ['', `${s.title}:`, s.body]),
    ...(body.list ? ['', `${body.list.title}:`, ...body.list.items.map((i) => `- ${i}`)] : []),
    ...(body.callToAction ? ['', `${body.callToAction.label}: ${body.callToAction.url}`] : []),
    '',
    '—',
    'Correo automático del Sistema DECE (UETS). No responda a este mensaje: esta dirección no recibe correos.',
  ].join('\n');

  return { html, text };
}
