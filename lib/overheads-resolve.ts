/**
 * Επίλυση ποσοστού ΓΕΝΙΚΩΝ ΕΞΟΔΩΝ — ΚΑΘΑΡΗ συνάρτηση (χωρίς βάση), κοινή για την κερδοφορία έργων
 * και το «Πραγματικό κόστος».
 *
 * Σύμβαση (πίνακας `OverheadRate`): ποσοστό % ΕΠΙ ΤΟΥ ΑΜΕΣΟΥ ΚΟΣΤΟΥΣ, ανά περίοδο [validFrom, validTo].
 * `category` null = γενικό ποσοστό της περιόδου· με τιμή = παράκαμψη για την κατηγορία αυτή.
 *
 * Για (ημερομηνία, κατηγορία):
 *  1. ισχύει όποια εγγραφή καλύπτει την ημερομηνία (validTo null = ανοιχτή)·
 *  2. η εγγραφή της κατηγορίας προηγείται της γενικής·
 *  3. αν καλύπτουν περισσότερες, κερδίζει η πιο πρόσφατη έναρξη.
 * Καμία εγγραφή ⇒ 0% (και το UI το λέει — δεν μαντεύουμε ποσοστό).
 */
export type OverheadRateInput = {
  /** ISO ημερομηνία (YYYY-MM-DD ή πλήρες ISO). */
  validFrom: string;
  validTo: string | null;
  percent: number;
  category: string | null;
};

const day = (iso: string) => iso.slice(0, 10);

export function overheadRateFor(rates: OverheadRateInput[], dateIso: string | null, category: string | null): { percent: number; rate: OverheadRateInput | null } {
  const d = day(dateIso ?? new Date().toISOString());
  const covering = rates.filter((r) => day(r.validFrom) <= d && (r.validTo == null || d <= day(r.validTo)));
  const pick = (list: OverheadRateInput[]) => list.sort((a, b) => day(b.validFrom).localeCompare(day(a.validFrom)))[0] ?? null;
  const specific = category ? pick(covering.filter((r) => r.category === category)) : null;
  const rate = specific ?? pick(covering.filter((r) => r.category == null));
  return { percent: rate?.percent ?? 0, rate };
}
