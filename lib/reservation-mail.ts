import 'server-only';
import { getSetting } from '@/lib/settings';
import { mailgunConfig, sendTransactionalEmail } from '@/lib/mailgun';
import { escapeHtml, siteEmailHtml } from '@/lib/site-email';
import { reservationContext } from '@/lib/container-offers';

const num = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 2 });
const appUrl = () => (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');

/**
 * Ειδοποιήσεις αιτημάτων κράτησης — ΠΑΝΤΑ best-effort (ποτέ δεν ρίχνουν την ενέργεια):
 *  • νέο αίτημα → στην εταιρεία (Ρυθμίσεις → Εταιρεία → email)
 *  • έγκριση/απόρριψη → στον χρήστη του portal που το έκανε
 */
export async function notifyReservation(offerId: string, id: string, event: 'requested' | 'approved' | 'rejected') {
  try {
    const ctx = await reservationContext(offerId, id);
    if (!ctx) return;
    const { r, who, requester } = ctx;
    const [brand, inbox] = await Promise.all([getSetting<string>('company.name'), getSetting<string>('company.email')]);
    const name = (brand ?? 'ATELIER').trim();
    const unit = r.offerItem.baseUnit ?? 'τ.μ.';
    const qty = `${num(r.pallets)} παλέτες (${num(r.pallets * r.offerItem.sqmPerPallet)} ${unit})`;
    // Το προϊόν της κράτησης + (αν διαφέρει) ο τίτλος της προσφοράς, που μπορεί να έχει κι άλλα προϊόντα.
    const product = r.offerItem.name;
    const where = r.offer.title && !r.offer.title.startsWith(product) ? ` (${r.offer.title})` : '';
    if (event === 'requested') {
      const to = inbox?.trim() || mailgunConfig().address;
      const body = `<p style="margin:0 0 8px"><strong>${escapeHtml(who)}</strong> ζητά <strong>${escapeHtml(qty)}</strong> στο «${escapeHtml(product)}»${escapeHtml(where)}.</p>${r.notes ? `<p style="margin:0 0 8px;white-space:pre-wrap">${escapeHtml(r.notes)}</p>` : ''}<p style="margin:12px 0 0">Έγκριση: Δυναμικές προσφορές → η προσφορά → Κρατήσεις → ⋮ → Έγκριση.</p>`;
      await sendTransactionalEmail(to, `Αίτημα κράτησης — ${who}`, siteEmailHtml({ brand: name, title: 'Νέο αίτημα κράτησης', body, footer: 'Το αίτημα δεν μετράει στο γέμισμα μέχρι να εγκριθεί.' }), { fromName: name, replyTo: requester?.email ?? null });
      return;
    }
    if (!requester?.email) return;
    const link = appUrl() ? `<p style="margin:16px 0 0"><a href="${appUrl()}/dashboard/offers/${offerId}" style="color:#1C3241">Δείτε την προσφορά</a></p>` : '';
    const ok = event === 'approved';
    const body = ok
      ? `<p style="margin:0">Η κράτησή σας για <strong>${escapeHtml(qty)}</strong> στο «${escapeHtml(product)}»${escapeHtml(where)} εγκρίθηκε και μετράει πλέον στο γέμισμα του container.</p>${link}`
      : `<p style="margin:0">Το αίτημά σας για ${escapeHtml(qty)} στο «${escapeHtml(product)}»${escapeHtml(where)} δεν εγκρίθηκε.</p>${r.decisionNote ? `<p style="margin:8px 0 0">${escapeHtml(r.decisionNote)}</p>` : ''}${link}`;
    await sendTransactionalEmail(requester.email, `${ok ? 'Εγκρίθηκε' : 'Δεν εγκρίθηκε'} η κράτησή σας — ${product}`, siteEmailHtml({ brand: name, title: ok ? 'Η κράτησή σας εγκρίθηκε' : 'Το αίτημα δεν εγκρίθηκε', body, footer: 'Για οποιαδήποτε απορία απαντήστε σε αυτό το email.' }), { fromName: name, replyTo: inbox ?? null });
  } catch (e) {
    console.error('[reservation-mail]', event, e instanceof Error ? e.message : e);
  }
}
