// Αιτήματα προσφοράς (RFP) προς συνεργεία — καθαρή λογική (χωρίς βάση/δίκτυο), κοινή για server,
// client και tests: ετικέτες, έλεγχος απάντησης, κανόνες απάντησης και κατανομή του ποσού στην ανάθεση.
import { z } from 'zod';

export const rfpRef = (n: number) => `ΑΠΡ-${String(n).padStart(6, '0')}`;

export const RFP_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Ανοιχτό', AWARDED: 'Ανατέθηκε', CLOSED: 'Έκλεισε', CANCELLED: 'Ακυρώθηκε',
};
export const RECIPIENT_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  INVITED: { label: 'Στάλθηκε', color: '#475569', bg: '#F1F5F9' },
  VIEWED: { label: 'Το είδε', color: '#1D4ED8', bg: '#EFF6FF' },
  SUBMITTED: { label: 'Έδωσε προσφορά', color: '#047857', bg: '#ECFDF5' },
  DECLINED: { label: 'Αρνήθηκε', color: '#B45309', bg: '#FFFBEB' },
  AWARDED: { label: 'Ανατέθηκε', color: '#FFFFFF', bg: '#047857' },
  NOT_AWARDED: { label: 'Δεν επιλέχθηκε', color: '#64748B', bg: '#F8FAFC' },
};
export const EVENT_LABEL: Record<string, string> = {
  INVITED: 'Δημιουργήθηκε η πρόσκληση', EMAIL_SENT: 'Στάλθηκε email', LINK_RENEWED: 'Νέος σύνδεσμος',
  OPEN: 'Άνοιξε τη σελίδα', SPECS_DOWNLOAD: 'Κατέβασε τα specs (PDF)', SUBMIT: 'Υπέβαλε προσφορά',
  DECLINE: 'Αρνήθηκε', AWARDED: 'Ανάθεση', NOT_AWARDED: 'Ενημέρωση μη επιλογής',
};

/** Όροι του αιτήματος — στο PDF και στη σελίδα απάντησης (η αποδοχή τους καταγράφεται). */
export const RFP_TERMS = [
  'Η τιμή δίνεται συνολικά για όλες τις εργασίες του παρόντος, χωρίς ΦΠΑ, και περιλαμβάνει εργασία, εργαλεία, μετακινήσεις και καθαρισμό του χώρου εργασιών.',
  'Τα υλικά που σημειώνονται «από εμάς» προμηθεύονται από την εταιρία μας· τα βοηθητικά αναλώσιμα της εργασίας βαρύνουν το συνεργείο, εκτός αν ορίζεται διαφορετικά.',
  'Οι ποσότητες και τα εμβαδά είναι από μέτρηση σε σχέδιο και επιβεβαιώνονται με αυτοψία· αποκλίσεις δηλώνονται στα σχόλια της προσφοράς.',
  'Η προσφορά ισχύει 30 ημέρες από την υποβολή. Η ανάθεση γίνεται γραπτά με σύμβαση ανάθεσης εργασιών.',
  'Η αποδοχή των όρων και η υποβολή γίνονται ηλεκτρονικά από τον μοναδικό σύνδεσμο και καταγράφονται (ημερομηνία, ώρα, IP, συσκευή) ως αποδεικτικό.',
];

/** Η απάντηση του συνεργείου: ποσό χωρίς ΦΠΑ, έναρξη, διάρκεια, σχόλια, ρητή αποδοχή όρων. */
export const bidInput = z.object({
  amount: z.coerce.number({ message: 'Δώστε ποσό' }).finite().positive('Το ποσό πρέπει να είναι μεγαλύτερο από 0').max(100_000_000),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Μη έγκυρη ημερομηνία').nullish().or(z.literal('')).transform((v) => v || null),
  durationDays: z.coerce.number().int().min(1).max(3650).nullish().or(z.literal('')).transform((v) => (v === '' || v == null ? null : v)),
  notes: z.string().trim().max(4000).nullish().transform((v) => v || null),
  termsAccepted: z.literal(true, { message: 'Πρέπει να αποδεχτείτε τους όρους' }),
});
export type BidInput = z.infer<typeof bidInput>;

/**
 * Μπορεί ακόμη να απαντήσει; Όχι αν το αίτημα έκλεισε/ανατέθηκε/ακυρώθηκε, αν πέρασε η προθεσμία
 * (τέλος της ημέρας, ώρα Ελλάδας ≈ UTC+3 — αφήνουμε όλη την ημέρα) ή αν ήδη επιλέχθηκε/απορρίφθηκε.
 * Υποβολή ξανά (διόρθωση ποσού) επιτρέπεται όσο είναι ανοιχτό.
 */
export function canRespond(rfp: { status: string; dueDate: Date | string | null }, recipientStatus: string, now = new Date()): { ok: true } | { ok: false; reason: string } {
  if (rfp.status !== 'OPEN') return { ok: false, reason: rfp.status === 'AWARDED' ? 'Το αίτημα έχει ήδη ανατεθεί.' : 'Το αίτημα δεν δέχεται πλέον προσφορές.' };
  if (recipientStatus === 'AWARDED' || recipientStatus === 'NOT_AWARDED') return { ok: false, reason: 'Το αίτημα έχει ολοκληρωθεί.' };
  if (rfp.dueDate) {
    const d = typeof rfp.dueDate === 'string' ? rfp.dueDate.slice(0, 10) : rfp.dueDate.toISOString().slice(0, 10);
    const end = new Date(`${d}T23:59:59+03:00`);
    if (now > end) return { ok: false, reason: 'Η προθεσμία για προσφορές έχει λήξει.' };
  }
  return { ok: true };
}

/**
 * Ανάθεση: το ποσό του συνεργείου μοιράζεται στις γραμμές εργασιών που αναλαμβάνει (crewFee), ανάλογα
 * με την αξία τους (qty × τιμή) — ή ισομερώς αν δεν έχουν αξία. Στρογγυλοποίηση σε λεπτά, η διαφορά
 * στη μεγαλύτερη γραμμή, ώστε το άθροισμα να είναι ακριβώς το ποσό.
 */
export function distributeAmount(lines: { id: string; weight: number }[], amount: number): Map<string, number> {
  const out = new Map<string, number>();
  if (!lines.length || !(amount > 0)) return out;
  const total = lines.reduce((s, l) => s + Math.max(0, l.weight), 0);
  const cents = Math.round(amount * 100);
  let given = 0;
  lines.forEach((l) => {
    const share = total > 0 ? Math.max(0, l.weight) / total : 1 / lines.length;
    const c = Math.floor(cents * share);
    out.set(l.id, c);
    given += c;
  });
  const biggest = lines.reduce((b, l) => (Math.max(0, l.weight) > Math.max(0, b.weight) ? l : b), lines[0]);
  out.set(biggest.id, out.get(biggest.id)! + (cents - given));
  return new Map([...out].map(([k, v]) => [k, v / 100]));
}

/** Περιοχή χωρίς ακριβή διεύθυνση (το συνεργείο δεν βλέπει πελάτη/διεύθυνση πριν από την ανάθεση). */
export const areaOnly = (s: { siteDistrict?: string | null; siteCity?: string | null; siteZip?: string | null }) =>
  [s.siteDistrict, s.siteCity].filter(Boolean).join(', ') || (s.siteZip ? `Τ.Κ. ${s.siteZip}` : null);

/**
 * Προτεινόμενος τίτλος/περιγραφή νέου αιτήματος — ΧΩΡΙΣ το όνομα του πελάτη (ο τίτλος της προσφοράς
 * συνήθως το περιέχει): είδος εργασιών + περιοχή, και η περίληψη χωρίς τη γραμμή «Προσφορά από …».
 */
export function rfpDefaults(c: { kind: string; summary: string; site?: { district?: string | null; city?: string | null } | null }) {
  const area = [c.site?.district, c.site?.city].filter(Boolean).join(', ');
  const what = c.kind === 'SUBCONTRACT' ? 'Εργασίες τοποθέτησης από συνεργείο' : 'Εργασίες τοποθέτησης';
  const scope = c.summary.split('\n').filter((l) => !/^Προσφορά (από|κάτοψης)/.test(l.trim())).join('\n').trim();
  return { title: area ? `${what} — ${area}` : what, scope };
}
