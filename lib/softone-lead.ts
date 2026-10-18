import 'server-only';
import { softoneCall, softoneGetTable, SoftoneError } from '@/lib/softone';
import { nextCode } from '@/lib/next-code';

/**
 * Lead του website → SoftOne ως **υποψήφιος πελάτης**: object `CUSTOMER` με `ISPROSP=1`
 * («Υποψήφιος» στην καρτέλα πελάτη), μόνο με τις επίσημες υπηρεσίες GetTable / setData.
 *
 * • Πριν από κάθε εγγραφή ψάχνουμε πελάτη (SODTYPE 13) με το ίδιο email: αν υπάρχει, τον ΣΥΝΔΕΟΥΜΕ
 *   (LINKED) αντί να φτιάξουμε διπλότυπο — ούτε τον αλλάζουμε.
 * • CODE: ο επόμενος της αρίθμησης πελατών (0001…), όπως κάνει η εφαρμογή για τους συναλλασσόμενους.
 * • `success:true` δεν αποδεικνύει εγγραφή: διαβάζουμε πίσω το TRDR (SODTYPE=13, ISPROSP=1).
 */

export type ProspectInput = { email: string; name?: string | null; company?: string | null; phone?: string | null; profession?: string | null; note?: string | null };

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);
const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function prospectName(p: ProspectInput) {
  // Ελληνικά κεφαλαία χωρίς τόνους (ΛΙΘΟΣ, όχι ΛΊΘΟΣ), όπως οι υπόλοιπες καρτέλες του tenant.
  return clip((p.company?.trim() || p.name?.trim() || p.email).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().normalize('NFC'), 128);
}

export function buildProspectPayload(p: ProspectInput, code: string) {
  const remarks = [p.company && p.name ? `Επαφή: ${p.name}` : '', p.note ?? ''].filter(Boolean).join('\n');
  const row: Record<string, unknown> = { CODE: code, NAME: prospectName(p), ISPROSP: 1, ISACTIVE: 1, EMAIL: clip(p.email, 64) };
  if (p.phone) row.PHONE01 = clip(p.phone, 32);
  if (p.profession) row.JOBTYPETRD = clip(p.profession, 64);
  if (remarks) row.REMARKS = clip(remarks, 1000);
  return { OBJECT: 'CUSTOMER' as const, KEY: '' as const, DATA: { CUSTOMER: [row] } };
}

export async function findCustomerByEmail(email: string) {
  const rows = await softoneGetTable('TRDR', ['TRDR', 'CODE', 'ISPROSP'], `SODTYPE=13 AND EMAIL=${sqlStr(email)}`);
  const r = rows[0];
  return r ? { trdr: Number(r.TRDR), code: r.CODE, isProspect: r.ISPROSP === '1' } : null;
}

export async function nextCustomerCode() {
  const rows = await softoneGetTable('TRDR', ['CODE'], 'SODTYPE=13');
  const next = nextCode(rows.map((r) => r.CODE));
  if (!next.code) throw new SoftoneError('Δεν βρέθηκε αρίθμηση πελατών στο SoftOne για να προταθεί κωδικός');
  return next.code;
}

/** Δημιουργεί (ή βρίσκει) τον υποψήφιο. ΓΡΑΦΕΙ στο SoftOne — ο καλών ελέγχει τη ρύθμιση. */
export async function softoneCreateProspect(p: ProspectInput): Promise<{ trdr: number; code: string; linked: boolean }> {
  const existing = await findCustomerByEmail(p.email);
  if (existing) return { trdr: existing.trdr, code: existing.code, linked: true };

  const code = await nextCustomerCode();
  const res = await softoneCall<{ success?: boolean; error?: string; errorcode?: number; id?: string | number }>('setData', buildProspectPayload(p, code));
  if (res.success === false || res.id == null) throw new SoftoneError(res.error ?? `setData CUSTOMER απέτυχε (code ${res.errorcode ?? '?'})`);
  const trdr = Number(res.id);
  const back = await softoneGetTable('TRDR', ['TRDR', 'CODE', 'SODTYPE', 'ISPROSP'], `TRDR=${trdr}`);
  const row = back.find((r) => Number(r.TRDR) === trdr);
  if (!row || row.SODTYPE !== '13' || row.ISPROSP !== '1') {
    throw new SoftoneError(`Ο υποψήφιος δεν επιβεβαιώθηκε στο SoftOne (TRDR ${trdr}, SODTYPE ${row?.SODTYPE ?? '—'}, ISPROSP ${row?.ISPROSP ?? '—'})`);
  }
  return { trdr, code: row.CODE || code, linked: false };
}
