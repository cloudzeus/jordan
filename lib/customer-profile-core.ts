// lib/customer-profile-core.ts — καθαρή λογική του προφίλ πελάτη στην πύλη: τοποθεσίες και αιτήματα
// αλλαγής εταιρικών στοιχείων (που ΔΕΝ γράφονται στο SoftOne — τα περνά το προσωπικό).
import { z } from 'zod';

const opt = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);

export const siteInput = z.object({
  label: z.string().trim().min(2, 'Δώστε ένα όνομα στην τοποθεσία (π.χ. «Σπίτι Κηφισιά»)').max(80),
  address: opt(200), zip: opt(10), district: opt(80), city: opt(80), floor: opt(60), notes: opt(600),
  isDefault: z.boolean().default(false),
}).refine((s) => !!(s.address || s.city), { message: 'Συμπληρώστε τουλάχιστον διεύθυνση ή πόλη', path: ['address'] });
export type SiteInput = z.infer<typeof siteInput>;

export const contactInput = z.object({
  name: z.string().trim().min(2, 'Συμπληρώστε το ονοματεπώνυμό σας').max(120),
  role: opt(80), phone: opt(30), mobile: opt(30),
});
export type ContactInput = z.infer<typeof contactInput>;

/** Τα εταιρικά πεδία που μπορεί να ζητήσει να αλλάξουν ο πελάτης (όπως τα κρατά ο καθρέφτης του SoftOne). */
export const COMPANY_FIELDS = [
  { key: 'name', label: 'Επωνυμία' }, { key: 'afm', label: 'ΑΦΜ' }, { key: 'doy', label: 'ΔΟΥ' }, { key: 'profession', label: 'Επάγγελμα' },
  { key: 'address', label: 'Διεύθυνση έδρας' }, { key: 'zip', label: 'ΤΚ' }, { key: 'city', label: 'Πόλη' },
  { key: 'phone', label: 'Τηλέφωνο' }, { key: 'email', label: 'Email τιμολόγησης' },
] as const;
export type CompanyKey = (typeof COMPANY_FIELDS)[number]['key'];
export type CompanyData = Partial<Record<CompanyKey, string | null>>;
export type CompanyChange = { field: CompanyKey; label: string; from: string | null; to: string | null };

export const companyInput = z.object({
  values: z.record(z.string(), z.string().max(200).nullable()),
  note: opt(600),
});

const norm = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();

/** Μόνο ό,τι πραγματικά αλλάζει (αγνοεί κενά/διαστήματα). Το ΑΦΜ ελέγχεται ως 9 ψηφία. */
export function companyChanges(current: CompanyData, proposed: Record<string, string | null>): { changes: CompanyChange[]; error: string | null } {
  const changes: CompanyChange[] = [];
  for (const f of COMPANY_FIELDS) {
    if (!(f.key in proposed)) continue;
    const to = norm(proposed[f.key]);
    if (to === norm(current[f.key])) continue;
    if (f.key === 'afm' && to && !/^\d{9}$/.test(to.replace(/^EL/i, ''))) return { changes: [], error: 'Το ΑΦΜ πρέπει να έχει 9 ψηφία' };
    if (f.key === 'email' && to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { changes: [], error: 'Το email δεν είναι έγκυρο' };
    changes.push({ field: f.key, label: f.label, from: norm(current[f.key]) || null, to: to || null });
  }
  return { changes, error: changes.length ? null : 'Δεν αλλάξατε κάποιο στοιχείο' };
}

/** Μία γραμμή διεύθυνσης για εμφάνιση/αντιγραφή στην προσφορά. */
export function siteLine(s: { address?: string | null; floor?: string | null; zip?: string | null; district?: string | null; city?: string | null }): string {
  const street = [s.address, s.floor].filter(Boolean).join(', ');
  const place = [s.zip, s.district && s.district !== s.city ? s.district : null, s.city].filter(Boolean).join(' ');
  return [street, place].filter(Boolean).join(' · ');
}
