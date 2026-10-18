import 'server-only';
import { getSetting } from '@/lib/settings';
import { mailgunConfig, sendTransactionalEmail } from '@/lib/mailgun';
import { emailBrand } from '@/lib/email/brand';
import { reservationDecisionEmail, reservationRequestedEmail } from '@/lib/email/templates';
import { reservationContext } from '@/lib/container-offers';
import { appUrl } from '@/lib/app-url';

const num = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 2 });

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
    const [brand, inbox] = await Promise.all([emailBrand(), getSetting<string>('company.email')]);
    const unit = r.offerItem.baseUnit ?? 'τ.μ.';
    const qty = `${num(r.pallets)} παλέτες (${num(r.pallets * r.offerItem.sqmPerPallet)} ${unit})`;
    // Το προϊόν της κράτησης + (αν διαφέρει) ο τίτλος της προσφοράς, που μπορεί να έχει κι άλλα προϊόντα.
    const product = r.offerItem.name;
    const offer = r.offer.title && !r.offer.title.startsWith(product) ? r.offer.title : null;
    if (event === 'requested') {
      const to = inbox?.trim() || mailgunConfig().address;
      const m = reservationRequestedEmail(brand, { who, qty, product, offer, notes: r.notes, link: appUrl() ? `${appUrl()}/admin/dynamic-offers` : null });
      await sendTransactionalEmail(to, m.subject, m.html, { fromName: brand.name, replyTo: requester?.email ?? null, text: m.text });
      return;
    }
    if (!requester?.email) return;
    const m = reservationDecisionEmail(brand, { approved: event === 'approved', qty, product, offer, note: event === 'rejected' ? r.decisionNote : null, link: appUrl() ? `${appUrl()}/dashboard/offers/${offerId}` : null });
    await sendTransactionalEmail(requester.email, m.subject, m.html, { fromName: brand.name, replyTo: inbox ?? null, text: m.text });
  } catch (e) {
    console.error('[reservation-mail]', event, e instanceof Error ? e.message : e);
  }
}
