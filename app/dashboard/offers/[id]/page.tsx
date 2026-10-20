import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requirePortalUser } from '@/lib/rbac';
import { portalOffer } from '@/lib/portal-data';
import { homeFor } from '@/lib/auth-home';
import { PortalShell } from '../../portal-shell';
import { AuctionStage } from './auction-stage';
import { MyPayments } from './my-payments';
import type { AuctionItem, MediaItem } from './auction-shared';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Κοινό container' };

const strip = (s: string) => s.toLocaleLowerCase('el').normalize('NFD').replace(/[̀-ͯ]/g, '');
const loadOf = (name: string): 'stones' | 'boxes' | 'sacks' => {
  const n = strip(name);
  if (/κολλ|τσιμεντ|κονιαμ|στοκ|αρμο|σοβα|glue|cement|mortar|grout/.test(n)) return 'sacks';
  if (/πετρ|stone|τραβερτ|travert|μαρμαρ/.test(n) && !/πλακακι|gres|porcel/.test(n)) return 'stones';
  return 'boxes';
};

/**
 * Η «δημοπρασία» ενός κοινού container για πελάτη/συνεργάτη: πρωταγωνιστής το container και η ζωντανή
 * τιμή· κάθε προϊόν ανοίγει modal με φωτογραφίες, βίντεο, εφαρμογές και τεχνικά. `?p=<id>` = επιλεγμένο προϊόν.
 */
export default async function OfferPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ p?: string }> }) {
  const user = await requirePortalUser();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const data = await portalOffer(user, id);
  if (!data) notFound();
  const { offer: o, products, org, activity, itemPallets } = data;

  const items: AuctionItem[] = o.items.map((it) => {
    const pr = products.find((p) => p.itemId === it.id);
    const d = pr?.detail ?? null;
    return {
      id: it.id, mtrl: it.mtrl, name: it.name, code: it.code, load: loadOf(it.name),
      unit: it.baseUnit ?? 'τ.μ.', perPallet: it.sqmPerPallet, prices: it.prices, mine: it.mine, active: itemPallets[it.id] ?? 0,
      detail: {
        name2: d?.name2 ?? null, category: d?.category?.name ?? null, group: d?.group ?? null, unitName: d?.unit ?? null,
        attributes: (d?.attributes ?? []).map((a) => ({ name: a.name, value: a.value, unit: a.unit ?? null })),
        media: (pr?.media ?? []) as MediaItem[],
      },
    };
  });
  const initial = items.find((i) => i.id === sp.p)?.id ?? items[0].id;

  return (
    <PortalShell user={user} org={org}>
      <MyPayments offerId={o.id} user={user} />
      <AuctionStage
        offerId={o.id} title={o.title} open={o.status === 'OPEN'} homeHref={homeFor(user.role.key)}
        items={items} initialItemId={initial}
        levels={o.levels} capacity={o.capacity} filled={o.filled} pendingAll={o.pending} minOrder={o.minOrder}
        participants={o.customers} closesAt={o.closesAt} mine={o.mine} myPending={o.myPending} activity={activity}
      />
    </PortalShell>
  );
}
