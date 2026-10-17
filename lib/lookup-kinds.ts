/**
 * Τα είδη του μητρώου `SoftoneLookup` με την ελληνική τους ετικέτα — μία πηγή για τη σελίδα
 * «Μητρώα αναφοράς», το API προβολής και τις φόρμες. Η σειρά είναι η σειρά εμφάνισης.
 */
export const LOOKUP_KINDS = [
  { kind: 'MTRUNIT', label: 'Μονάδες μέτρησης', usedFor: 'Είδη & υπηρεσίες' },
  { kind: 'MTRCATEGORY', label: 'Εμπορικές κατηγορίες ειδών', usedFor: 'Είδη & υπηρεσίες' },
  { kind: 'MTRGROUP', label: 'Ομάδες ειδών', usedFor: 'Είδη & υπηρεσίες' },
  { kind: 'MTRMANFCTR', label: 'Κατασκευαστές', usedFor: 'Είδη' },
  { kind: 'MTRMARK', label: 'Μάρκες', usedFor: 'Είδη' },
  { kind: 'WHOUSE', label: 'Αποθήκες', usedFor: 'Υπόλοιπα ειδών' },
  { kind: 'TRDCATEGORY', label: 'Κατηγορίες συναλλασσομένων', usedFor: 'Συναλλασσόμενοι' },
  { kind: 'PAYMENT', label: 'Τρόποι πληρωμής', usedFor: 'Συναλλασσόμενοι & παραστατικά' },
  { kind: 'SHIPMENT', label: 'Τρόποι αποστολής', usedFor: 'Συναλλασσόμενοι & παραστατικά' },
  { kind: 'COUNTRY', label: 'Χώρες', usedFor: 'Συναλλασσόμενοι' },
] as const;

export type LookupKind = (typeof LOOKUP_KINDS)[number]['kind'];

export const lookupKindLabel = (kind: string): string =>
  LOOKUP_KINDS.find((k) => k.kind === kind)?.label ?? kind;
