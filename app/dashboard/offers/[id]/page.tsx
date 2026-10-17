import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requirePortalUser } from '@/lib/rbac';
import { portalOffer } from '@/lib/portal-data';
import { homeFor } from '@/lib/auth-home';
import { Container, Eyebrow } from '@/components/site/ui';
import { ProductPlaceholder } from '@/components/site/visuals';
import { tierColor } from '@/components/site/tier-colors';
import { PortalShell } from '../../portal-shell';
import { OfferExperience } from './offer-experience';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Προσφορά' };

const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
const num = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 2 });
const strip = (s: string) => s.toLocaleLowerCase('el').normalize('NFD').replace(/[̀-ͯ]/g, '');
const loadOf = (name: string): 'stones' | 'boxes' | 'sacks' => {
  const n = strip(name);
  if (/κολλ|τσιμεντ|κονιαμ|στοκ|αρμο|σοβα|glue|cement|mortar|grout/.test(n)) return 'sacks';
  if (/πετρ|stone|τραβερτ|travert|μαρμαρ/.test(n) && !/πλακακι|gres|porcel/.test(n)) return 'stones';
  return 'boxes';
};

/** Ενδεικτικές εφαρμογές (Adobe Stock) — όταν ανεβαίνουν φωτογραφίες έργων στο είδος, μπαίνουν αυτές πρώτες. */
const APPLICATIONS = [
  { src: '/site/apps/apartment.jpg', caption: 'Δάπεδο κατοικίας' },
  { src: '/site/bathroom.jpg', caption: 'Μπάνιο' },
  { src: '/site/apps/terrace.jpg', caption: 'Βεράντα & πέτρινοι τοίχοι' },
  { src: '/site/apps/kitchen.jpg', caption: 'Κουζίνα' },
  { src: '/site/apps/patio.jpg', caption: 'Αυλή' },
  { src: '/site/apps/stone-house.jpg', caption: 'Εξοχική κατοικία' },
];

/**
 * Η σελίδα του προϊόντος δυναμικής τιμολόγησης για πελάτη/συνεργάτη: εικόνες, εφαρμογές, τεχνικά, και
 * το ζωντανό container όπου πατάει σε ελεύθερη θέση και κάνει αίτημα κράτησης.
 */
export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePortalUser();
  const { id } = await params;
  const data = await portalOffer(user, id);
  if (!data) notFound();
  const { offer: o, product: pr, org } = data;
  const unit = o.baseUnit ?? 'τ.μ.';
  const tiers = [...o.tiers].sort((a, b) => a.fromPallets - b.fromPallets);
  const curIdx = Math.max(0, tiers.findIndex((t) => t.level === o.current?.level));
  const photos = pr?.photos ?? [];
  const hero = photos[0]?.url ?? '/site/apps/apartment.jpg';

  const specs: [string, string][] = [
    ['Κωδικός', o.code],
    ...(pr?.category?.name ? [['Κατηγορία', pr.category.name] as [string, string]] : []),
    ...(pr?.group ? [['Ομάδα', pr.group] as [string, string]] : []),
    ...(pr?.unit ? [['Μονάδα', pr.unit] as [string, string]] : []),
    ...(pr?.attributes ?? []).map((a) => [a.name, `${a.value}${a.unit ? ` ${a.unit}` : ''}`] as [string, string]),
  ];
  const logistics: [string, string][] = [
    ['Ανά παλέτα', `${num(o.sqmPerPallet)} ${unit}`],
    ['Παλέτες ανά container', num(o.capacity)],
    ['Σύνολο container', `${num(o.sqmPerContainer)} ${unit}`],
    ['Ελάχιστη παραγγελία', `${num(o.minOrder)} παλέτα`],
    ...(o.closesAt ? [['Συμμετοχή έως', new Date(o.closesAt).toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' })] as [string, string]] : []),
  ];

  return (
    <PortalShell user={user} org={org}>
      {/* ── Hero ── */}
      <section className="relative">
        <div className="relative h-[58vh] min-h-[340px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hero} alt={photos[0] ? o.name : 'Ενδεικτική εφαρμογή φυσικής πέτρας σε κατοικία'} className="size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
          <Container className="absolute inset-x-0 bottom-0 pb-10 text-white md:pb-14">
            <nav aria-label="Διαδρομή" className="text-[length:var(--fs-13)] text-white/80">
              <Link href={homeFor(user.role.key)} className="underline-offset-4 hover:underline">Προσφορές</Link> <span aria-hidden>/</span> {o.title ?? 'Κοινό container'}
            </nav>
            <h1 className="font-site mt-3 max-w-3xl text-[length:var(--fs-40)] font-light leading-tight">{o.name}</h1>
            <div className="mt-5 flex flex-wrap items-end gap-x-10 gap-y-4">
              <div>
                <p className="text-[length:var(--fs-12)] uppercase tracking-[0.18em] text-white/75">Τιμή τώρα</p>
                <p className="font-num text-[length:var(--fs-36)] font-light">{o.current ? eur(o.current.price) : '—'}<span className="font-site text-[length:var(--fs-15)] text-white/80"> / {unit}</span></p>
              </div>
              <div>
                <p className="text-[length:var(--fs-12)] uppercase tracking-[0.18em] text-white/75">Γέμισμα</p>
                <p className="font-num text-[length:var(--fs-36)] font-light">{num(o.filled)}<span className="font-site text-[length:var(--fs-15)] text-white/80"> / {num(o.capacity)} παλέτες</span></p>
              </div>
              <a href="#container" className="inline-flex min-h-12 items-center border border-white px-6 text-[length:var(--fs-15)] font-medium transition-colors hover:bg-white hover:text-[var(--s-ink)]">Κλείστε θέση στο container</a>
            </div>
          </Container>
        </div>
      </section>

      {/* ── Φωτογραφίες προϊόντος ── */}
      <section className="py-16 md:py-20">
        <Container>
          <div className="grid gap-4 md:grid-cols-4">
            {(photos.length ? photos.slice(0, 4) : [null, null, null, null]).map((ph, i) => (
              <div key={ph?.url ?? i} className={i === 0 ? 'relative aspect-square overflow-hidden bg-[var(--s-paper)] md:col-span-2 md:row-span-2' : 'relative aspect-square overflow-hidden bg-[var(--s-paper)]'}>
                {ph
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={i === 0 ? ph.url : ph.thumb} alt={`${o.name} — φωτογραφία ${i + 1}`} loading={i ? 'lazy' : undefined} className="size-full object-cover" />
                  : <ProductPlaceholder mtrl={o.mtrl + i} name={o.name} label={i === 0} />}
              </div>
            ))}
            <div className="flex flex-col justify-end md:col-span-2">
              <Eyebrow>Το προϊόν</Eyebrow>
              <p className="font-site mt-3 text-[length:var(--fs-24)] font-light leading-snug">{pr?.name2 && pr.name2 !== o.name ? pr.name2 : 'Φυσικό υλικό, επιλεγμένο παρτίδα-παρτίδα — έρχεται απευθείας με κοινό container.'}</p>
              <p className="mt-3 text-[length:var(--fs-15)] text-[var(--s-ink-2)]">Κλείνοντας μέσω του κοινού container μοιράζεστε το κόστος μεταφοράς με άλλους επαγγελματίες· όσο γεμίζει, τόσο χαμηλώνει η τιμή για όλους.</p>
            </div>
          </div>
        </Container>
      </section>

      {/* ── Το ζωντανό container ── */}
      <section id="container" className="scroll-mt-20 bg-[var(--s-paper)] py-16 md:py-24">
        <Container>
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <Eyebrow>Κοινό container</Eyebrow>
            <h2 className="font-site mt-4 text-[length:var(--fs-28)] font-light leading-tight">Πατήστε σε μια ελεύθερη θέση και κλείστε τις παλέτες σας</h2>
          </div>
          <OfferExperience
            offerId={o.id} open={o.status === 'OPEN'}
            product={{ name: o.name, code: o.code, load: loadOf(o.name), title: o.title }}
            unit={unit} perPallet={o.sqmPerPallet} capacity={o.capacity} filled={o.filled} pendingAll={o.pending}
            minOrder={o.minOrder} tiers={o.tiers} participants={o.customers} closesAt={o.closesAt}
            mine={o.mine} myPending={o.myPending}
          />
        </Container>
      </section>

      {/* ── Κλιμάκια τιμής ── */}
      <section className="py-16 md:py-20">
        <Container>
          <Eyebrow>Κλίμακα τιμής</Eyebrow>
          <ol className="mt-6 grid gap-px bg-[var(--s-line)] sm:grid-cols-2 lg:grid-cols-5">
            {tiers.map((t, i) => {
              const c = tierColor(i, tiers.length);
              const on = i === curIdx;
              return (
                <li key={t.level} className="bg-white p-5" style={on ? { boxShadow: `inset 0 3px 0 ${c}` } : undefined}>
                  <p className="text-[length:var(--fs-13)] text-[var(--s-mute)]">{i === 0 ? 'Από την αρχή' : `Από ${num(t.fromPallets)} παλέτες`}</p>
                  <p className="font-num mt-2 text-[length:var(--fs-28)] font-light" style={{ color: c }}>{eur(t.price)}</p>
                  <p className="text-[length:var(--fs-12)] text-[var(--s-mute)]">ανά {unit}{on ? ' · ισχύει τώρα' : ''}</p>
                </li>
              );
            })}
          </ol>
        </Container>
      </section>

      {/* ── Εφαρμογές ── */}
      <section className="pb-16 md:pb-24">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Εφαρμογές</Eyebrow>
              <h2 className="font-site mt-4 text-[length:var(--fs-28)] font-light">Σε σπίτια και έργα</h2>
            </div>
            <p className="text-[length:var(--fs-13)] text-[var(--s-mute)]">Ενδεικτικές φωτογραφίες εφαρμογής</p>
          </div>
          <ul className="mt-8 grid auto-rows-[220px] grid-cols-2 gap-4 md:auto-rows-[260px] md:grid-cols-4">
            {APPLICATIONS.map((a, i) => (
              <li key={a.src} className={`group relative overflow-hidden bg-[var(--s-paper)] ${i === 0 ? 'col-span-2 row-span-2' : i === 3 ? 'col-span-2' : ''}`}>
                <Image src={a.src} alt={a.caption} fill sizes={i === 0 || i === 3 ? '(min-width: 768px) 50vw, 100vw' : '(min-width: 768px) 25vw, 50vw'} className="s-img object-cover" />
                <span className="absolute bottom-0 left-0 bg-white/90 px-3 py-1.5 text-[length:var(--fs-13)]">{a.caption}</span>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* ── Τεχνικά χαρακτηριστικά ── */}
      <section className="border-t border-[var(--s-line)] py-16 md:py-20">
        <Container className="grid gap-12 md:grid-cols-2 md:gap-16">
          <div>
            <Eyebrow>Τεχνικά χαρακτηριστικά</Eyebrow>
            <dl className="mt-6 border-t border-[var(--s-line)]">
              {specs.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[10rem_1fr] gap-4 border-b border-[var(--s-line)] py-3 text-[length:var(--fs-15)]"><dt className="text-[var(--s-mute)]">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </div>
          <div>
            <Eyebrow>Συσκευασία & container</Eyebrow>
            <dl className="mt-6 border-t border-[var(--s-line)]">
              {logistics.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[10rem_1fr] gap-4 border-b border-[var(--s-line)] py-3 text-[length:var(--fs-15)]"><dt className="text-[var(--s-mute)]">{k}</dt><dd className="tabular-nums">{v}</dd></div>
              ))}
            </dl>
          </div>
        </Container>
      </section>
    </PortalShell>
  );
}
