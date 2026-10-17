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
import { cn } from '@/lib/utils';
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
 * Η σελίδα της δυναμικής προσφοράς για πελάτη/συνεργάτη: ένα ή περισσότερα προϊόντα στο ίδιο κοινό
 * container. Επιλογή προϊόντος με `?p=<id>` (καρτέλες — δουλεύουν και χωρίς JavaScript): φωτογραφίες,
 * τεχνικά και το ζωντανό container δείχνουν το επιλεγμένο· η κλίμακα τιμών όλα μαζί.
 */
export default async function OfferPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ p?: string }> }) {
  const user = await requirePortalUser();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const data = await portalOffer(user, id);
  if (!data) notFound();
  const { offer: o, products, org } = data;
  const sel = o.items.find((i) => i.id === sp.p) ?? o.items[0];
  const pr = products.find((p) => p.itemId === sel.id)?.detail ?? null;
  const unit = sel.baseUnit ?? 'τ.μ.';
  const levels = o.levels;
  const curIdx = Math.max(0, levels.findIndex((t) => t.level === o.currentLevel));
  const photos = pr?.photos ?? [];
  const hero = photos[0]?.url ?? '/site/apps/apartment.jpg';
  const multi = o.items.length > 1;

  const specs: [string, string][] = [
    ['Κωδικός', sel.code],
    ...(pr?.category?.name ? [['Κατηγορία', pr.category.name] as [string, string]] : []),
    ...(pr?.group ? [['Ομάδα', pr.group] as [string, string]] : []),
    ...(pr?.unit ? [['Μονάδα', pr.unit] as [string, string]] : []),
    ...(pr?.attributes ?? []).map((a) => [a.name, `${a.value}${a.unit ? ` ${a.unit}` : ''}`] as [string, string]),
  ];
  const logistics: [string, string][] = [
    ['Ανά παλέτα', `${num(sel.sqmPerPallet)} ${unit}`],
    ['Παλέτες ανά container', num(o.capacity)],
    ...(multi ? [['Προϊόντα στο container', String(o.items.length)] as [string, string]] : [['Σύνολο container', `${num(o.capacity * sel.sqmPerPallet)} ${unit}`] as [string, string]]),
    ['Ελάχιστη παραγγελία', `${num(o.minOrder)} παλέτα`],
    ...(o.closesAt ? [['Συμμετοχή έως', new Date(o.closesAt).toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' })] as [string, string]] : []),
  ];
  const href = (itemId: string) => `/dashboard/offers/${o.id}?p=${itemId}`;

  return (
    <PortalShell user={user} org={org}>
      {/* ── Hero ── */}
      <section className="relative">
        <div className="relative h-[58vh] min-h-[340px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hero} alt={photos[0] ? sel.name : 'Ενδεικτική εφαρμογή φυσικής πέτρας σε κατοικία'} className="size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
          <Container className="absolute inset-x-0 bottom-0 pb-10 text-white md:pb-14">
            <nav aria-label="Διαδρομή" className="text-[length:var(--fs-13)] text-white/80">
              <Link href={homeFor(user.role.key)} className="underline-offset-4 hover:underline">Προσφορές</Link> <span aria-hidden>/</span> {o.title}
            </nav>
            <h1 className="font-site mt-3 max-w-3xl text-[length:var(--fs-40)] font-light leading-tight">{multi ? o.title : sel.name}</h1>
            <div className="mt-5 flex flex-wrap items-end gap-x-10 gap-y-4">
              <div>
                <p className="text-[length:var(--fs-12)] uppercase tracking-[0.18em] text-white/75">{multi ? `Τιμή τώρα · ${sel.name}` : 'Τιμή τώρα'}</p>
                <p className="font-num text-[length:var(--fs-36)] font-light">{sel.current ? eur(sel.current.price) : '—'}<span className="font-site text-[length:var(--fs-15)] text-white/80"> / {unit}</span></p>
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

      {/* ── Επιλογή προϊόντος ── */}
      {multi && (
        <nav aria-label="Προϊόντα της προσφοράς" className="border-b border-[var(--s-line)] bg-white">
          <Container className="-mb-px flex gap-6 overflow-x-auto">
            {o.items.map((it) => (
              <Link key={it.id} href={href(it.id)} scroll={false} aria-current={it.id === sel.id ? 'page' : undefined}
                className={cn('flex min-h-14 shrink-0 items-center gap-2 border-b-2 text-[length:var(--fs-14)] transition-colors', it.id === sel.id ? 'border-[var(--s-ink)] text-[var(--s-ink)]' : 'border-transparent text-[var(--s-mute)] hover:text-[var(--s-ink)]')}>
                {it.name}
                {it.current && <span className="font-num text-[length:var(--fs-13)]" style={{ color: tierColor(curIdx, levels.length) }}>{eur(it.current.price)}</span>}
              </Link>
            ))}
          </Container>
        </nav>
      )}

      {/* ── Φωτογραφίες προϊόντος ── */}
      <section className="py-16 md:py-20">
        <Container>
          <div className="grid gap-4 md:grid-cols-4">
            {(photos.length ? photos.slice(0, 4) : [null, null, null, null]).map((ph, i) => (
              <div key={ph?.url ?? i} className={i === 0 ? 'relative aspect-square overflow-hidden bg-[var(--s-paper)] md:col-span-2 md:row-span-2' : 'relative aspect-square overflow-hidden bg-[var(--s-paper)]'}>
                {ph
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={i === 0 ? ph.url : ph.thumb} alt={`${sel.name} — φωτογραφία ${i + 1}`} loading={i ? 'lazy' : undefined} className="size-full object-cover" />
                  : <ProductPlaceholder mtrl={sel.mtrl + i} name={sel.name} label={i === 0} />}
              </div>
            ))}
            <div className="flex flex-col justify-end md:col-span-2">
              <Eyebrow>{multi ? 'Το επιλεγμένο προϊόν' : 'Το προϊόν'}</Eyebrow>
              <p className="font-site mt-3 text-[length:var(--fs-24)] font-light leading-snug">{multi ? sel.name : pr?.name2 && pr.name2 !== sel.name ? pr.name2 : 'Φυσικό υλικό, επιλεγμένο παρτίδα-παρτίδα — έρχεται απευθείας με κοινό container.'}</p>
              <p className="mt-3 text-[length:var(--fs-15)] text-[var(--s-ink-2)]">
                {multi
                  ? `Στο ίδιο container έρχονται ${o.items.length} προϊόντα. Κλείνετε παλέτες από όποιο θέλετε — κάθε παλέτα, από οποιοδήποτε προϊόν, ρίχνει τις τιμές όλων.`
                  : 'Κλείνοντας μέσω του κοινού container μοιράζεστε το κόστος μεταφοράς με άλλους επαγγελματίες· όσο γεμίζει, τόσο χαμηλώνει η τιμή για όλους.'}
              </p>
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
            offerId={o.id} open={o.status === 'OPEN'} title={o.title}
            items={o.items.map((it) => ({ id: it.id, name: it.name, code: it.code, load: loadOf(it.name), unit: it.baseUnit ?? 'τ.μ.', perPallet: it.sqmPerPallet, prices: it.prices, mine: it.mine }))}
            selectedId={sel.id}
            levels={levels} capacity={o.capacity} filled={o.filled} pendingAll={o.pending}
            minOrder={o.minOrder} participants={o.customers} closesAt={o.closesAt}
            mine={o.mine} myPending={o.myPending}
          />
        </Container>
      </section>

      {/* ── Κλιμάκια τιμής: όλα τα προϊόντα × όλα τα σημεία ── */}
      <section className="py-16 md:py-20">
        <Container>
          <Eyebrow>Κλίμακα τιμής</Eyebrow>
          <p className="mt-3 max-w-2xl text-[length:var(--fs-15)] text-[var(--s-ink-2)]">Τα σημεία είναι κοινά για όλο το container: όταν το συνολικό γέμισμα φτάσει στο σημείο, πέφτει η τιμή {multi ? 'όλων των προϊόντων' : 'του προϊόντος'} — για όλους.</p>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-[length:var(--fs-14)]">
              <thead>
                <tr>
                  <th className="border-b border-[var(--s-line)] py-3 pr-4 text-left font-normal text-[var(--s-mute)]">{multi ? 'Προϊόν' : ''}</th>
                  {levels.map((l, i) => (
                    <th key={l.level} className="border-b border-[var(--s-line)] px-3 py-3 text-right font-normal text-[var(--s-mute)]" style={i === curIdx ? { boxShadow: `inset 0 -3px 0 ${tierColor(i, levels.length)}` } : undefined}>
                      <span className="block text-[length:var(--fs-12)]">{i === 0 ? 'Από την αρχή' : `Από ${num(l.fromPallets)} παλ.`}</span>
                      {i === curIdx && <span className="block text-[length:var(--fs-12)] font-medium" style={{ color: tierColor(i, levels.length) }}>ισχύει τώρα</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {o.items.map((it) => (
                  <tr key={it.id} className={cn(it.id === sel.id && multi && 'bg-[var(--s-paper)]')}>
                    <th scope="row" className="border-b border-[var(--s-line)] py-3 pr-4 text-left font-normal">
                      {multi ? <Link href={href(it.id)} scroll={false} className="s-link">{it.name}</Link> : <span className="text-[var(--s-mute)]">ανά {it.baseUnit ?? 'τ.μ.'}</span>}
                    </th>
                    {levels.map((l, i) => (
                      <td key={l.level} className="border-b border-[var(--s-line)] px-3 py-3 text-right">
                        <span className={cn('font-num', i === curIdx ? 'text-[length:var(--fs-20)]' : 'text-[length:var(--fs-16)]')} style={{ color: tierColor(i, levels.length), opacity: i < curIdx ? 0.45 : 1 }}>{it.prices[l.level - 1] ? eur(it.prices[l.level - 1]) : '—'}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
            <Eyebrow>Τεχνικά χαρακτηριστικά{multi ? ` · ${sel.name}` : ''}</Eyebrow>
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
