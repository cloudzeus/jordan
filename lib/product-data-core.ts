// lib/product-data-core.ts — ΚΑΘΑΡΟ (client + server): οι καρτέλες και ο τύπος γραμμής της σελίδας
// «Δεδομένα προϊόντων». Η ανάγνωση από τη βάση/SoftOne ζει στο `lib/product-data.ts` (server-only).

export const PRODUCT_TABS = [
  { key: 'brands', label: 'Μάρκες', table: 'MTRMARK', editable: false },
  { key: 'manufacturers', label: 'Κατασκευαστές', table: 'MTRMANFCTR', editable: false },
  { key: 'categories', label: 'Εμπορικές κατηγορίες', table: 'MTRCATEGORY', editable: true },
  { key: 'groups', label: 'Ομάδες', table: 'MTRGROUP', editable: false },
] as const;

export type ProductTab = (typeof PRODUCT_TABS)[number]['key'];
export const isProductTab = (v: unknown): v is ProductTab => PRODUCT_TABS.some((t) => t.key === v);

export type ProductDataRow = {
  /** Ο αριθμός του SoftOne (MTRMARK/MTRMANFCTR/MTRCATEGORY/MTRGROUP). */
  code: number;
  shortCode: string | null;
  name: string;
  isActive: boolean;
  /** 51 = είδη, 52 = υπηρεσίες· κενό στις μάρκες/κατασκευαστές (μία αρίθμηση). */
  sodtype: number | null;
  /** Πόσα είδη/υπηρεσίες το χρησιμοποιούν· `null` όταν το SoftOne δεν απάντησε. */
  itemCount: number | null;
};

export type ProductData = {
  rows: Record<ProductTab, ProductDataRow[]>;
  /** Το SoftOne δεν απάντησε για τα μέλη — οι μετρήσεις λείπουν (η λίστα είναι κανονική). */
  membersError: string | null;
};
