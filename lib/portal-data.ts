import 'server-only';
import { prisma } from '@/lib/db';
import { bookerOf, listOffers, type Booker } from '@/lib/container-offers';
import { siteProduct } from '@/lib/site-catalog';

type PortalUser = { customerTrdr: number | null; partnerId: string | null };

const recipientWhere = (b: Booker) => (b.trdr != null ? { kind: 'CUSTOMER', refId: String(b.trdr) } : { kind: 'PARTNER', refId: b.partnerId! });
const mineWhere = (b: Booker) => (b.trdr != null ? { trdr: b.trdr } : { partnerId: b.partnerId });

async function orgName(b: Booker) {
  return b.trdr != null
    ? (await prisma.softoneTrader.findUnique({ where: { trdr: b.trdr }, select: { name: true } }))?.name ?? null
    : (await prisma.partner.findUnique({ where: { id: b.partnerId! }, select: { name: true } }))?.name ?? null;
}

/**
 * Τι βλέπει ένας χρήστης του portal: ΜΟΝΟ τις δυναμικές προσφορές που του στάλθηκαν (παραλήπτης ο
 * πελάτης ή ο συνεργάτης του), με τις δικές του κρατήσεις (ενεργές) και τα εκκρεμή αιτήματά του.
 */
export async function portalData(user: PortalUser) {
  const b = bookerOf(user);
  if (!b) return { org: null, offers: [] };
  const ids = new Set((await prisma.offerRecipient.findMany({ where: recipientWhere(b), select: { offerId: true } })).map((r) => r.offerId));
  const offers = (await listOffers()).filter((o) => ids.has(o.id) && (o.status === 'OPEN' || o.status === 'CLOSED'));
  const offerIds = offers.map((o) => o.id);
  const [snapshots, mine, org, photos] = await Promise.all([
    prisma.containerOffer.findMany({ where: { id: { in: offerIds } }, select: { id: true, snapshotUrl: true } }),
    prisma.containerReservation.findMany({ where: { ...mineWhere(b), offerId: { in: offerIds }, status: { in: ['ACTIVE', 'PENDING'] } }, select: { id: true, offerId: true, pallets: true, status: true, createdAt: true } }),
    orgName(b),
    prisma.itemMedia.findMany({ where: { mtrl: { in: offers.map((o) => o.mtrl) }, kind: 'IMAGE' }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], select: { mtrl: true, thumbUrl: true, publicUrl: true } }),
  ]);
  const snap = new Map(snapshots.map((o) => [o.id, o.snapshotUrl]));
  const photo = new Map<number, string>();
  for (const p of photos) if (!photo.has(p.mtrl)) photo.set(p.mtrl, p.thumbUrl ?? p.publicUrl);
  return {
    org,
    offers: offers.map((o) => {
      const my = mine.filter((r) => r.offerId === o.id);
      return {
        ...o,
        snapshotUrl: snap.get(o.id) ?? null,
        photo: photo.get(o.mtrl) ?? null,
        mine: my.filter((r) => r.status === 'ACTIVE').reduce((a, r) => a + r.pallets, 0),
        myPending: my.filter((r) => r.status === 'PENDING').map((r) => ({ id: r.id, pallets: r.pallets, createdAt: r.createdAt.toISOString() })),
      };
    }),
  };
}

/** Μία προσφορά για τη σελίδα του προϊόντος — null αν ο χρήστης δεν είναι παραλήπτης. */
export async function portalOffer(user: PortalUser, offerId: string) {
  const data = await portalData(user);
  const offer = data.offers.find((o) => o.id === offerId);
  if (!offer) return null;
  const product = await siteProduct(offer.mtrl);
  return { org: data.org, offer, product };
}

export type PortalOffer = Awaited<ReturnType<typeof portalData>>['offers'][number];
