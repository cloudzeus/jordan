import Image from 'next/image';
import Link from 'next/link';
import { company, siteCategories, siteProducts } from '@/lib/site-catalog';
import { ArrowLink, btn, Container, Eyebrow } from '@/components/site/ui';
import { OfferShowcase } from '@/components/site/offer-showcase';
import { ProductCard } from './products/product-card';

const SERVICES = [
  { n: '01', title: 'Μελέτες', img: '/site/studies.jpg', alt: 'Κάτοψη με δείγματα ξύλου και υλικών πάνω σε γραφείο', text: 'Αρχιτεκτονικός σχεδιασμός, μελέτες εφαρμογής, επιλογή υλικών.' },
  { n: '02', title: 'Κατασκευές', img: '/site/installation.jpg', alt: 'Τεχνίτης τοποθετεί πλακίδιο δαπέδου με κόλλα', text: 'Ανακαινίσεις και νέα έργα με δικά μας συνεργεία.' },
  { n: '03', title: 'Διακόσμηση', img: '/site/still-life.jpg', alt: 'Κεραμικά βάζα και αξεσουάρ μπάνιου σε απαλούς φυσικούς τόνους', text: 'Χρώμα, υφή και φως — οι λεπτομέρειες που κάνουν τον χώρο δικό σας.' },
];

/** Κεντραρισμένη επικεφαλίδα ενότητας (εκδοτικό ύφος). */
function SectionTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="font-site mt-4 text-[length:var(--fs-28)] font-light leading-tight">{title}</h2>
      {children && <div className="mx-auto mt-5 max-w-xl text-[length:var(--fs-16)] text-[var(--s-ink-2)]">{children}</div>}
    </div>
  );
}

export default async function HomePage() {
  const [c, cats, featured] = await Promise.all([
    company(),
    siteCategories().catch(() => []),
    siteProducts({ take: 8 }).catch(() => ({ items: [], total: 0 })),
  ]);

  return (
    <>
      {/* ── Hero: φωτογραφία σε όλο το πλάτος, τίτλος από κάτω, κεντραρισμένος ── */}
      <section>
        <div className="relative h-[62vh] min-h-[360px] md:h-[78vh]">
          <Image src="/site/hero.jpg" alt="Φωτεινό σαλόνι σε σκανδιναβικό ύφος με απαλούς ουδέτερους τόνους" fill priority sizes="100vw" className="object-cover" />
        </div>
        <Container className="py-16 text-center md:py-24">
          <p className="font-num text-[length:var(--fs-20)] font-light uppercase tracking-[0.14em] text-[var(--s-ink-2)]">{c.name}</p>
          <h1 className="font-site mx-auto mt-5 max-w-4xl text-[length:var(--fs-36)] font-light leading-[1.1]">Σχεδιάζουμε, χτίζουμε και ντύνουμε χώρους για να ζείτε</h1>
          <p className="mx-auto mt-6 max-w-xl text-[length:var(--fs-18)] text-[var(--s-ink-2)]">Κατασκευές, μελέτες και διακόσμηση — με φυσική πέτρα, πλακίδια και υλικά που επιλέγουμε ένα-ένα.</p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            <Link href="/products" className={btn.primary}>Ανακαλύψτε τα υλικά</Link>
            <ArrowLink href="/#contact">Μιλήστε μαζί μας</ArrowLink>
          </div>
        </Container>
      </section>

      {/* ── Υπηρεσίες: ψηλές κάρτες, κείμενο πάνω στη φωτογραφία ── */}
      <section id="services" className="scroll-mt-28 pb-24 md:pb-32">
        <Container>
          <SectionTitle eyebrow="Τι κάνουμε" title="Από την πρώτη ιδέα ως το κλειδί στο χέρι" />
          <ul className="mt-14 grid gap-4 md:grid-cols-3 md:gap-6">
            {SERVICES.map((s) => (
              <li key={s.n}>
                <Link href="/#contact" className="group relative block aspect-[3/4] overflow-hidden bg-[var(--s-paper)]">
                  <Image src={s.img} alt={s.alt} fill sizes="(min-width: 768px) 33vw, 100vw" className="s-img object-cover" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/25 to-transparent p-6 pt-24 text-white md:p-8 md:pt-28">
                    <span className="text-[length:var(--fs-13)] tabular-nums text-white/80">{s.n}</span>
                    <h3 className="font-site mt-1 text-[length:var(--fs-24)] font-light">{s.title}</h3>
                    <p className="mt-2 max-w-xs text-[length:var(--fs-15)] text-white/90">{s.text}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* ── Banner υλικών ───────────────────────────────────── */}
      <section className="relative">
        <div className="relative h-[56vh] min-h-[340px]">
          <Image src="/site/travertine.jpg" alt="Υφή φυσικού τραβερτίνη σε ζεστούς τόνους" fill sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/15 to-transparent" />
          <Container className="relative flex h-full flex-col justify-end pb-12 text-white md:pb-16">
            <p className="font-site text-[length:var(--fs-36)] font-light uppercase leading-none tracking-[0.06em]">Φυσική πέτρα</p>
            <p className="font-site mt-2 text-[length:var(--fs-20)] font-light">Η ομορφιά που δεν αντιγράφεται</p>
            <div className="mt-8"><Link href="/products" className="inline-flex min-h-12 items-center border border-white px-6 text-[length:var(--fs-15)] font-medium transition-colors hover:bg-white hover:text-[var(--s-ink)]">Δείτε τον κατάλογο</Link></div>
          </Container>
        </div>
      </section>

      {/* ── Κατηγορίες + προϊόντα ───────────────────────────── */}
      <section className="py-24 md:py-32">
        <Container>
          <SectionTitle eyebrow="Υλικά" title="Όσα χρησιμοποιούμε στα έργα μας, διαθέσιμα και σε εσάς">
            Τιμές και διαθεσιμότητα στην περιοχή πελατών ή κατόπιν επικοινωνίας.
          </SectionTitle>
          {cats.length > 0 && (
            <nav aria-label="Κατηγορίες" className="mt-12 flex flex-wrap justify-center gap-x-8 gap-y-2">
              {cats.slice(0, 8).map((k) => (
                <Link key={k.code} href={`/products?category=${k.code}`} className="s-link inline-flex min-h-11 items-center text-[length:var(--fs-15)] text-[var(--s-ink-2)] hover:text-[var(--s-ink)]">{k.name}</Link>
              ))}
            </nav>
          )}
          {featured.items.length > 0 && (
            <>
              <ul className="mt-12 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 md:gap-x-6">
                {featured.items.map((p) => <li key={p.mtrl}><ProductCard p={p} /></li>)}
              </ul>
              <div className="mt-14 text-center"><Link href="/products" className={btn.ghost}>Όλα τα υλικά ({featured.total})</Link></div>
            </>
          )}
        </Container>
      </section>

      {/* ── Απόφθεγμα ───────────────────────────────────────── */}
      <section className="py-24 md:py-32">
        <Container>
          <blockquote className="font-site mx-auto max-w-3xl text-center text-[length:var(--fs-32)] font-light leading-tight">
            «Εσείς το ονειρεύεστε,<br />εμείς το χτίζουμε»
          </blockquote>
        </Container>
      </section>

      {/* ── Κοινά container (B2B): η 3D βιτρίνα γεμίζει ζωντανά ── */}
      <section id="container" className="scroll-mt-28 bg-[var(--s-paper)] py-24 md:py-32">
        <Container>
          <SectionTitle eyebrow="Για επαγγελματίες" title="Κοινά container — όσο γεμίζει, τόσο πέφτει η τιμή για όλους">
            Κάθε container αφορά ένα προϊόν. Κλείνετε όσες παλέτες χρειάζεστε και, με κάθε νέα κράτηση, η τιμή κατεβαίνει για όλους τους συμμετέχοντες.
          </SectionTitle>
          <div className="mt-14">
            {/* Ενδεικτικό παράδειγμα — οι πραγματικές προσφορές (με τιμές) μόνο στους παραλήπτες, στο portal. */}
            <OfferShowcase
              mode="demo"
              product={{ name: 'Τραβερτίνης Classic', code: 'Πλάκες 60×40×2 εκ.', load: 'stones', unit: 'τ.μ.', perPallet: 48, eyebrow: 'Παράδειγμα κοινού container' }}
              capacity={20} filled={0}
              tiers={[{ from: 0, value: 100, label: 'Βασική' }, { from: 6, value: 94, label: '−6%' }, { from: 11, value: 89, label: '−11%' }, { from: 16, value: 85, label: '−15%' }]}
              valueCaption="Τιμή για όλους"
              pickHref="/auth/signin"
              footnote="Ενδεικτικά νούμερα. Οι πραγματικές τιμές εμφανίζονται μετά τη σύνδεση."
            />
          </div>
          <ol className="mt-16 grid gap-8 md:grid-cols-3">
            {[
              ['Κλείνετε όσο χρειάζεστε', 'Από μισή παλέτα — πατώντας πάνω στον ελεύθερο χώρο του container.'],
              ['Η τιμή κλιμακώνεται', 'Κάθε νέα κράτηση, δική σας ή άλλου συνεργάτη, κατεβάζει την τιμή ανά τ.μ.'],
              ['Ίδια τιμή για όλους', 'Όταν κλείσει το container, όλοι πληρώνουν την ίδια, χαμηλότερη τιμή.'],
            ].map(([t, d], i) => (
              <li key={t} className="border-t border-[var(--s-ink)] pt-5">
                <span className="font-num text-[length:var(--fs-24)] font-light text-[var(--s-mute)]">0{i + 1}</span>
                <p className="mt-2 text-[length:var(--fs-16)] font-medium">{t}</p>
                <p className="mt-1 text-[length:var(--fs-15)] text-[var(--s-ink-2)]">{d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            <Link href="/auth/signin" className={btn.primary}>Είσοδος συνεργατών</Link>
            <ArrowLink href="/auth/register">Αίτημα πρόσβασης</ArrowLink>
          </div>
        </Container>
      </section>

      {/* ── Κλείσιμο: banner με κείμενο ─────────────────────── */}
      <section className="relative">
        <div className="relative h-[64vh] min-h-[380px]">
          <Image src="/site/bathroom.jpg" alt="Λιτό μπάνιο με γκρι φυσικά πλακίδια, μαύρο έπιπλο και στρογγυλό καθρέφτη" fill sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-black/35" />
          <Container className="relative flex h-full flex-col items-center justify-center text-center text-white">
            <p className="font-num text-[length:var(--fs-20)] font-light uppercase tracking-[0.14em] text-white/85">{c.name}</p>
            <h2 className="font-site mt-4 max-w-2xl text-[length:var(--fs-32)] font-light leading-tight">Ένα σπίτι στα μέτρα σας</h2>
            <div className="mt-10"><Link href="/#contact" className="inline-flex min-h-12 items-center border border-white px-6 text-[length:var(--fs-15)] font-medium transition-colors hover:bg-white hover:text-[var(--s-ink)]">Ξεκινήστε μαζί μας</Link></div>
          </Container>
        </div>
      </section>
    </>
  );
}
