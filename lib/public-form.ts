import 'server-only';
import { z } from 'zod';

/**
 * Κοινά για τις δημόσιες φόρμες του website (ραντεβού, newsletter): όριο υποβολών ανά IP στη μνήμη
 * της διεργασίας (αρκεί για μία instance· ανακόπτει τα bots, όχι κατανεμημένη επίθεση) και schemas.
 */
const hits = new Map<string, number[]>();
export function tooMany(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return list.length > max;
}
export const clientIp = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';

const opt = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
export const emailField = z.string().trim().toLowerCase().max(254).email('Το email δεν φαίνεται σωστό');

export const bookingSchema = z.object({
  start: z.string().datetime({ message: 'Διαλέξτε ώρα' }),
  name: z.string().trim().min(2, 'Συμπληρώστε ονοματεπώνυμο').max(200),
  company: z.string().trim().min(2, 'Συμπληρώστε εταιρεία ή γραφείο').max(200),
  email: emailField,
  phone: z.string().trim().max(40).regex(/^[+\d\s().-]{6,}$/, 'Το τηλέφωνο δεν φαίνεται σωστό'),
  profession: opt(80),
  topic: opt(80),
  message: opt(2000),
  newsletter: z.boolean().optional().default(false),
  terms: z.literal(true, { message: 'Αποδεχτείτε την πολιτική απορρήτου' }),
  website: z.string().optional(), // honeypot
});

export const newsletterSchema = z.object({
  email: emailField,
  name: opt(200),
  source: z.enum(['footer', 'modal', 'page']).optional().default('footer'),
  consent: z.literal(true, { message: 'Χρειάζεται η συγκατάθεσή σας' }),
  website: z.string().optional(),
});
