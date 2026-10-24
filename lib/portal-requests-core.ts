// lib/portal-requests-core.ts — ΚΑΘΑΡΟ. Η είσοδος του «Αιτήματος προσφοράς» της πύλης (φόρμα και AI βοηθός).
import { z } from 'zod';
import { rfpDraft } from './rfp-agent-core';

/** Η θέση του έργου ορίζει μεταφορικά, επίβλεψη, έξοδα και ποιο συνεργείο αναλαμβάνει — άρα είναι υποχρεωτική. */
export const SITE_REQUIRED = 'Πείτε μας πού είναι το έργο — αρκεί η πόλη ή η περιοχή (π.χ. Κηφισιά, Θάσος).';

export const offerRequestInput = z.object({
  title: z.string().trim().min(3, 'Γράψτε σύντομα τι θέλετε (π.χ. «Πέτρινο δάπεδο σαλονιού»)').max(160),
  description: z.string().trim().min(10, 'Περιγράψτε λίγο περισσότερο τι χρειάζεστε').max(4000),
  site: z.string().trim().max(300).nullish().transform((v) => v || null),
  /** Αποθηκευμένη τοποθεσία του πελάτη (προφίλ) — υπερισχύει του ελεύθερου κειμένου. */
  siteId: z.string().max(64).nullish().transform((v) => v || null),
  wanted: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().transform((v) => v || null),
  kind: z.enum(['PRODUCT', 'PRODUCT_INSTALL']).default('PRODUCT_INSTALL'),
  /** Από τον AI βοηθό: το δομημένο RFP, η εκτίμηση αντικειμένου και η συνομιλία (για εμάς). */
  rfp: rfpDraft.nullish(),
  scope: z.object({ verdict: z.enum(['YES', 'PARTIAL', 'NO', 'UNKNOWN']), can: z.array(z.string().max(200)).max(10), cannot: z.array(z.string().max(200)).max(10) }).nullish(),
  transcript: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(2000) })).max(60).nullish(),
}).refine((v) => !!v.siteId || (v.site?.trim().length ?? 0) >= 2, { path: ['site'], message: SITE_REQUIRED });
export type OfferRequestInput = z.infer<typeof offerRequestInput>;
