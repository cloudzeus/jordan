import { z } from 'zod';

/**
 * Αιτήματα παραγγελίας του B2B portal — ΚΑΘΑΡΗ λογική (χωρίς DB), ώστε να ελέγχεται με tests:
 * επικύρωση εισόδου, επιτρεπτές μεταβάσεις κατάστασης, ετικέτες.
 */

export const ORDER_REQUEST_STATUSES = ['SUBMITTED', 'IN_REVIEW', 'CONFIRMED', 'REJECTED', 'CANCELLED'] as const;
export type OrderRequestStatus = (typeof ORDER_REQUEST_STATUSES)[number];

export const ORDER_REQUEST_LABEL: Record<OrderRequestStatus, string> = {
  SUBMITTED: 'Υποβλήθηκε',
  IN_REVIEW: 'Σε επεξεργασία',
  CONFIRMED: 'Επιβεβαιώθηκε',
  REJECTED: 'Απορρίφθηκε',
  CANCELLED: 'Ακυρώθηκε',
};

/** Μεταβάσεις που κάνει το ΠΡΟΣΩΠΙΚΟ. Ο πελάτης μπορεί μόνο να ακυρώσει όσο είναι «Υποβλήθηκε». */
const STAFF_NEXT: Record<OrderRequestStatus, OrderRequestStatus[]> = {
  SUBMITTED: ['IN_REVIEW', 'CONFIRMED', 'REJECTED'],
  IN_REVIEW: ['CONFIRMED', 'REJECTED'],
  CONFIRMED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function staffCanMove(from: string, to: string): boolean {
  return (STAFF_NEXT[from as OrderRequestStatus] ?? []).includes(to as OrderRequestStatus);
}

export const customerCanCancel = (status: string) => status === 'SUBMITTED';

export const isOrderRequestStatus = (s: string): s is OrderRequestStatus => (ORDER_REQUEST_STATUSES as readonly string[]).includes(s);

/** «ΑΠ-000123» — ο αριθμός που βλέπουν πελάτης και προσωπικό. */
export const requestCode = (n: number) => `ΑΠ-${String(n).padStart(6, '0')}`;

const optText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const orderRequestInput = z.object({
  lines: z.array(z.object({
    mtrl: z.number().int().positive(),
    qty: z.number().positive('Η ποσότητα πρέπει να είναι θετική').max(1_000_000),
    note: optText(300),
  })).min(1, 'Προσθέστε τουλάχιστον ένα υλικό').max(100, 'Έως 100 γραμμές ανά αίτημα'),
  prjc: z.number().int().positive().optional().nullable().transform((v) => v ?? null),
  customerRef: optText(80),
  deliveryAddress: optText(300),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Μη έγκυρη ημερομηνία').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  notes: optText(2000),
});
export type OrderRequestInput = z.infer<typeof orderRequestInput>;

/** Ίδιο υλικό δύο φορές → μία γραμμή (άθροισμα ποσοτήτων, οι σημειώσεις ενώνονται). */
export function mergeLines<T extends { mtrl: number; qty: number; note: string | null }>(lines: T[]): T[] {
  const out = new Map<number, T>();
  for (const l of lines) {
    const prev = out.get(l.mtrl);
    if (!prev) { out.set(l.mtrl, { ...l }); continue; }
    prev.qty = Math.round((prev.qty + l.qty) * 1000) / 1000;
    prev.note = [prev.note, l.note].filter(Boolean).join(' · ') || null;
  }
  return [...out.values()];
}

/** Η ημερομηνία παράδοσης δεν μπορεί να είναι στο παρελθόν (σύγκριση ημερών, όχι ωρών). */
export function deliveryDateProblem(iso: string | null, today = new Date()): string | null {
  if (!iso) return null;
  const t = today.toISOString().slice(0, 10);
  return iso < t ? 'Η ημερομηνία παράδοσης είναι στο παρελθόν' : null;
}
