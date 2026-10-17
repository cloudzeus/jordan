import 'server-only';
import { prisma } from '@/lib/db';
import { listOffers } from '@/lib/container-offers';

/**
 * Τι βλέπει ένας χρήστης του portal: ΜΟΝΟ τις ανοιχτές δυναμικές προσφορές που του στάλθηκαν
 * (παραλήπτης ο πελάτης του ή ο συνεργάτης του) και τις κρατήσεις του πελάτη του.
 */
export async function portalData(user: { customerTrdr: number | null; partnerId: string | null }) {
  const or = [
    ...(user.customerTrdr ? [{ kind: 'CUSTOMER', refId: String(user.customerTrdr) }] : []),
    ...(user.partnerId ? [{ kind: 'PARTNER', refId: user.partnerId }] : []),
  ];
  if (!or.length) return { org: null, offers: [], reservations: [] };
  const ids = new Set((await prisma.offerRecipient.findMany({ where: { OR: or }, select: { offerId: true } })).map((r) => r.offerId));
  const offers = (await listOffers()).filter((o) => ids.has(o.id) && (o.status === 'OPEN' || o.status === 'CLOSED'));
  const snapshots = new Map((await prisma.containerOffer.findMany({ where: { id: { in: offers.map((o) => o.id) } }, select: { id: true, snapshotUrl: true } })).map((o) => [o.id, o.snapshotUrl]));
  const reservations = user.customerTrdr
    ? await prisma.containerReservation.findMany({ where: { trdr: user.customerTrdr, status: 'ACTIVE', offerId: { in: offers.map((o) => o.id) } }, select: { offerId: true, pallets: true, createdAt: true } })
    : [];
  const org = user.customerTrdr
    ? (await prisma.softoneTrader.findUnique({ where: { trdr: user.customerTrdr }, select: { name: true } }))?.name ?? null
    : user.partnerId ? (await prisma.partner.findUnique({ where: { id: user.partnerId }, select: { name: true } }))?.name ?? null : null;
  return {
    org,
    offers: offers.map((o) => ({ ...o, snapshotUrl: snapshots.get(o.id) ?? null, mine: reservations.filter((r) => r.offerId === o.id).reduce((a, r) => a + r.pallets, 0) })),
    reservations,
  };
}
