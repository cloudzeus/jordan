import 'server-only';
import { prisma } from '@/lib/db';

/**
 * Τι ΕΙΝΑΙ ένα παραστατικό της ενότητας Αγορών (SOSOURCE 1251).
 *
 * Η ενότητα κρατά πολύ περισσότερα από τιμολόγια: μια αγορά συχνά περνά από παραγγελία (ΠΑΡΠ) →
 * δελτίο παραλαβής (ΔΠΑ, συχνά με αξία 0) → τιμολόγιο (ΤΜΑ). Το απλό άθροισμα όλων μετρά την ίδια
 * ποσότητα τρεις φορές, και ένα δελτίο με αξία 0 ως «τελευταία αγορά» δίνει κόστος 0.
 *
 * Μόνο τα ΤΙΜΟΛΟΓΙΑ (μείον τα πιστωτικά) είναι αγορά με κόστος. Ο τύπος βγαίνει από την
 * υποενότητα της σειράς (PurchaseDocType.section, π.χ. «Τιμολόγιο Αγοράς», «Παραγγελία»).
 */
export type PurchaseKind = 'invoice' | 'credit' | 'order' | 'quote' | 'movement';

export const PURCHASE_KIND_LABEL: Record<PurchaseKind, string> = {
  invoice: 'Τιμολόγια',
  credit: 'Πιστωτικά',
  order: 'Παραγγελίες',
  quote: 'Προσφορές',
  movement: 'Δελτία / διακίνηση',
};

export function classifyPurchase(section: string | null | undefined): PurchaseKind {
  // Χωρίς τόνους: «Απόδειξη» και «Αποδειξη» (υπάρχουν και τα δύο στις σειρές) πρέπει να ταιριάζουν.
  const s = (section ?? '').toLocaleLowerCase('el').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/πιστωτικ|επιστροφ/.test(s)) return 'credit';
  // Τιμολόγιο ή απόδειξη (λιανική/παροχής υπηρεσιών) = πραγματική συναλλαγή με αξία.
  if (/τιμολ|αποδειξ/.test(s)) return 'invoice';
  if (/παραγγελ/.test(s)) return 'order';
  if (/προσφορ/.test(s)) return 'quote';
  return 'movement';
}

/** Πιστωτικό ΜΕ επιστροφή υλικού (ΔΑ) αφαιρεί και ποσότητα· πιστωτικό έκπτωσης μόνο αξία. */
export const creditReturnsGoods = (section: string | null | undefined) => /δα\b|δ\.?\s?α\.?|αποστολ|επιστροφ/i.test(section ?? '');

/**
 * (ενότητα, σειρά) → τύπος, για αγορές ΚΑΙ πωλήσεις. Αγορές: από το PurchaseDocType (υποενότητα).
 * Πωλήσεις: από το SoftoneDocSeries — εκεί η υποενότητα είναι αριθμός (FPRMS), οπότε ταξινομούμε
 * με την ονομασία της σειράς («Τιμολόγιο», «Απόδειξη Λιανικής», «Παραγγελία», «Δελτίο Αποστολής»…).
 */
export async function docKindMap(): Promise<Map<string, PurchaseKind>> {
  const [purchases, others] = await Promise.all([
    purchaseSeriesMap(),
    prisma.softoneDocSeries.findMany({ where: { sosource: { not: 1251 } }, select: { sosource: true, code: true, name: true } }),
  ]);
  const out = new Map<string, PurchaseKind>();
  for (const [code, v] of purchases) out.set(`1251:${code}`, v.kind);
  for (const r of others) out.set(`${r.sosource}:${r.code}`, classifyPurchase(r.name));
  return out;
}

/** Σειρά αγορών → { τύπος, ονομασία, υποενότητα }, από το μητρώο τύπων παραστατικών αγορών. */
export async function purchaseSeriesMap(): Promise<Map<string, { kind: PurchaseKind; name: string; section: string | null }>> {
  const rows = await prisma.purchaseDocType.findMany({ select: { code: true, name: true, section: true } });
  return new Map(rows.map((r) => [r.code, { kind: classifyPurchase(r.section ?? r.name), name: r.name, section: r.section ?? r.name }]));
}
