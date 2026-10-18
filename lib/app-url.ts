/**
 * Η ΜΙΑ πηγή για τη δημόσια διεύθυνση της εφαρμογής (σύνδεσμοι σε email, πληρωμές, ειδοποιήσεις,
 * metadata/SEO, sitemap). Τελική διεύθυνση παραγωγής: https://b2b.atelierdamask.gr.
 *
 *  - `APP_URL` (ή `NEXT_PUBLIC_APP_URL`) στο περιβάλλον υπερισχύει — π.χ. staging.
 *  - Σε παραγωγή, αν λείπει ή δείχνει σε localhost → η διεύθυνση παραγωγής (ποτέ σύνδεσμοι σε localhost
 *    μέσα σε email πελατών).
 *  - Τοπικά (development) χωρίς ρύθμιση → http://localhost:3000.
 */
export const PRODUCTION_URL = 'https://b2b.atelierdamask.gr';

const isLocal = (u: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(u);

export function appUrl(): string {
  const env = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') return env && !isLocal(env) ? env : PRODUCTION_URL;
  return env || 'http://localhost:3000';
}

/** Απόλυτο URL για μια διαδρομή της εφαρμογής (π.χ. `abs('/dashboard/offers/x')`). */
export const abs = (path: string) => `${appUrl()}${path.startsWith('/') ? path : `/${path}`}`;
