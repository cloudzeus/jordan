/**
 * Λιτό, «δανέζικο» πρότυπο για τα email του website (κωδικοί OTP, αιτήματα πρόσβασης):
 * λευκό, μία στήλη 520px, μαύρο μελάνι, καθόλου εικόνες — διαβάζεται παντού (Outlook/Gmail/κινητό).
 */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function siteEmailHtml(opts: { brand: string; title: string; intro?: string; body?: string; code?: string; footer?: string }) {
  const brand = esc(opts.brand.trim() || 'ATELIER');
  const code = opts.code
    ? `<div style="margin:28px 0;padding:22px 0;border-top:1px solid #E7E3DD;border-bottom:1px solid #E7E3DD;text-align:center;font:500 34px/1 'SFMono-Regular',Menlo,Consolas,monospace;letter-spacing:10px;color:#1C1B19">${esc(opts.code)}</div>`
    : '';
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.title)}</title></head>
<body style="margin:0;padding:0;background:#F6F4F0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F4F0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF">
<tr><td style="padding:36px 40px 0;font:600 13px/1 Helvetica,Arial,sans-serif;letter-spacing:4px;color:#1C1B19">${brand}</td></tr>
<tr><td style="padding:32px 40px 8px;font:300 26px/1.25 Helvetica,Arial,sans-serif;color:#1C1B19">${esc(opts.title)}</td></tr>
<tr><td style="padding:8px 40px 0;font:400 15px/1.65 Helvetica,Arial,sans-serif;color:#57534E">${opts.intro ? `<p style="margin:0 0 12px">${esc(opts.intro)}</p>` : ''}${code}${opts.body ?? ''}</td></tr>
<tr><td style="padding:28px 40px 36px;font:400 12px/1.6 Helvetica,Arial,sans-serif;color:#8A847C">${esc(opts.footer ?? 'Αν δεν το ζητήσατε εσείς, αγνοήστε αυτό το μήνυμα.')}</td></tr>
</table></td></tr></table></body></html>`;
}

export { esc as escapeHtml };
