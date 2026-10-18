/**
 * Λεπτομέρειες παραστατικού — ΚΑΘΑΡΗ λογική (χωρίς SoftOne/βάση) ώστε να δοκιμάζεται.
 *
 * Επιβεβαιωμένο ζωντανά (atelier, 2026-10-18): στο MTRLINES το LINEVAL είναι η αξία γραμμής ΜΕΤΑ την
 * έκπτωση γραμμής, το NETLINEVAL η καθαρή αξία μετά και την επιμερισμένη έκπτωση/επιβάρυνση παραστατικού
 * (το άθροισμά τους = FINDOC.NETAMNT). Το VAT είναι ο ΚΩΔΙΚΟΣ ΦΠΑ (π.χ. 1410), όχι το ποσοστό.
 */
export type DocLineRaw = Record<string, string>;

export type DocLine = {
  lineNo: number;
  mtrl: number | null;
  code: string | null;
  name: string;
  isService: boolean;
  qty: number;
  unit: string | null;
  price: number;
  discPct: number;
  discVal: number;
  /** LINEVAL — αξία γραμμής μετά την έκπτωση γραμμής. */
  value: number;
  /** NETLINEVAL — καθαρή αξία που μετρά στο σύνολο του παραστατικού. */
  net: number;
  vatPct: number | null;
  vatAmount: number;
  comments: string | null;
  prjc: number | null;
  sourceFindoc: number | null;
};

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const id = (v: string | undefined) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Ποσοστό ΦΠΑ: από το μητρώο ΦΠΑ αν ο κωδικός είναι γνωστός, αλλιώς από τα ποσά (στρογγυλό). */
export function vatPercent(vatCode: string | undefined, vatAmount: number, base: number, rates: Map<string, number | null>): number | null {
  const known = vatCode ? rates.get(vatCode) : undefined;
  if (known != null) return known;
  if (base > 0 && vatAmount >= 0) return Math.round((vatAmount / base) * 100);
  return null;
}

export function parseLines(
  rows: DocLineRaw[],
  lookups: {
    items: Map<number, { code: string; name: string; isService: boolean }>;
    units: Map<string, string>;
    vatRates: Map<string, number | null>;
  },
): DocLine[] {
  return rows
    .map((r) => {
      const mtrl = id(r.MTRL);
      const it = mtrl != null ? lookups.items.get(mtrl) : undefined;
      const net = num(r.NETLINEVAL) || num(r.LINEVAL);
      const vatAmount = num(r.VATAMNT);
      return {
        lineNo: num(r.LINENUM) || num(r.MTRLINES),
        mtrl,
        code: it?.code ?? null,
        name: it?.name ?? (mtrl != null ? `Είδος #${mtrl}` : '—'),
        isService: it ? it.isService : num(r.SODTYPE) === 52,
        qty: num(r.QTY1) || num(r.QTY),
        unit: r.MTRUNIT ? lookups.units.get(r.MTRUNIT) ?? null : null,
        price: num(r.PRICE),
        discPct: round2(num(r.DISC1PRC) + num(r.DISC2PRC)),
        discVal: num(r.DISC1VAL),
        value: num(r.LINEVAL),
        net: round2(net),
        vatPct: vatPercent(r.VAT, vatAmount, net, lookups.vatRates),
        vatAmount: round2(vatAmount),
        comments: (r.COMMENTS1 || r.COMMENTS || '').trim() || null,
        prjc: id(r.PRJC),
        sourceFindoc: id(r.FINDOCS),
      };
    })
    .sort((a, b) => a.lineNo - b.lineNo);
}

/** Σύνολα γραμμών — για έλεγχο ότι συμφωνούν με την κεφαλή. */
export function lineTotals(lines: DocLine[]) {
  return {
    net: round2(lines.reduce((s, l) => s + l.net, 0)),
    vat: round2(lines.reduce((s, l) => s + l.vatAmount, 0)),
  };
}
