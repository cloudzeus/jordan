import { z } from 'zod';

// Δυνητικοί πελάτες — κοινά client/server (σχήμα φόρμας, ετικέτες). Η λογική στο `lib/prospects.ts`.

const opt = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);

export const prospectInput = z.object({
  name: z.string().trim().min(2, 'Δώστε επωνυμία ή ονοματεπώνυμο').max(128),
  contactName: opt(120),
  email: z.string().trim().email('Μη έγκυρο email').max(64).nullish().or(z.literal('')).transform((v) => v || null),
  phone: opt(32),
  afm: z.string().trim().max(20).nullish().transform((v) => v?.replace(/\s/g, '') || null)
    .refine((v) => !v || /^(EL|GR)?\d{9}$/i.test(v) || /^[A-Z]{2}[0-9A-Z]{2,13}$/i.test(v), 'Ο ΑΦΜ πρέπει να έχει 9 ψηφία (ή ΑΦΜ ΕΕ με πρόθεμα χώρας)'),
  doy: opt(64),
  profession: opt(64),
  address: opt(128),
  zip: opt(10),
  city: opt(64),
  notes: opt(2000),
});
export type ProspectInput = z.infer<typeof prospectInput>;

/** Τι θα γίνει στο SoftOne με την αποδοχή: νέος πελάτης, σύνδεση με υπάρχοντα ή τίποτα (ήδη πελάτης). */
export type CustomerStep =
  | { mode: 'existing'; trdr: number; name: string }
  | { mode: 'link'; trdr: number; code: string; name: string; by: 'afm' | 'email' }
  | { mode: 'create'; code: string; name: string; fields: { label: string; value: string }[] };

export type ProjectStep = { mode: 'create'; code: string; name: string } | { mode: 'exists'; prjc: number; code: string | null } | { mode: 'skip'; reason: string };

export type AcceptPlan = {
  contractId: string; ref: string; title: string;
  /** Χρειάζεται η μετάβαση «Αποδοχή» (όχι όταν έχει ήδη γίνει και απλώς ολοκληρώνονται οι εγγραφές). */
  accept: boolean;
  customer: CustomerStep;
  project: ProjectStep;
};

/** Τα πεδία της νέας καρτέλας πελάτη όπως θα τα δει ο χρήστης πριν γραφτούν στο SoftOne. */
export function customerFields(p: { name: string; contactName: string | null; email: string | null; phone: string | null; afm: string | null; address: string | null; zip: string | null; city: string | null }) {
  return [
    ['Επωνυμία', p.name], ['ΑΦΜ', p.afm], ['Υπεύθυνος', p.contactName], ['Email', p.email], ['Τηλέφωνο', p.phone],
    ['Διεύθυνση', [p.address, p.zip, p.city].filter(Boolean).join(', ') || null],
  ].filter((x): x is [string, string] => !!x[1]).map(([label, value]) => ({ label, value }));
}

/** Ο δυνητικός πελάτης όπως εμφανίζεται σε λίστες και επιλογείς. */
export const prospectLabel = (p: { name: string; city?: string | null; email?: string | null }) => [p.name, p.city, p.email].filter(Boolean).join(' · ');
