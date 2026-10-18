/** Δείγμα κατάστασης (φανταστικός πελάτης) — για την προεπισκόπηση στη σελίδα «Πρότυπα email» και τα tests. */
import type { EmailBrand } from '@/lib/email/layout';
import { buildStatement, type StatementEntry } from '@/lib/statement/core';
import type { StatementDoc } from '@/lib/statement/email';

export const SAMPLE_ENTRIES: StatementEntry[] = [
  { findoc: 1, fincode: 'ΤΔΑ-0412', date: '2026-03-10', kindLabel: 'Τιμολόγιο', project: 'ΕΡΓ-031 · Κατοικία Βούλα', amount: 8420, side: 'D' },
  { findoc: 2, fincode: 'ΕΜΒ-0188', date: '2026-04-02', kindLabel: 'Είσπραξη', seriesName: 'Έμβασμα από πελάτη', amount: 5000, side: 'C' },
  { findoc: 3, fincode: 'ΤΔΑ-0467', date: '2026-06-18', kindLabel: 'Τιμολόγιο', project: 'ΕΡΓ-031 · Κατοικία Βούλα', amount: 3260.5, side: 'D' },
  { findoc: 4, fincode: 'ΠΙΣ-0021', date: '2026-07-01', kindLabel: 'Πιστωτικό', amount: 310.5, side: 'C' },
  { findoc: 5, fincode: 'ΕΜΒ-0231', date: '2026-07-22', kindLabel: 'Είσπραξη', seriesName: 'Έμβασμα από πελάτη', amount: 4000, side: 'C' },
  { findoc: 6, fincode: 'ΤΔΑ-0533', date: '2026-08-29', kindLabel: 'Τιμολόγιο', project: 'ΕΡΓ-044 · Ξενοδοχείο Τήνος', amount: 6120, side: 'D' },
  { findoc: 7, fincode: 'ΤΔΑ-0581', date: '2026-09-25', kindLabel: 'Τιμολόγιο', project: 'ΕΡΓ-044 · Ξενοδοχείο Τήνος', amount: 2480, side: 'D' },
  { findoc: 8, fincode: 'ΕΜΒ-0277', date: '2026-10-06', kindLabel: 'Είσπραξη', seriesName: 'Έμβασμα από πελάτη', amount: 3000, side: 'C' },
];

export function sampleStatementDoc(brand: EmailBrand, today = '2026-10-18'): StatementDoc {
  return {
    brand: brand.bankAccounts?.length ? brand : { ...brand, bankAccounts: [{ bank: 'Alpha Bank (δείγμα)', iban: 'GR00 0000 0000 0000 0000 0000 000' }] },
    customer: { trdr: 0, code: 'Π-00142', name: 'ΔΕΙΓΜΑ ΑΡΧΙΤΕΚΤΟΝΙΚΗ ΙΚΕ', afm: '099999999', doy: 'ΚΕΦΟΔΕ Αττικής', address: 'Λεωφ. Κηφισίας 100', zip: '115 26', city: 'Αθήνα', email: 'logistirio@example.com', phone: '210 0000000' },
    statement: buildStatement(SAMPLE_ENTRIES, { from: '2026-06-01', to: today }),
    issuedOn: today,
    message: null,
  };
}
