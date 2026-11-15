// Από το BOM προς παραγγελίες προμηθευτών — ΚΑΘΑΡΗ λογική (χωρίς DB), ελέγξιμη με tests.
// Ομαδοποιεί τα είδη «προς παραγγελία» ανά κορυφαίο προμηθευτή (ο προμηθευτής επιλέγεται server-side
// από το SupplierProduct) και φτιάχνει έτοιμο κείμενο/mailto για κάθε προμηθευτή. Δεν γράφει στο SoftOne.

export type SupplierRef = { trdr: number; name: string; email: string | null } | null;
export type OrderItem = { mtrl: number; code: string | null; name: string; unit: string | null; qty: number; lastCost: number | null };
export type SupplierGroup = { supplier: SupplierRef; lines: OrderItem[]; total: number };

const round2 = (n: number) => Math.round(n * 100) / 100;
const q = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 2 });
const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });

/** Ομαδοποίηση ειδών προς παραγγελία ανά προμηθευτή. Όσα δεν έχουν γνωστό προμηθευτή πάνε σε μία ομάδα στο τέλος. */
export function groupBySupplier(items: OrderItem[], supplierOf: (mtrl: number) => SupplierRef): SupplierGroup[] {
  const by = new Map<string, SupplierGroup>();
  for (const it of items) {
    if (!(it.qty > 0)) continue;
    const sup = supplierOf(it.mtrl);
    const key = sup ? `t${sup.trdr}` : 'none';
    let g = by.get(key);
    if (!g) { g = { supplier: sup, lines: [], total: 0 }; by.set(key, g); }
    g.lines.push(it);
    g.total = round2(g.total + (it.lastCost ?? 0) * it.qty);
  }
  // Γνωστοί προμηθευτές πρώτα (μεγαλύτερη αξία πάνω), άγνωστος προμηθευτής τελευταίος.
  return [...by.values()].sort((a, b) => Number(!a.supplier) - Number(!b.supplier) || b.total - a.total);
}

/** Κείμενο παραγγελίας για αντιγραφή ή σώμα email. */
export function orderText(g: SupplierGroup, ref: string): string {
  const lines = g.lines.map((l) => `• ${l.name}${l.code ? ` [${l.code}]` : ''} — ${q(l.qty)} ${l.unit ?? ''}`.trimEnd());
  return [
    `Παραγγελία υλικών${ref ? ` — ${ref}` : ''}`,
    g.supplier ? `Προς: ${g.supplier.name}` : null,
    '',
    ...lines,
    '',
    g.total > 0 ? `Εκτιμώμενο κόστος: ${eur(g.total)} (με βάση την τελευταία αγορά)` : null,
  ].filter((x): x is string => x != null).join('\n');
}

/** `mailto:` με προσυμπληρωμένο θέμα και σώμα — το email το στέλνει ο χρήστης (δεν στέλνει η εφαρμογή). */
export function orderMailto(g: SupplierGroup, ref: string): string {
  const subject = `Παραγγελία υλικών${ref ? ` — ${ref}` : ''}`;
  return `mailto:${g.supplier?.email ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(orderText(g, ref))}`;
}
