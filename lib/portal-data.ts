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
    prisma.containerReservation.findMany({ where: { ...mineWhere(b), offerId: { in: offerIds }, status: { in: ['ACTIVE', 'PENDING'] } }, select: { id: true, offerId: true, offerItemId: true, pallets: true, status: true, createdAt: true } }),
    orgName(b),
    prisma.itemMedia.findMany({ where: { mtrl: { in: offers.flatMap((o) => o.items.map((i) => i.mtrl)) }, kind: 'IMAGE', isInstallSample: false }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], select: { mtrl: true, thumbUrl: true, publicUrl: true } }),
  ]);
  const snap = new Map(snapshots.map((o) => [o.id, o.snapshotUrl]));
  const photo = new Map<number, string>();
  for (const p of photos) if (!photo.has(p.mtrl)) photo.set(p.mtrl, p.thumbUrl ?? p.publicUrl);
  return {
    org,
    offers: offers.map((o) => {
      const my = mine.filter((r) => r.offerId === o.id);
      const active = (itemId?: string) => my.filter((r) => r.status === 'ACTIVE' && (!itemId || r.offerItemId === itemId)).reduce((a, r) => a + r.pallets, 0);
      const items = o.items.map((i) => ({ ...i, photo: photo.get(i.mtrl) ?? null, mine: active(i.id) }));
      return {
        ...o,
        items,
        snapshotUrl: snap.get(o.id) ?? null,
        photo: items.find((i) => i.photo)?.photo ?? null,
        mine: active(),
        myPending: my.filter((r) => r.status === 'PENDING').map((r) => ({
          id: r.id, offerItemId: r.offerItemId, product: o.items.find((i) => i.id === r.offerItemId)?.name ?? '', pallets: r.pallets, createdAt: r.createdAt.toISOString(),
        })),
      };
    }),
  };
}

/** Μία προσφορά για τη σελίδα του προϊόντος — null αν ο χρήστης δεν είναι παραλήπτης. */
export async function portalOffer(user: PortalUser, offerId: string) {
  const data = await portalData(user);
  const offer = data.offers.find((o) => o.id === offerId);
  if (!offer) return null;
  // Λεπτομέρειες καταλόγου (φωτογραφίες, χαρακτηριστικά) για ΚΑΘΕ προϊόν της προσφοράς.
  const [products, active, media] = await Promise.all([
    Promise.all(offer.items.map((i) => siteProduct(i.mtrl))),
    // Δραστηριότητα «δημοπρασίας» — ΑΝΩΝΥΜΑ: μόνο παλέτες, προϊόν, χρόνος (ποτέ ποιος).
    prisma.containerReservation.findMany({
      where: { offerId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { pallets: true, offerItemId: true, createdAt: true, decidedAt: true },
    }),
    // Όλα τα media των προϊόντων (φωτογραφίες, βίντεο, πανοράματα) για το modal προϊόντος.
    prisma.itemMedia.findMany({
      where: { mtrl: { in: offer.items.map((i) => i.mtrl) }, kind: { not: 'DOCUMENT' }, isInstallSample: false },
      orderBy: [{ isPrimary: 'desc' }, { order: 'asc' }, { createdAt: 'asc' }],
      select: { mtrl: true, kind: true, publicUrl: true, thumbUrl: true, title: true, mimeType: true },
    }),
  ]);
  const mediaOf = (mtrl: number) => media.filter((m) => m.mtrl === mtrl).map((m) => ({ kind: m.kind, url: m.publicUrl, thumb: m.thumbUrl ?? null, title: m.title ?? null, mime: m.mimeType }));
  // Χρονολογικά με σωρευτικό γέμισμα → πού πέρασε κλιμάκιο («η τιμή έπεσε»).
  let cum = 0;
  const levels = [...offer.levels].sort((a, b) => a.fromPallets - b.fromPallets);
  const levelAt = (f: number) => levels.reduce((acc, l, i) => (f + 1e-9 >= l.fromPallets ? i : acc), 0);
  const activity = active
    .map((r) => ({ ...r, at: r.decidedAt ?? r.createdAt }))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((r) => {
      const before = levelAt(cum);
      cum += r.pallets;
      const after = levelAt(cum);
      return {
        at: r.at.toISOString(), pallets: r.pallets,
        product: offer.items.find((i) => i.id === r.offerItemId)?.name ?? null,
        dropTo: after > before ? levels[after].level : null,
      };
    })
    .reverse()
    .slice(0, 8);
  return { org: data.org, offer, activity, products: offer.items.map((i, k) => ({ itemId: i.id, detail: products[k], media: mediaOf(i.mtrl) })) };
}

export type PortalOffer = Awaited<ReturnType<typeof portalData>>['offers'][number];
