/**
 * Email δυναμικής προσφοράς (κοινό container) — HTML για όλα τα προγράμματα αλληλογραφίας:
 * πίνακες 600px, inline styles, bgcolor, χωρίς JS/CSS εξωτερικό (Gmail/Outlook/Apple Mail).
 *
 *  • `publish`: η προσφορά — 3D εικόνα φόρτωσης, κλίμακα τιμών, γέμισμα, ελάχιστη παραγγελία.
 *  • `drop`:    «η τιμή έπεσε» — νέα τιμή, πριν/μετά, πόσο λείπει για την επόμενη πτώση.
 * Καθαρές συναρτήσεις: ίδια είσοδος → ίδιο HTML (testable, προεπισκόπηση στο wizard).
 */
import { type Tier, sortTiers } from '@/lib/container-pricing';

export type OfferEmailData = {
  kind: 'publish' | 'drop';
  company: { name: string; phone?: string | null; email?: string | null; address?: string | null; logoUrl?: string | null };
  recipientName?: string | null;
  title: string;
  productName: string;
  productCode: string;
  baseUnit: string; // π.χ. «τ.μ.»
  sqmPerPallet: number;
  minOrder: number;
  closesAt?: string | null; // ISO
  capacity: number;
  filled: number;
  tiers: Tier[];
  currentLevel: number;
  previousPrice?: number | null; // για `drop`
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

const C = {
  ink: '#0f172a', muted: '#64748b', line: '#e2e8f0', bg: '#f1f5f9', card: '#ffffff',
  brand: '#0f172a', accent: '#0369a1', good: '#047857', goodBg: '#ecfdf5', warn: '#b45309', warnBg: '#fffbeb',
};
const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

export function offerEmailSubject(d: OfferEmailData): string {
  const t = sortTiers(d.tiers);
  const cur = t.find((x) => x.level === d.currentLevel) ?? t[0];
  return d.kind === 'drop'
    ? `↓ Η τιμή έπεσε: ${d.productName} — τώρα ${eur(cur.price)}/${d.baseUnit}`
    : `Κοινό container: ${d.productName} — από ${eur(t[t.length - 1].price)}/${d.baseUnit}`;
}

/** Μπάρα γεμίσματος (πίνακας με δύο κελιά) + σημάδια κλιμακίων από κάτω. */
function progress(d: OfferEmailData) {
  const pct = d.capacity > 0 ? Math.max(0, Math.min(100, Math.round((d.filled / d.capacity) * 100))) : 0;
  const full = pct >= 100;
  const left = Math.max(pct, 2);
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-radius:8px;overflow:hidden;background:${C.line};">
    <tr>
      <td width="${left}%" bgcolor="${C.good}" style="height:18px;background:${C.good};font-size:0;line-height:0;">&nbsp;</td>
      ${full ? '' : `<td width="${100 - left}%" style="height:18px;font-size:0;line-height:0;">&nbsp;</td>`}
    </tr>
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">
    <tr>
      <td style="${FONT}font-size:13px;color:${C.ink};"><strong>${pallets(d.filled)}</strong> από ${num(d.capacity)} · <strong>${pct}%</strong> γεμάτο</td>
      <td align="right" style="${FONT}font-size:13px;color:${C.muted};">${num(d.filled * d.sqmPerPallet)} / ${num(d.capacity * d.sqmPerPallet)} ${esc(d.baseUnit)}</td>
    </tr>
  </table>`;
}

/** Κλίμακα τιμών: γραμμή ανά κλιμάκιο, το τρέχον τονισμένο, τα επόμενα «κλειδωμένα». */
function ladder(d: OfferEmailData) {
  const t = sortTiers(d.tiers);
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
        <span style="font-size:12px;color:${C.muted};">/${esc(d.baseUnit)}</span>
      </td>
      <td bgcolor="${bg}" align="right" style="${FONT}padding:12px 14px;border-top:1px solid ${C.line};">${badge}</td>
    </tr>`;
  }).join('');
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:10px;border-collapse:separate;overflow:hidden;">
    <tr>
      <td style="${FONT}padding:10px 14px;font-size:11px;font-weight:700;letter-spacing:.6px;color:${C.muted};text-transform:uppercase;">Γέμισμα container</td>
      <td align="right" style="${FONT}padding:10px 14px;font-size:11px;font-weight:700;letter-spacing:.6px;color:${C.muted};text-transform:uppercase;">Τιμή για όλους</td>
      <td></td>
    </tr>
    ${rows}
  </table>`;
}

export function offerEmailHtml(d: OfferEmailData): string {
  const t = sortTiers(d.tiers);
  const cur = t.find((x) => x.level === d.currentLevel) ?? t[0];
  const idx = t.indexOf(cur);
  const next = t[idx + 1];
  const best = t[t.length - 1];
  const hello = d.recipientName ? `Καλησπέρα σας ${esc(d.recipientName)},` : 'Καλησπέρα σας,';
  const hero = d.snapshotUrl ?? d.photoUrl;
  const isDrop = d.kind === 'drop';

  const headline = isDrop
    ? `Η τιμή έπεσε στα <span style="color:${C.good};">${eur(cur.price)}</span>/${esc(d.baseUnit)}`
    : `Μπείτε στο κοινό container — η τιμή πέφτει όσο γεμίζει`;
  const intro = isDrop
    ? `Το κοινό container για <strong>${esc(d.productName)}</strong> γέμισε κι άλλο. Η νέα τιμή ισχύει για <strong>όλους</strong> όσοι συμμετέχουν${d.previousPrice ? ` — από ${eur(d.previousPrice)} σε <strong>${eur(cur.price)}</strong>` : ''}.`
    : `Οργανώνουμε κοινή παραγγελία container για <strong>${esc(d.productName)}</strong>. Κάθε πελάτης κλείνει όσες παλέτες χρειάζεται (από ${pallets(d.minOrder)}) και, όσο γεμίζει το container, η τιμή πέφτει <strong>για όλους</strong> — έως <strong>${eur(best.price)}/${esc(d.baseUnit)}</strong>.`;
  const nextBox = next
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.warnBg}" style="background:${C.warnBg};border-radius:10px;">
        <tr><td style="${FONT}padding:14px 16px;font-size:14px;color:${C.ink};">
          Λείπουν <strong>${pallets(Math.max(0, next.fromPallets - d.filled))}</strong> για να πέσει η τιμή στα
          <strong style="color:${C.warn};">${eur(next.price)}/${esc(d.baseUnit)}</strong>. Μοιραστείτε το με συνεργάτες σας — κερδίζουν όλοι.
        </td></tr></table>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.goodBg}" style="background:${C.goodBg};border-radius:10px;">
        <tr><td style="${FONT}padding:14px 16px;font-size:14px;color:${C.good};"><strong>Πιάσαμε την καλύτερη τιμή.</strong> Ισχύει για όλους τους συμμετέχοντες.</td></tr></table>`;
  const facts = [
    ['Προϊόν', `${esc(d.productName)} <span style="color:${C.muted};">(${esc(d.productCode)})</span>`],
    ['Παλέτα', `${num(d.sqmPerPallet)} ${esc(d.baseUnit)}`],
    ['Ελάχιστη παραγγελία', pallets(d.minOrder) + ` (${num(d.minOrder * d.sqmPerPallet)} ${esc(d.baseUnit)})`],
    ...(d.closesAt ? [['Συμμετοχή έως', `<strong>${date(d.closesAt)}</strong>`]] : []),
  ].map(([k, v]) => `<tr><td style="${FONT}padding:6px 0;font-size:13px;color:${C.muted};width:42%;">${k}</td><td style="${FONT}padding:6px 0;font-size:14px;color:${C.ink};">${v}</td></tr>`).join('');
  const contact = [d.company.phone && `☎ ${esc(d.company.phone)}`, d.company.email && esc(d.company.email), d.company.address && esc(d.company.address)].filter(Boolean).join(' · ');

  return `<!doctype html>
<html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(offerEmailSubject(d))}</title></head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${isDrop ? `Νέα τιμή ${eur(cur.price)}/${d.baseUnit} για ${esc(d.productName)}` : `Κοινό container ${esc(d.productName)} — η τιμή πέφτει όσο γεμίζει, έως ${eur(best.price)}`}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="background:${C.bg};">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${C.card};border-radius:14px;overflow:hidden;border:1px solid ${C.line};">
    <tr><td bgcolor="${C.brand}" style="background:${C.brand};padding:18px 24px;">
      ${d.company.logoUrl
        ? `<img src="${esc(d.company.logoUrl)}" alt="${esc(d.company.name)}" height="32" style="display:block;height:32px;border:0;">`
        : `<span style="${FONT}font-size:18px;font-weight:800;letter-spacing:.5px;color:#ffffff;">${esc(d.company.name.trim())}</span>`}
    </td></tr>
    ${isDrop ? `<tr><td bgcolor="${C.good}" style="${FONT}background:${C.good};padding:10px 24px;font-size:13px;font-weight:700;color:#ffffff;letter-spacing:.4px;">↓ ΠΤΩΣΗ ΤΙΜΗΣ — ΚΟΙΝΟ CONTAINER</td></tr>` : ''}
    ${hero ? `<tr><td style="padding:0;"><img src="${esc(hero)}" width="600" alt="3D προβολή: ${esc(d.productName)} σε παλέτες μέσα στο container" style="display:block;width:100%;height:auto;border:0;"></td></tr>` : ''}
    <tr><td style="padding:28px 28px 8px;">
      <p style="${FONT}margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.8px;color:${C.accent};text-transform:uppercase;">${esc(d.title)}</p>
      <h1 style="${FONT}margin:0 0 14px;font-size:26px;line-height:1.25;color:${C.ink};">${headline}</h1>
      <p style="${FONT}margin:0 0 6px;font-size:15px;line-height:1.6;color:${C.ink};">${hello}</p>
      <p style="${FONT}margin:0;font-size:15px;line-height:1.6;color:${C.ink};">${intro}</p>
    </td></tr>
    <tr><td style="padding:18px 28px 6px;">${progress(d)}</td></tr>
    <tr><td style="padding:14px 28px;">${nextBox}</td></tr>
    <tr><td style="padding:6px 28px 6px;">${ladder(d)}</td></tr>
    <tr><td align="center" style="padding:24px 28px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${C.accent}" style="border-radius:10px;background:${C.accent};">
        <a href="${esc(d.ctaUrl)}" style="${FONT}display:inline-block;padding:15px 30px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${isDrop ? 'Αυξήστε την κράτησή σας' : 'Κλείστε παλέτες τώρα'}</a>
      </td></tr></table>
      <p style="${FONT}margin:10px 0 0;font-size:12px;color:${C.muted};">Απαντήστε σε αυτό το email ή καλέστε μας — κρατάμε τη θέση σας στο container.</p>
    </td></tr>
    <tr><td style="padding:18px 28px 26px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.line};">${facts}</table></td></tr>
    <tr><td bgcolor="${C.bg}" style="${FONT}background:${C.bg};padding:16px 28px;font-size:12px;line-height:1.6;color:${C.muted};">
      <strong style="color:${C.ink};">${esc(d.company.name.trim())}</strong>${contact ? `<br>${contact}` : ''}<br>
      Λαμβάνετε αυτό το μήνυμα ως πελάτης ή συνεργάτης μας. Οι τιμές ισχύουν για τη συγκεκριμένη κοινή παραγγελία και διαμορφώνονται με το τελικό γέμισμα του container.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}
