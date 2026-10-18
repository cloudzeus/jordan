/**
 * Παραστατικά πελάτη για το B2B portal — ΚΑΘΑΡΗ λογική (χωρίς SoftOne/DB, για tests).
 *
 * ΚΑΝΟΝΑΣ: ο πελάτης βλέπει ΜΟΝΟ τα δικά του παραστατικά πωλήσεων (1351) και τις δικές του
 * πληρωμές (1413). Ποτέ αγορές (1251), πληρωμές προμηθευτών (1412), κόστος, περιθώρια, γενικά
 * έξοδα ή την κερδοφορία του έργου (μόνο εσωτερικά, για το προσωπικό). Γι' αυτό κάθε γραμμή
 * περνά από λευκή λίστα πεδίων (`toCustomerDoc`) πριν φύγει προς τη σελίδα.
 */

export const CUSTOMER_SOSOURCES = [1351, 1413] as const;
export const isCustomerSosource = (s: number) => (CUSTOMER_SOSOURCES as readonly number[]).includes(s);

export type CustomerDocKind = 'order' | 'invoice' | 'credit' | 'delivery' | 'quote' | 'payment';

export const CUSTOMER_DOC_LABEL: Record<CustomerDocKind, string> = {
  order: 'Παραγγελία',
  invoice: 'Τιμολόγιο',
  credit: 'Πιστωτικό',
  delivery: 'Δελτίο αποστολής',
  quote: 'Προσφορά',
  payment: 'Πληρωμή',
};

const plain = (s: string | null | undefined) => (s ?? '').toLocaleLowerCase('el').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Από την ονομασία της σειράς (π.χ. «Τιμολόγιο - Δελτίο Αποστολής», «Παραγγελία»). */
export function customerDocKind(sosource: number, seriesName: string | null | undefined): CustomerDocKind {
  if (sosource === 1413) return 'payment';
  const s = plain(seriesName);
  if (/πιστωτικ|επιστροφ/.test(s)) return 'credit';
  if (/τιμολ|αποδειξ/.test(s)) return 'invoice';
  if (/παραγγελ/.test(s)) return 'order';
  if (/προσφορ/.test(s)) return 'quote';
  return 'delivery';
}

/**
 * Κατάσταση παραγγελίας από το FINDOC.FULLYTRANSF (επιβεβαιωμένο στο atelier, 2026-10-18):
 * 0 = ανοιχτή, 2 = μερικώς εκτελεσμένη, 1 = εκτελέστηκε (έγινε δελτίο/τιμολόγιο).
 */
export type OrderState = 'open' | 'partial' | 'done' | 'cancelled';
export const ORDER_STATE_LABEL: Record<OrderState, string> = {
  open: 'Σε εκκρεμότητα',
  partial: 'Μερικώς εκτελεσμένη',
  done: 'Εκτελέστηκε',
  cancelled: 'Ακυρωμένη',
};
export function orderState(fullyTransf: string | number | null | undefined, cancelled: boolean): OrderState {
  if (cancelled) return 'cancelled';
  const n = Number(fullyTransf);
  if (n === 1) return 'done';
  if (n === 2) return 'partial';
  return 'open';
}

export type RawDoc = Record<string, string>;

export type CustomerDoc = {
  findoc: number;
  fincode: string;
  date: string | null;
  kind: CustomerDocKind;
  kindLabel: string;
  seriesName: string | null;
  prjc: number | null;
  net: number;
  vat: number;
  total: number;
  cancelled: boolean;
  state: OrderState | null; // μόνο για παραγγελίες
  stateLabel: string | null;
};

const n = (v: string | undefined) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** S1 «2026-02-02 00:00:00» → ISO (UTC μεσάνυχτα), ή null. */
export function s1Date(v: string | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? '');
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Λευκή λίστα: ΜΟΝΟ ό,τι επιτρέπεται να δει ο πελάτης. */
export function toCustomerDoc(r: RawDoc, seriesName: (sosource: number, series: string) => string | null): CustomerDoc | null {
  const sosource = n(r.SOSOURCE);
  if (!isCustomerSosource(sosource)) return null;
  const name = seriesName(sosource, r.SERIES);
  const kind = customerDocKind(sosource, name);
  const cancelled = n(r.ISCANCEL) !== 0;
  const state = kind === 'order' ? orderState(r.FULLYTRANSF, cancelled) : null;
  const prjc = n(r.PRJC);
  return {
    findoc: n(r.FINDOC),
    fincode: r.FINCODE || `#${r.FINDOC}`,
    date: s1Date(r.TRNDATE),
    kind, kindLabel: CUSTOMER_DOC_LABEL[kind], seriesName: name,
    prjc: prjc > 0 ? prjc : null,
    net: n(r.NETAMNT), vat: n(r.VATAMNT), total: n(r.SUMAMNT),
    cancelled, state, stateLabel: state ? ORDER_STATE_LABEL[state] : null,
  };
}

/** Σύνολα για τον πελάτη: τιμολογημένα (τιμολόγια − πιστωτικά, μικτά) και πληρωμές. */
export function customerTotals(docs: CustomerDoc[]) {
  let invoiced = 0;
  let paid = 0;
  let openOrders = 0;
  for (const d of docs) {
    if (d.cancelled) continue;
    if (d.kind === 'invoice') invoiced += d.total;
    else if (d.kind === 'credit') invoiced -= d.total;
    else if (d.kind === 'payment') paid += d.total;
    else if (d.kind === 'order' && d.state !== 'done') openOrders++;
  }
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { invoiced: r2(invoiced), paid: r2(paid), openOrders };
}

/** Κατάσταση έργου για τον πελάτη (οι κωδικοί ACTSTATUS δεν έχουν ετικέτες στο SoftOne). */
export type ProjectState = 'active' | 'completed' | 'inactive';
export const PROJECT_STATE_LABEL: Record<ProjectState, string> = { active: 'Σε εξέλιξη', completed: 'Ολοκληρώθηκε', inactive: 'Ανενεργό' };
export function projectState(p: { isActive: boolean; closeDate: Date | string | null }): ProjectState {
  if (p.closeDate) return 'completed';
  return p.isActive ? 'active' : 'inactive';
}
