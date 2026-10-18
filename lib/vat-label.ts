// lib/vat-label.ts — ΚΑΘΑΡΟ. Κωδικός κατηγορίας ΦΠΑ του SoftOne (VAT.VAT, π.χ. «1410») → το ποσοστό
// που καταλαβαίνει ο χρήστης («24 %»). Στις λίστες δείχνουμε ΠΑΝΤΑ το ποσοστό, ποτέ τον κωδικό.
//
// Οι μηδενικές κατηγορίες έρχονται από το SoftOne με `rate` κενό (βλ. lib/ocr/vat-map.ts) — το ποσοστό
// ζει μόνο στην περιγραφή («Μηδενικός Συντελεστής ΦΠΑ 0%»), οπότε για την ΕΜΦΑΝΙΣΗ το διαβάζουμε από
// εκεί. (Για την καταχώριση ισχύει ο αυστηρός χάρτης του vat-map, όχι αυτό.)

export type VatCategoryRow = { code: string; descr: string; rate: number | null };
export type VatLabel = { label: string; title: string | null };

const pct = (n: number) => `${new Intl.NumberFormat('el-GR', { maximumFractionDigits: 2 }).format(n)} %`;

/** Το ποσοστό από την περιγραφή: «ΦΠΑ 13% (Διαμονής…)» → 13. */
export function rateFromDescr(descr: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*%/.exec(descr);
  return m ? Number(m[1].replace(',', '.')) : null;
}

/** Ο κωδικός μπορεί να έρθει και ως «1410|ΦΠΑ 24%» από λίστες του SoftOne. */
const keyOf = (v: string) => v.split('|')[0].trim();

export function vatLabeller(rows: readonly VatCategoryRow[]): (code: string | null | undefined) => VatLabel | null {
  const by = new Map(rows.map((r) => [String(r.code).trim(), r]));
  return (code) => {
    if (code == null || String(code).trim() === '') return null;
    const raw = String(code);
    const r = by.get(keyOf(raw));
    if (!r) {
      // Άγνωστος κωδικός: αν η τιμή κουβαλά περιγραφή με ποσοστό, αυτή· αλλιώς ο κωδικός, ρητά.
      const fromText = rateFromDescr(raw);
      return fromText != null ? { label: pct(fromText), title: raw } : { label: `κωδ. ${keyOf(raw)}`, title: 'Άγνωστη κατηγορία ΦΠΑ — τρέξε συγχρονισμό μητρώων αναφοράς' };
    }
    const rate = r.rate ?? rateFromDescr(r.descr);
    return { label: rate != null ? pct(rate) : r.descr, title: r.descr };
  };
}
