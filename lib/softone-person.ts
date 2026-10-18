import 'server-only';
import { softoneCall, softoneGetData, softoneGetTable, SoftoneError } from '@/lib/softone';
import { nextCode } from '@/lib/next-code';

/**
 * Επαφή συναλλασσομένου στο SoftOne = «Πρόσωπο» εξωτερικό (object PRSNOUT, πίνακας PRSN, SODTYPE 21)
 * συνδεδεμένο με τον συναλλασσόμενο μέσω της γραμμής TRDPRSNOUT (στη βάση: TRDPRSN).
 *
 * • ΝΕΟ πρόσωπο: ένα INSERT με το PRSNOUT ΚΑΙ τη γραμμή TRDPRSNOUT — δεν αγγίζει καμία υπάρχουσα
 *   καρτέλα (π.χ. τις γραμμές CUSPRSN του πελάτη).
 * • Υπάρχει ήδη πρόσωπο με το ίδιο email: δεν φτιάχνουμε διπλότυπο. Αν δεν είναι συνδεδεμένο με τον
 *   συναλλασσόμενο, διαβάζουμε ΟΛΕΣ τις γραμμές TRDPRSNOUT και τις ξαναστέλνουμε με τα LINENUM τους
 *   (γραμμή που λείπει από το setData ΔΙΑΓΡΑΦΕΤΑΙ) + τη νέα.
 * • Πάντα read-back από τον πίνακα σύνδεσης TRDPRSN.
 */

export type PersonInput = { trdr: number; firstName: string; lastName: string; email?: string | null; phone?: string | null; mobile?: string | null; role?: string | null };

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);
const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;
const NEW_LINE = 9000001;

export function buildPersonPayload(p: PersonInput, code: string) {
  const row: Record<string, unknown> = { CODE: code, NAME: clip(p.firstName.trim(), 64), NAME2: clip(p.lastName.trim(), 64), TPRSN: 1, ISACTIVE: 1 };
  if (p.email) row.EMAIL = clip(p.email, 64);
  if (p.phone) row.PHONE1 = clip(p.phone, 32);
  if (p.mobile) row.MOBILEPHONE = clip(p.mobile, 32);
  if (p.role) row.REMARKS = clip(`Ιδιότητα: ${p.role}`, 500);
  return { OBJECT: 'PRSNOUT' as const, KEY: '' as const, DATA: { PRSNOUT: [row], TRDPRSNOUT: [{ LINENUM: NEW_LINE, TRDR: p.trdr, ISACTIVE: 1 }] } };
}

export async function nextPersonCode() {
  const rows = await softoneGetTable('PRSN', ['CODE'], 'SODTYPE=21');
  const next = nextCode(rows.map((r) => r.CODE));
  if (!next.code) throw new SoftoneError('Δεν βρέθηκε αρίθμηση προσώπων στο SoftOne για να προταθεί κωδικός');
  return next.code;
}

async function linked(trdr: number, prsn: number) {
  const rows = await softoneGetTable('TRDPRSN', ['TRDR', 'PRSN'], `TRDR=${trdr} AND PRSN=${prsn}`);
  return rows.some((r) => Number(r.TRDR) === trdr && Number(r.PRSN) === prsn);
}

/** Συνδέει υπάρχον πρόσωπο με συναλλασσόμενο, κρατώντας ΟΛΕΣ τις υπάρχουσες γραμμές. ΓΡΑΦΕΙ στο SoftOne. */
export async function softoneLinkPerson(prsn: number, trdr: number) {
  const d = await softoneGetData('PRSNOUT', prsn, 'TRDPRSNOUT:LINENUM,TRDR,ISACTIVE');
  const lines = (d.TRDPRSNOUT ?? []).map((l) => ({ LINENUM: Number(l.LINENUM), TRDR: Number(String(l.TRDR).split('|')[0]), ISACTIVE: Number(l.ISACTIVE ?? 1) }));
  if (lines.some((l) => l.TRDR === trdr)) return;
  const res = await softoneCall<{ success?: boolean; error?: string; errorcode?: number }>('setData', {
    OBJECT: 'PRSNOUT', KEY: String(prsn), DATA: { TRDPRSNOUT: [...lines, { LINENUM: NEW_LINE, TRDR: trdr, ISACTIVE: 1 }] },
  });
  if (res.success === false) throw new SoftoneError(res.error ?? `setData PRSNOUT ${prsn} απέτυχε (code ${res.errorcode ?? '?'})`);
  if (!(await linked(trdr, prsn))) throw new SoftoneError(`Η σύνδεση του προσώπου ${prsn} με τον συναλλασσόμενο ${trdr} δεν επιβεβαιώθηκε`);
}

/** Νέα επαφή του συναλλασσομένου (ή σύνδεση υπάρχοντος προσώπου με το ίδιο email). ΓΡΑΦΕΙ στο SoftOne. */
export async function softoneCreatePerson(p: PersonInput): Promise<{ prsn: number; code: string; linked: boolean }> {
  if (!p.firstName.trim() || !p.lastName.trim()) throw new SoftoneError('Χρειάζονται όνομα και επώνυμο για την επαφή');
  if (p.email) {
    const found = (await softoneGetTable('PRSN', ['PRSN', 'CODE'], `SODTYPE=21 AND EMAIL=${sqlStr(p.email)}`))[0];
    if (found) {
      await softoneLinkPerson(Number(found.PRSN), p.trdr);
      return { prsn: Number(found.PRSN), code: found.CODE, linked: true };
    }
  }
  const code = await nextPersonCode();
  const res = await softoneCall<{ success?: boolean; error?: string; errorcode?: number; id?: string | number }>('setData', buildPersonPayload(p, code));
  if (res.success === false || res.id == null) throw new SoftoneError(res.error ?? `setData PRSNOUT απέτυχε (code ${res.errorcode ?? '?'})`);
  const prsn = Number(res.id);
  if (!(await linked(p.trdr, prsn))) throw new SoftoneError(`Η επαφή δεν επιβεβαιώθηκε στο SoftOne (PRSN ${prsn} ↔ TRDR ${p.trdr})`);
  return { prsn, code, linked: false };
}
