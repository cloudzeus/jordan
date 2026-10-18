/**
 * Κοινό σύστημα email της εφαρμογής — ΚΑΘΑΡΕΣ συναρτήσεις (χωρίς DB), για tests και προεπισκόπηση.
 *
 * Σχεδιασμός (ui-ux-pro-max: «Minimal Single Column», μαύρο μελάνι + χάλκινο accent, serif τίτλοι):
 *  • μία στήλη 600px, πίνακες + inline styles — διαβάζεται σωστά σε Gmail, Outlook (Word engine),
 *    Apple Mail και κινητά· καμία εξωτερική γραμματοσειρά/CSS, κανένα JS·
 *  • ίδια κεφαλίδα (επωνυμία), ίδια υπογραφή και ίδιο υποσέλιδο (νομική επωνυμία, ΑΦΜ, διεύθυνση,
 *    τηλέφωνα) σε ΚΑΘΕ email·
 *  • κάθε «block» δίνει HTML ΚΑΙ απλό κείμενο, ώστε κάθε email να έχει πλήρη plain-text εκδοχή.
 * Αντίθεση κειμένου ≥ 4.5:1 σε όλους τους συνδυασμούς (muted #6B655E σε λευκό ≈ 5.6:1).
 */

export type EmailBrand = {
  /** Εμπορική επωνυμία (κεφαλίδα, «Από»). */
  name: string;
  /** Νομική επωνυμία (υποσέλιδο, PDF). */
  legalName?: string | null;
  vat?: string | null;
  taxOffice?: string | null;
  address?: string | null;
  phones?: string[];
  email?: string | null;
  website?: string | null;
  /** Τραπεζικοί λογαριασμοί για πληρωμές: «Τράπεζα — IBAN». */
  bankAccounts?: { bank: string; iban: string; beneficiary?: string | null }[];
};

export type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'danger';

export const EMAIL_COLORS = {
  page: '#F4F1EC',
  card: '#FFFFFF',
  ink: '#1C1B19',
  body: '#3D3934',
  muted: '#6B655E',
  line: '#E6E0D7',
  soft: '#FAF8F5',
  accent: '#8A5A12',
  accentSoft: '#F7F0E4',
  good: '#2E6A3E',
  goodSoft: '#EDF5EF',
  warn: '#8A4A0B',
  warnSoft: '#FBF2E4',
  danger: '#9B2C2C',
  dangerSoft: '#FBEDED',
} as const;

const C = EMAIL_COLORS;
export const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
export const SERIF = "Georgia,'Times New Roman',Times,serif";
export const MONO = "'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace";

const TONE: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: C.ink, bg: C.soft },
  accent: { fg: C.accent, bg: C.accentSoft },
  good: { fg: C.good, bg: C.goodSoft },
  warn: { fg: C.warn, bg: C.warnSoft },
  danger: { fg: C.danger, bg: C.dangerSoft },
};

export const esc = (s: string | number | null | undefined) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Κείμενο από HTML (για plain-text): αλλαγές γραμμής στα block, σύνδεσμοι ως «κείμενο (url)». */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|title)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<div[^>]*display:none[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const l = label.replace(/<[^>]+>/g, '').trim();
      return l && l !== href ? `${l} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '  ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Blocks ────────────────────────────────────────────────────────────────────────────────────

export type Block = { html: string; text: string };

const row = (inner: string, pad = '0 40px 20px') => `<tr><td class="px" style="padding:${pad};">${inner}</td></tr>`;

/** Παράγραφος. `html` = ήδη ασφαλές HTML (π.χ. με <strong>)· αλλιώς δώσε `paragraph(text)`. */
export function rich(html: string): Block {
  return { html: row(`<p style="margin:0;font:400 15px/1.65 ${SANS};color:${C.body};">${html}</p>`), text: htmlToText(html) };
}
/** Κενό block (για προαιρετικά τμήματα: `cond ? x : none`). */
export const none: Block = { html: '', text: '' };
export const paragraph = (text: string): Block => (!text ? none : {
  html: row(`<p style="margin:0;font:400 15px/1.65 ${SANS};color:${C.body};white-space:pre-wrap;">${esc(text)}</p>`),
  text,
});

/** Λίστα «ετικέτα — τιμή» (στοιχεία ραντεβού, παραγγελίας…). Κενές τιμές παραλείπονται. */
export function facts(rows: [string, string | null | undefined][], opts: { title?: string } = {}): Block {
  const r = rows.filter((x): x is [string, string] => !!x[1] && x[1].trim() !== '');
  if (!r.length) return { html: '', text: '' };
  const head = opts.title ? `<tr><td colspan="2" style="padding:0 0 8px;font:700 11px/1.4 ${SANS};letter-spacing:1.2px;text-transform:uppercase;color:${C.muted};">${esc(opts.title)}</td></tr>` : '';
  const body = r.map(([k, v], i) => `<tr>
<td valign="top" style="padding:10px 16px 10px 0;${i ? `border-top:1px solid ${C.line};` : ''}font:400 13px/1.5 ${SANS};color:${C.muted};width:38%;">${esc(k)}</td>
<td valign="top" style="padding:10px 0;${i ? `border-top:1px solid ${C.line};` : ''}font:500 14px/1.5 ${SANS};color:${C.ink};white-space:pre-wrap;">${esc(v)}</td></tr>`).join('');
  return {
    html: row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${head}${body}</table>`),
    text: [opts.title ? opts.title.toUpperCase() : null, ...r.map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('\n'),
  };
}

/** Κουμπί (bulletproof: πίνακας με bgcolor — το Outlook δεν δείχνει background σε <a>). */
export function button(href: string, label: string, opts: { tone?: 'ink' | 'accent'; note?: string } = {}): Block {
  const bg = opts.tone === 'accent' ? C.accent : C.ink;
  const note = opts.note ? `<p style="margin:12px 0 0;font:400 12px/1.6 ${SANS};color:${C.muted};">${esc(opts.note)}</p>` : '';
  return {
    html: row(`<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${bg}" style="background:${bg};border-radius:2px;">
<a href="${esc(href)}" target="_blank" style="display:inline-block;padding:15px 30px;font:600 14px/1 ${SANS};letter-spacing:.6px;color:#FFFFFF;text-decoration:none;border-radius:2px;">${esc(label)}</a>
</td></tr></table>${note}`, '8px 40px 28px'),
    text: `${label}: ${href}${opts.note ? `\n${opts.note}` : ''}`,
  };
}

/** Μεγάλος κωδικός (OTP). */
export function codeBox(code: string, caption?: string): Block {
  return {
    html: row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.soft}" style="background:${C.soft};border:1px solid ${C.line};">
<tr><td align="center" style="padding:26px 12px 8px;font:600 34px/1 ${MONO};letter-spacing:12px;color:${C.ink};">${esc(code)}</td></tr>
<tr><td align="center" style="padding:6px 12px 22px;font:400 12px/1.5 ${SANS};color:${C.muted};">${esc(caption ?? '')}</td></tr></table>`),
    text: `ΚΩΔΙΚΟΣ: ${code}${caption ? `\n${caption}` : ''}`,
  };
}

/** Έγχρωμο πλαίσιο σημείωσης. */
export function callout(tone: Tone, body: string, title?: string): Block {
  const t = TONE[tone];
  return {
    html: row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${t.bg}" style="background:${t.bg};border-left:3px solid ${t.fg};">
<tr><td style="padding:14px 18px;font:400 14px/1.6 ${SANS};color:${C.ink};">${title ? `<strong style="color:${t.fg};">${esc(title)}</strong><br>` : ''}<span style="white-space:pre-wrap;">${esc(body)}</span></td></tr></table>`),
    text: [title, body].filter(Boolean).join(' — '),
  };
}

/** Ποσά-«κάρτες» (π.χ. Υπόλοιπο / Ληξιπρόθεσμο). 1–3 στοιχεία ανά σειρά. */
export function stats(items: { label: string; value: string; tone?: Tone; hint?: string }[]): Block {
  const w = Math.floor(100 / Math.max(1, items.length));
  const cells = items.map((s, i) => {
    const t = TONE[s.tone ?? 'neutral'];
    return `<td valign="top" width="${w}%" style="padding:0 ${i < items.length - 1 ? 8 : 0}px 0 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${t.bg}" style="background:${t.bg};"><tr><td style="padding:16px 16px 14px;">
<div style="font:700 10px/1.4 ${SANS};letter-spacing:1.2px;text-transform:uppercase;color:${C.muted};">${esc(s.label)}</div>
<div style="padding-top:6px;font:600 22px/1.2 ${SERIF};color:${t.fg};white-space:nowrap;">${esc(s.value)}</div>
${s.hint ? `<div style="padding-top:4px;font:400 12px/1.4 ${SANS};color:${C.muted};">${esc(s.hint)}</div>` : ''}
</td></tr></table></td>`;
  }).join('');
  return {
    html: row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`),
    text: items.map((s) => `${s.label}: ${s.value}${s.hint ? ` (${s.hint})` : ''}`).join('\n'),
  };
}

export type Col = { label: string; align?: 'left' | 'right'; nowrap?: boolean };
/** Πίνακας δεδομένων. `rows` = κείμενα (escaped εδώ)· `foot` = γραμμή συνόλων. */
export function dataTable(cols: Col[], rows: string[][], opts: { title?: string; foot?: string[]; empty?: string } = {}): Block {
  const th = cols.map((c) => `<th align="${c.align ?? 'left'}" style="padding:0 8px 8px;border-bottom:1px solid ${C.ink};font:700 10px/1.4 ${SANS};letter-spacing:1px;text-transform:uppercase;color:${C.muted};">${esc(c.label)}</th>`).join('');
  const td = (v: string, c: Col, strong = false, top = true) => `<td align="${c.align ?? 'left'}" style="padding:9px 8px;${top ? `border-top:1px solid ${C.line};` : ''}font:${strong ? 700 : 400} 13px/1.45 ${SANS};color:${C.ink};${c.nowrap || c.align === 'right' ? 'white-space:nowrap;' : ''}">${esc(v)}</td>`;
  const body = rows.length
    ? rows.map((r) => `<tr>${r.map((v, i) => td(v, cols[i])).join('')}</tr>`).join('')
    : `<tr><td colspan="${cols.length}" style="padding:14px 8px;font:400 13px/1.5 ${SANS};color:${C.muted};">${esc(opts.empty ?? '—')}</td></tr>`;
  const foot = opts.foot ? `<tr>${opts.foot.map((v, i) => `<td align="${cols[i].align ?? 'left'}" style="padding:10px 8px;border-top:1px solid ${C.ink};font:700 13px/1.45 ${SANS};color:${C.ink};white-space:nowrap;">${esc(v)}</td>`).join('')}</tr>` : '';
  const title = opts.title ? `<div style="padding:0 0 10px;font:600 17px/1.3 ${SERIF};color:${C.ink};">${esc(opts.title)}</div>` : '';
  const text = [
    opts.title ? opts.title.toUpperCase() : null,
    ...(rows.length ? rows.map((r) => r.map((v, i) => (i ? `${cols[i].label}: ${v}` : v)).join(' · ')) : [opts.empty ?? '—']),
    opts.foot ? opts.foot.filter(Boolean).join(' · ') : null,
  ].filter(Boolean).join('\n');
  return {
    html: row(`${title}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>${th}</tr>${body}${foot}</table>`),
    text,
  };
}

export const divider = (): Block => ({ html: row(`<div style="height:1px;line-height:1px;font-size:0;background:${C.line};">&nbsp;</div>`, '4px 40px 24px'), text: '—' });

/** Λευκή λίστα σημείων (π.χ. τι ακολουθεί). */
export function bullets(items: string[], title?: string): Block {
  const li = items.map((x) => `<tr><td valign="top" style="padding:4px 10px 4px 0;font:400 15px/1.6 ${SANS};color:${C.accent};">—</td><td style="padding:4px 0;font:400 15px/1.6 ${SANS};color:${C.body};">${esc(x)}</td></tr>`).join('');
  return {
    html: row(`${title ? `<div style="padding:0 0 6px;font:700 11px/1.4 ${SANS};letter-spacing:1.2px;text-transform:uppercase;color:${C.muted};">${esc(title)}</div>` : ''}<table role="presentation" cellpadding="0" cellspacing="0">${li}</table>`),
    text: [title, ...items.map((x) => `- ${x}`)].filter(Boolean).join('\n'),
  };
}

/** Ακατέργαστο HTML μέσα στο σώμα (συμβατότητα με παλιά σώματα `siteEmailHtml`). */
export const rawHtml = (html: string): Block => ({ html: html ? row(`<div style="font:400 15px/1.65 ${SANS};color:${C.body};">${html}</div>`) : '', text: htmlToText(html) });

// ── Σελίδα ───────────────────────────────────────────────────────────────────────────────────

export type EmailInput = {
  brand: EmailBrand;
  subject: string;
  /** Το κείμενο προεπισκόπησης στο inbox (κρυφό). */
  preheader?: string;
  /** Ετικέτα πάνω δεξιά στην κεφαλίδα (π.χ. «Ραντεβού»). */
  label?: string;
  /** Λωρίδα κατάστασης κάτω από την κεφαλίδα (π.χ. «ΑΚΥΡΩΘΗΚΕ»). */
  band?: { tone: Tone; text: string };
  eyebrow?: string;
  title: string;
  greeting?: string | null;
  intro?: string;
  blocks?: Block[];
  /** «Με εκτίμηση, η ομάδα…» — για email προς πελάτες. Οι εσωτερικές ειδοποιήσεις δεν το έχουν. */
  signoff?: boolean;
  /** Μικρό κείμενο πάνω από το υποσέλιδο (π.χ. «Αν δεν το ζητήσατε…»). */
  note?: string;
  /** Εσωτερική ειδοποίηση προσωπικού: λιτό υποσέλιδο. */
  internal?: boolean;
};

export type RenderedEmail = { subject: string; html: string; text: string };

export function brandContactLine(b: EmailBrand) {
  return [b.address, (b.phones ?? []).slice(0, 2).join(' · ') || null, b.email].filter(Boolean).join(' · ');
}

export function renderEmail(e: EmailInput): RenderedEmail {
  const b = e.brand;
  const blocks = (e.blocks ?? []).filter((x) => x.html || x.text);
  const legal = [b.legalName || b.name, b.vat ? `ΑΦΜ ${b.vat}` : null, b.taxOffice ? `ΔΟΥ ${b.taxOffice}` : null].filter(Boolean).join(' · ');
  const contact = brandContactLine(b);
  const site = b.website ? b.website.replace(/^https?:\/\//, '').replace(/\/$/, '') : null;

  const header = `<tr><td class="px" style="padding:30px 40px 22px;border-bottom:1px solid ${C.line};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font:400 17px/1.2 ${SERIF};letter-spacing:3.5px;text-transform:uppercase;color:${C.ink};">${esc(b.name)}</td>
${e.label ? `<td align="right" style="font:700 10px/1.2 ${SANS};letter-spacing:1.4px;text-transform:uppercase;color:${C.accent};">${esc(e.label)}</td>` : ''}
</tr></table></td></tr>`;
  const band = e.band ? `<tr><td class="px" bgcolor="${TONE[e.band.tone].bg}" style="background:${TONE[e.band.tone].bg};padding:11px 40px;font:700 11px/1.4 ${SANS};letter-spacing:1.4px;text-transform:uppercase;color:${TONE[e.band.tone].fg};">${esc(e.band.text)}</td></tr>` : '';
  const heading = `<tr><td class="px" style="padding:34px 40px 0;">
${e.eyebrow ? `<div style="padding:0 0 10px;font:700 11px/1.4 ${SANS};letter-spacing:1.4px;text-transform:uppercase;color:${C.accent};">${esc(e.eyebrow)}</div>` : ''}
<h1 class="h1" style="margin:0 0 18px;font:400 28px/1.25 ${SERIF};color:${C.ink};">${esc(e.title)}</h1>
${e.greeting ? `<p style="margin:0 0 10px;font:400 15px/1.65 ${SANS};color:${C.body};">${esc(e.greeting)}</p>` : ''}
${e.intro ? `<p style="margin:0 0 22px;font:400 15px/1.65 ${SANS};color:${C.body};">${esc(e.intro)}</p>` : '<div style="height:6px;line-height:6px;font-size:0;">&nbsp;</div>'}
</td></tr>`;
  const signoff = e.signoff ? `<tr><td class="px" style="padding:8px 40px 30px;font:400 15px/1.65 ${SANS};color:${C.body};">Με εκτίμηση,<br><span style="font:400 16px/1.6 ${SERIF};color:${C.ink};">Η ομάδα του ${esc(b.name)}</span></td></tr>` : '<tr><td style="height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr>';
  const note = e.note ? `<tr><td class="px" style="padding:0 40px 28px;font:400 12px/1.6 ${SANS};color:${C.muted};">${esc(e.note)}</td></tr>` : '';
  const footer = `<tr><td class="px" bgcolor="${C.soft}" style="background:${C.soft};border-top:1px solid ${C.line};padding:22px 40px 26px;font:400 12px/1.7 ${SANS};color:${C.muted};">
<div style="font:400 13px/1.4 ${SERIF};letter-spacing:2px;text-transform:uppercase;color:${C.ink};">${esc(b.name)}</div>
${e.internal ? '<div style="padding-top:6px;">Αυτόματη ειδοποίηση της εφαρμογής — μόνο για το προσωπικό.</div>' : `<div style="padding-top:6px;">${esc(legal)}</div>${contact ? `<div>${esc(contact)}</div>` : ''}${site ? `<div><a href="${esc(b.website!)}" style="color:${C.accent};text-decoration:none;">${esc(site)}</a></div>` : ''}`}
</td></tr>`;

  const html = `<!doctype html>
<html lang="el" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${esc(e.subject)}</title>
<style>@media (max-width:620px){.px{padding-left:22px!important;padding-right:22px!important}.h1{font-size:24px!important}}a{color:${C.accent}}</style></head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(e.preheader ?? e.intro ?? e.title)}&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.page}" style="background:${C.page};"><tr><td align="center" style="padding:28px 12px 40px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="${C.card}" style="width:100%;max-width:600px;background:${C.card};border-top:3px solid ${C.accent};">
${header}${band}${heading}
${blocks.map((x) => x.html).join('\n')}
${signoff}${note}${footer}
</table>
</td></tr></table></body></html>`;

  const text = [
    b.name.toUpperCase(),
    e.band ? `[${e.band.text}]` : null,
    '',
    e.title,
    '='.repeat(Math.min(60, e.title.length)),
    e.greeting ?? null,
    e.intro ?? null,
    '',
    ...blocks.flatMap((x) => [x.text, '']),
    e.signoff ? `Με εκτίμηση,\nΗ ομάδα του ${b.name}` : null,
    e.note ? `\n${e.note}` : null,
    '\n--',
    e.internal ? `${b.name} · αυτόματη ειδοποίηση` : [legal, contact, b.website].filter(Boolean).join('\n'),
  ].filter((x) => x !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();

  return { subject: e.subject, html, text };
}
