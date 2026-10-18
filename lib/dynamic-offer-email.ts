/**
 * Email δυναμικής προσφοράς (κοινό container) — HTML για όλα τα προγράμματα αλληλογραφίας:
 * πίνακες 600px, inline styles, bgcolor, χωρίς JS/CSS εξωτερικό (Gmail/Outlook/Apple Mail).
 *
 *  • `publish`: η προσφορά — 3D εικόνα φόρτωσης, κλίμακα τιμών, γέμισμα, ελάχιστη παραγγελία.
 *  • `drop`:    «η τιμή έπεσε» — νέα τιμή, πριν/μετά, πόσο λείπει για την επόμενη πτώση.
 * Καθαρές συναρτήσεις: ίδια είσοδος → ίδιο HTML (testable, προεπισκόπηση στο wizard).
 */
import { itemTiers, sortTiers, type Level, type Tier } from '@/lib/container-pricing';
import { EMAIL_COLORS, htmlToText, SANS, SERIF } from '@/lib/email/layout';

export type OfferEmailProduct = { name: string; code: string; baseUnit: string; sqmPerPallet: number; prices: number[] };
export type OfferEmailData = {
  kind: 'publish' | 'drop';
  company: { name: string; phone?: string | null; email?: string | null; address?: string | null; logoUrl?: string | null };
  recipientName?: string | null;
  title: string;
  /** Ένα ή περισσότερα προϊόντα — κοινά κλιμάκια (levels), δικές τους τιμές (prices[level-1]). */
  products: OfferEmailProduct[];
  minOrder: number;
  closesAt?: string | null; // ISO
  capacity: number;
  filled: number;
  levels: Level[];
  currentLevel: number;
  previousLevel?: number | null; // για `drop`
  snapshotUrl?: string | null;
  photoUrl?: string | null;
  ctaUrl: string;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 2 });
/** «½ παλέτα» · «1 παλέτα» · «2½ παλέτες» · «20 παλέτες». */
export function pallets(n: number): string {
  const whole = Math.floor(n + 1e-9);
  const half = Math.abs(n - whole - 0.5) < 1e-6;
  if (!half && Math.abs(n - whole) > 1e-6) return `${num(n)} παλέτες`;
  const txt = half ? (whole === 0 ? '½' : `${whole}½`) : `${whole}`;
  return `${txt} ${n <= 1 ? 'παλέτα' : 'παλέτες'}`;
}
const date = (iso: string) => new Date(iso).toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Athens' });

// Κοινή ταυτότητα με όλα τα email της εφαρμογής (lib/email/layout.ts).
const C = {
  ink: EMAIL_COLORS.ink, muted: EMAIL_COLORS.muted, line: EMAIL_COLORS.line, bg: EMAIL_COLORS.page, card: EMAIL_COLORS.card,
  brand: EMAIL_COLORS.ink, accent: EMAIL_COLORS.accent, good: EMAIL_COLORS.good, goodBg: EMAIL_COLORS.goodSoft, warn: EMAIL_COLORS.warn, warnBg: EMAIL_COLORS.warnSoft,
};
const FONT = `font-family:${SANS};`;
const SERIF_FONT = `font-family:${SERIF};`;

const tiersOf = (d: OfferEmailData, p: OfferEmailProduct): Tier[] => itemTiers(d.levels, p.prices);
const priceAt = (p: OfferEmailProduct, level: number | null | undefined) => (level ? p.prices[level - 1] ?? null : null);
const single = (d: OfferEmailData) => (d.products.length === 1 ? d.products[0] : null);
/** Μέγιστη πτώση % (από PRICEW01 στο τελευταίο κλιμάκιο) ανάμεσα στα προϊόντα. */
const maxDrop = (d: OfferEmailData) => Math.max(0, ...d.products.map((p) => {
  const t = tiersOf(d, p); return t.length > 1 && t[0].price > 0 ? Math.round((1 - t[t.length - 1].price / t[0].price) * 100) : 0;
}));

export function offerEmailSubject(d: OfferEmailData): string {
  const one = single(d);
  if (one) {
    const t = tiersOf(d, one);
    const cur = t.find((x) => x.level === d.currentLevel) ?? t[0];
    return d.kind === 'drop'
      ? `↓ Η τιμή έπεσε: ${one.name} — τώρα ${eur(cur.price)}/${one.baseUnit}`
      : `Κοινό container: ${one.name} — από ${eur(t[t.length - 1].price)}/${one.baseUnit}`;
  }
  return d.kind === 'drop'
    ? `↓ Έπεσαν οι τιμές: ${d.title} — ${d.products.length} προϊόντα`
    : `Κοινό container: ${d.title} — ${d.products.length} προϊόντα, έως −${maxDrop(d)}%`;
}

/** Μπάρα γεμίσματος (πίνακας με δύο κελιά) + σημάδια κλιμακίων από κάτω. */
function progress(d: OfferEmailData) {
  const pct = d.capacity > 0 ? Math.max(0, Math.min(100, Math.round((d.filled / d.capacity) * 100))) : 0;
  const full = pct >= 100;
  const left = Math.max(pct, 2);
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-radius:2px;overflow:hidden;background:${C.line};">
    <tr>
      <td width="${left}%" bgcolor="${C.good}" style="height:18px;background:${C.good};font-size:0;line-height:0;">&nbsp;</td>
      ${full ? '' : `<td width="${100 - left}%" style="height:18px;font-size:0;line-height:0;">&nbsp;</td>`}
    </tr>
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">
    <tr>
      <td style="${FONT}font-size:13px;color:${C.ink};"><strong>${pallets(d.filled)}</strong> από ${num(d.capacity)} · <strong>${pct}%</strong> γεμάτο</td>
      ${single(d) ? `<td align="right" style="${FONT}font-size:13px;color:${C.muted};">${num(d.filled * single(d)!.sqmPerPallet)} / ${num(d.capacity * single(d)!.sqmPerPallet)} ${esc(single(d)!.baseUnit)}</td>` : ''}
    </tr>
  </table>`;
}

/** Κλίμακα τιμών (ένα προϊόν): γραμμή ανά κλιμάκιο, το τρέχον τονισμένο, τα επόμενα «κλειδωμένα». */
function ladder(d: OfferEmailData, p: OfferEmailProduct) {
  const t = tiersOf(d, p);
  const rows = t.map((x, i) => {
    const to = t[i + 1] ? `έως ${num(t[i + 1].fromPallets - 0.5)}` : x.fromPallets >= d.capacity - 1e-9 ? '' : `έως ${num(d.capacity)}`;
    const label = !t[i + 1] && x.fromPallets >= d.capacity - 1e-9 ? 'Γεμάτο container' : pallets(x.fromPallets);
    const cur = x.level === d.currentLevel;
    const reached = x.fromPallets <= d.filled + 1e-9 || i === 0;
    const bg = cur ? C.goodBg : C.card;
    const badge = cur
      ? `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${C.good};color:#fff;font-size:11px;font-weight:700;letter-spacing:.3px;">ΙΣΧΥΕΙ ΤΩΡΑ</span>`
      : reached ? '' : `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${C.bg};color:${C.muted};font-size:11px;font-weight:600;">σε ${pallets(x.fromPallets - d.filled)}</span>`;
    return `
    <tr>
      <td bgcolor="${bg}" style="${FONT}padding:12px 14px;border-top:1px solid ${C.line};font-size:14px;color:${C.ink};">
        <strong>${label}</strong> <span style="color:${C.muted};">${to}</span>
      </td>
      <td bgcolor="${bg}" align="right" style="${FONT}padding:12px 14px;border-top:1px solid ${C.line};white-space:nowrap;">
        <span style="font-size:${cur ? 20 : 16}px;font-weight:${cur ? 800 : 600};color:${cur ? C.good : C.ink};">${eur(x.price)}</span>
        <span style="font-size:12px;color:${C.muted};">/${esc(p.baseUnit)}</span>
      </td>
      <td bgcolor="${bg}" align="right" style="${FONT}padding:12px 14px;border-top:1px solid ${C.line};">${badge}</td>
    </tr>`;
  }).join('');
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:2px;border-collapse:separate;overflow:hidden;">
    <tr>
      <td style="${FONT}padding:10px 14px;font-size:11px;font-weight:700;letter-spacing:.6px;color:${C.muted};text-transform:uppercase;">Γέμισμα container</td>
      <td align="right" style="${FONT}padding:10px 14px;font-size:11px;font-weight:700;letter-spacing:.6px;color:${C.muted};text-transform:uppercase;">Τιμή για όλους</td>
      <td></td>
    </tr>
    ${rows}
  </table>`;
}

/** Πολλά προϊόντα: κοινά κλιμάκια σε μια «ταινία» + πίνακας προϊόντων (τώρα / επόμενη / καλύτερη). */
function productsTable(d: OfferEmailData) {
  const lv = sortTiers(d.levels);
  const idx = Math.max(0, lv.findIndex((x) => x.level === d.currentLevel));
  const next = lv[idx + 1];
  const steps = lv.map((x, i) => {
    const on = i === idx; const done = i < idx;
    return `<td align="center" bgcolor="${on ? C.good : done ? C.goodBg : C.bg}" style="${FONT}padding:8px 4px;font-size:11px;font-weight:${on ? 800 : 600};color:${on ? '#fff' : done ? C.good : C.muted};border-right:2px solid #fff;">W0${x.level}<br><span style="font-weight:500;">${i === 0 ? 'αρχή' : `${num(x.fromPallets)} παλ.`}</span></td>`;
  }).join('');
  const rows = d.products.map((p) => {
    const now = priceAt(p, d.currentLevel);
    const prev = d.kind === 'drop' ? priceAt(p, d.previousLevel) : null;
    const nxt = next ? priceAt(p, next.level) : null;
    const best = p.prices[lv.length - 1] ?? null;
    return `
    <tr>
      <td style="${FONT}padding:12px 14px;border-top:1px solid ${C.line};font-size:14px;color:${C.ink};"><strong>${esc(p.name)}</strong><br><span style="font-size:12px;color:${C.muted};">${esc(p.code)} · παλέτα ${num(p.sqmPerPallet)} ${esc(p.baseUnit)}</span></td>
      <td align="right" style="${FONT}padding:12px 14px;border-top:1px solid ${C.line};white-space:nowrap;">
        ${prev && now && prev > now ? `<span style="font-size:12px;color:${C.muted};text-decoration:line-through;">${eur(prev)}</span><br>` : ''}
        <span style="font-size:17px;font-weight:800;color:${C.good};">${now != null ? eur(now) : '—'}</span><span style="font-size:11px;color:${C.muted};">/${esc(p.baseUnit)}</span>
      </td>
      <td align="right" style="${FONT}padding:12px 14px;border-top:1px solid ${C.line};font-size:13px;color:${C.ink};white-space:nowrap;">${nxt != null ? `${eur(nxt)}` : '—'}<br><span style="font-size:11px;color:${C.muted};">έως ${best != null ? eur(best) : '—'}</span></td>
    </tr>`;
  }).join('');
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-radius:2px;overflow:hidden;margin-bottom:12px;"><tr>${steps}</tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:2px;border-collapse:separate;overflow:hidden;">
    <tr>
      <td style="${FONT}padding:10px 14px;font-size:11px;font-weight:700;letter-spacing:.6px;color:${C.muted};text-transform:uppercase;">Προϊόν</td>
      <td align="right" style="${FONT}padding:10px 14px;font-size:11px;font-weight:700;letter-spacing:.6px;color:${C.muted};text-transform:uppercase;">Τιμή τώρα</td>
      <td align="right" style="${FONT}padding:10px 14px;font-size:11px;font-weight:700;letter-spacing:.6px;color:${C.muted};text-transform:uppercase;">Επόμενη</td>
    </tr>
    ${rows}
  </table>`;
}

export function offerEmailHtml(d: OfferEmailData): string {
  const one = single(d);
  const lv = sortTiers(d.levels);
  const idx = Math.max(0, lv.findIndex((x) => x.level === d.currentLevel));
  const nextLv = lv[idx + 1];
  const hello = d.recipientName ? `Καλησπέρα σας ${esc(d.recipientName)},` : 'Καλησπέρα σας,';
  const hero = d.snapshotUrl ?? d.photoUrl;
  const isDrop = d.kind === 'drop';
  const names = d.products.map((p) => `<strong>${esc(p.name)}</strong>`).join(', ');

  // Ένα προϊόν: τιμές του· πολλά: διατύπωση για «τις τιμές» όλων.
  const t = one ? tiersOf(d, one) : [];
  const cur = one ? (t[idx] ?? t[0]) : null;
  const best = one ? t[t.length - 1] : null;
  const prevPrice = one ? priceAt(one, d.previousLevel) : null;
  const headline = isDrop
    ? one ? `Η τιμή έπεσε στα <span style="color:${C.good};">${eur(cur!.price)}</span>/${esc(one.baseUnit)}` : `Οι τιμές έπεσαν — <span style="color:${C.good};">κλιμάκιο W0${d.currentLevel}</span>`
    : `Μπείτε στο κοινό container — η τιμή πέφτει όσο γεμίζει`;
  const intro = isDrop
    ? one
      ? `Το κοινό container για ${names} γέμισε κι άλλο. Η νέα τιμή ισχύει για <strong>όλους</strong> όσοι συμμετέχουν${prevPrice ? ` — από ${eur(prevPrice)} σε <strong>${eur(cur!.price)}</strong>` : ''}.`
      : `Το κοινό container (${names}) γέμισε κι άλλο: <strong>έπεσαν οι τιμές όλων των προϊόντων</strong> και ισχύουν για όλους τους συμμετέχοντες.`
    : one
      ? `Οργανώνουμε κοινή παραγγελία container για ${names}. Κάθε πελάτης κλείνει όσες παλέτες χρειάζεται (από ${pallets(d.minOrder)}) και, όσο γεμίζει το container, η τιμή πέφτει <strong>για όλους</strong> — έως <strong>${eur(best!.price)}/${esc(one.baseUnit)}</strong>.`
      : `Οργανώνουμε κοινή παραγγελία container με ${d.products.length} προϊόντα: ${names}. Κάθε πελάτης κλείνει όσες παλέτες χρειάζεται από όποιο προϊόν θέλει (από ${pallets(d.minOrder)}) και, όσο γεμίζει το container, <strong>πέφτουν οι τιμές όλων</strong> — έως −${maxDrop(d)}%.`;
  const nextBox = nextLv
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.warnBg}" style="background:${C.warnBg};border-radius:2px;">
        <tr><td style="${FONT}padding:14px 16px;font-size:14px;color:${C.ink};">
          Λείπουν <strong>${pallets(Math.max(0, nextLv.fromPallets - d.filled))}</strong> για να πέσει η τιμή${one ? ` στα <strong style="color:${C.warn};">${eur(priceAt(one, nextLv.level) ?? 0)}/${esc(one.baseUnit)}</strong>` : ' όλων των προϊόντων στο επόμενο κλιμάκιο'}. Μοιραστείτε το με συνεργάτες σας — κερδίζουν όλοι.
        </td></tr></table>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.goodBg}" style="background:${C.goodBg};border-radius:2px;">
        <tr><td style="${FONT}padding:14px 16px;font-size:14px;color:${C.good};"><strong>Πιάσαμε την καλύτερη τιμή.</strong> Ισχύει για όλους τους συμμετέχοντες.</td></tr></table>`;
  const prices = one ? ladder(d, one) : productsTable(d);
  const facts = [
    ...(one
      ? [['Προϊόν', `${esc(one.name)} <span style="color:${C.muted};">(${esc(one.code)})</span>`], ['Παλέτα', `${num(one.sqmPerPallet)} ${esc(one.baseUnit)}`]]
      : [['Προϊόντα', `${d.products.length}`], ['Container', `${num(d.capacity)} παλέτες`]]),
    ['Ελάχιστη παραγγελία', pallets(d.minOrder) + (one ? ` (${num(d.minOrder * one.sqmPerPallet)} ${esc(one.baseUnit)})` : '')],
    ...(d.closesAt ? [['Συμμετοχή έως', `<strong>${date(d.closesAt)}</strong>`]] : []),
  ].map(([k, v]) => `<tr><td style="${FONT}padding:6px 0;font-size:13px;color:${C.muted};width:42%;">${k}</td><td style="${FONT}padding:6px 0;font-size:14px;color:${C.ink};">${v}</td></tr>`).join('');
  const contact = [d.company.phone && `☎ ${esc(d.company.phone)}`, d.company.email && esc(d.company.email), d.company.address && esc(d.company.address)].filter(Boolean).join(' · ');

  return `<!doctype html>
<html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(offerEmailSubject(d))}</title></head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(offerEmailSubject(d))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="background:${C.bg};">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${C.card};border-top:3px solid ${C.accent};">
    <tr><td style="padding:26px 28px 20px;border-bottom:1px solid ${C.line};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td>
      ${d.company.logoUrl
        ? `<img src="${esc(d.company.logoUrl)}" alt="${esc(d.company.name)}" height="32" style="display:block;height:32px;border:0;">`
        : `<span style="${SERIF_FONT}font-size:17px;letter-spacing:3.5px;text-transform:uppercase;color:${C.ink};">${esc(d.company.name.trim())}</span>`}
      </td><td align="right" style="${FONT}font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${C.accent};">Κοινό container</td></tr></table>
    </td></tr>
    ${isDrop ? `<tr><td bgcolor="${C.good}" style="${FONT}background:${C.good};padding:10px 24px;font-size:13px;font-weight:700;color:#ffffff;letter-spacing:.4px;">↓ ΠΤΩΣΗ ΤΙΜΗΣ — ΚΟΙΝΟ CONTAINER</td></tr>` : ''}
    ${hero ? `<tr><td style="padding:0;"><img src="${esc(hero)}" width="600" alt="3D προβολή: παλέτες μέσα στο κοινό container" style="display:block;width:100%;height:auto;border:0;"></td></tr>` : ''}
    <tr><td style="padding:28px 28px 8px;">
      <p style="${FONT}margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.8px;color:${C.accent};text-transform:uppercase;">${esc(d.title)}</p>
      <h1 style="${SERIF_FONT}margin:0 0 14px;font-size:27px;font-weight:400;line-height:1.25;color:${C.ink};">${headline}</h1>
      <p style="${FONT}margin:0 0 6px;font-size:15px;line-height:1.6;color:${C.ink};">${hello}</p>
      <p style="${FONT}margin:0;font-size:15px;line-height:1.6;color:${C.ink};">${intro}</p>
    </td></tr>
    <tr><td style="padding:18px 28px 6px;">${progress(d)}</td></tr>
    <tr><td style="padding:14px 28px;">${nextBox}</td></tr>
    <tr><td style="padding:6px 28px 6px;">${prices}</td></tr>
    <tr><td align="center" style="padding:24px 28px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${C.accent}" style="border-radius:2px;background:${C.accent};">
        <a href="${esc(d.ctaUrl)}" style="${FONT}display:inline-block;padding:15px 30px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:2px;">${isDrop ? 'Αυξήστε την κράτησή σας' : 'Κλείστε παλέτες τώρα'}</a>
      </td></tr></table>
      <p style="${FONT}margin:10px 0 0;font-size:12px;color:${C.muted};">Απαντήστε σε αυτό το email ή καλέστε μας — κρατάμε τη θέση σας στο container.</p>
    </td></tr>
    <tr><td style="padding:18px 28px 26px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.line};">${facts}</table></td></tr>
    <tr><td bgcolor="${C.bg}" style="${FONT}background:${C.bg};padding:16px 28px;font-size:12px;line-height:1.6;color:${C.muted};">
      <span style="${SERIF_FONT}font-size:13px;letter-spacing:2px;text-transform:uppercase;color:${C.ink};">${esc(d.company.name.trim())}</span>${contact ? `<br>${contact}` : ''}<br>
      Λαμβάνετε αυτό το μήνυμα ως πελάτης ή συνεργάτης μας. Οι τιμές ισχύουν για τη συγκεκριμένη κοινή παραγγελία και διαμορφώνονται με το τελικό γέμισμα του container.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

/** Απλό κείμενο του ίδιου email (multipart/alternative). */
export const offerEmailText = (d: OfferEmailData) => htmlToText(offerEmailHtml(d));
