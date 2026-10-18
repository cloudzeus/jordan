import Image from 'next/image';
import Link from 'next/link';
import { siteCategories, siteProducts } from '@/lib/site-catalog';
import { ATELIER_PROFILE, siteCompany } from '@/lib/site-company';
import { ArrowLink, btn, Container, Eyebrow } from '@/components/site/ui';
import { OfferShowcase } from '@/components/site/offer-showcase';
import { ProductCard } from './products/product-card';

/**
 * Αρχική — ΑΥΣΤΗΡΑ B2B. Κέντρο βάρους οι δυναμικές προσφορές κοινού container («δημοπρασία»),
 * μετά οι λειτουργίες της πύλης για πελάτες (έργα, παραγγελίες, κατάλογος). Τίποτα λιανικό.
 * Κείμενα εταιρείας: atelierdamask.gr (βλ. lib/site-company.ts).
 */

const AUCTION_POINTS = [
  ['Κλείνετε όσο χρειάζεστε', 'Από μισή παλέτα, πατώντας πάνω στον ελεύθερο χώρο του container. Το αίτημα το εγκρίνουμε εμείς.'],
  ['Η τιμή κλιμακώνεται', 'Έως οκτώ κλιμάκια τιμής: κάθε νέα κράτηση, δική σας ή άλλου επαγγελματία, κατεβάζει την τιμή ανά μονάδα.'],
  ['Ίδια τιμή για όλους', 'Όταν κλείσει το container, όλοι οι συμμετέχοντες πληρώνουν την ίδια, χαμηλότερη τιμή.'],
] as const;

const AUCTION_FACTS = [
  ['Ζωντανό γέμισμα', 'Βλέπετε σε 3D πόσο γέμισε το container και πόσες παλέτες λείπουν για την επόμενη πτώση.'],
  ['Ανώνυμη δραστηριότητα', 'Φαίνονται οι κρατήσεις και οι πτώσεις τιμής — ποτέ ποιος έκλεισε.'],
  ['Ειδοποίηση με email', 'Μόλις ανοίξει νέο container ή πέσει η τιμή σε μια προσφορά που σας αφορά.'],
  ['Πολλά προϊόντα, ένα container', 'Συνδυάζετε υλικά στο ίδιο φορτίο· το γέμισμα μετράει κοινά.'],
] as const;

const FEATURES = [
  { n: '01', title: 'Παρακολούθηση έργων', text: 'Κάθε έργο σας με την κατάστασή του, τις ημερομηνίες και όλα τα παραστατικά: παραγγελίες, δελτία, τιμολόγια και πληρωμές.' },
  { n: '02', title: 'Παραγγελίες & παραστατικά', text: 'Η πορεία κάθε παραγγελίας ως την εκτέλεση — τι παραδόθηκε, τι εκκρεμεί — με τις γραμμές και τα σύνολα της συμφωνίας σας.' },
  { n: '03', title: 'Παραγγελία από τον κατάλογο', text: 'Επιλέγετε υλικά και ποσότητες, τα συνδέετε με έργο και ημερομηνία παράδοσης. Επιβεβαιώνουμε τιμές και διαθεσιμότητα.' },
  { n: '04', title: 'Επανάληψη με ένα κλικ', text: 'Ξαναστείλτε μια παλιά παραγγελία ως νέο αίτημα, ή ζητήστε ένα υλικό απευθείας από τη σελίδα του καταλόγου.' },
] as const;

const AUDIENCE = ['Αρχιτέκτονες', 'Τεχνικά γραφεία', 'Κατασκευαστικές εταιρείες', 'Εργολάβοι & συνεργεία'];

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
    siteCompany(),
    siteCategories().catch(() => []),
    siteProducts({ take: 4 }).catch(() => ({ items: [], total: 0 })),
  ]);

  return (
    <>
      {/* ── Hero ── */}
      <section>
        <div className="relative h-[52vh] min-h-[320px] md:h-[68vh]">
          <Image src="/site/travertine.jpg" alt="Υφή φυσικού τραβερτίνη σε ζεστούς τόνους" fill priority sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
          <Container className="relative flex h-full flex-col justify-end pb-10 text-white md:pb-14">
            <p className="text-[length:var(--fs-12)] font-medium uppercase tracking-[0.18em] text-white/85">Μόνο για επαγγελματίες</p>
            <p className="font-site mt-3 max-w-xl text-[length:var(--fs-20)] font-light">{ATELIER_PROFILE.tagline}</p>
          </Container>
        </div>
        <Container className="py-16 text-center md:py-24">
          <p className="font-num text-[length:var(--fs-20)] font-light uppercase tracking-[0.14em] text-[var(--s-ink-2)]">{c.name}</p>
          <h1 className="font-site mx-auto mt-5 max-w-4xl text-[length:var(--fs-36)] font-light leading-[1.1]">Η B2B πύλη για αρχιτέκτονες, τεχνικά γραφεία και κατασκευαστές</h1>
          <p className="mx-auto mt-6 max-w-2xl text-[length:var(--fs-18)] text-[var(--s-ink-2)]">
            Κοινά container με τιμή που πέφτει όσο γεμίζουν, παρακολούθηση των έργων και των παραγγελιών σας, παραγγελίες από τον κατάλογο — σε ένα σημείο, με τα δικά σας στοιχεία.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            <Link href="/auth/signin" className={btn.primary}>Είσοδος επαγγελματιών</Link>
            <ArrowLink href="/auth/register">Αίτημα πρόσβασης</ArrowLink>
          </div>
          <ul className="mx-auto mt-14 flex max-w-3xl flex-wrap justify-center gap-x-8 gap-y-2 text-[length:var(--fs-14)] text-[var(--s-ink-2)]">
            {AUDIENCE.map((a) => <li key={a} className="flex items-center gap-2"><span aria-hidden className="size-1 rounded-full bg-[var(--s-ink)]" />{a}</li>)}
          </ul>
        </Container>
      </section>

      {/* ── Δυναμικές προσφορές: το κέντρο της πύλης ── */}
      <section id="auctions" className="scroll-mt-28 bg-[var(--s-paper)] py-24 md:py-32">
        <Container>
          <SectionTitle eyebrow="Δυναμικές προσφορές" title="Κοινό container — όσο γεμίζει, τόσο πέφτει η τιμή για όλους">
            Ένα container, ένα ή περισσότερα υλικά, μια ανοιχτή «δημοπρασία» προς τα κάτω. Κλείνετε όσες παλέτες χρειάζεστε και, με κάθε νέα κράτηση, η τιμή κατεβαίνει για όλους τους συμμετέχοντες.
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
              footnote="Ενδεικτικά νούμερα. Οι πραγματικές τιμές εμφανίζονται μετά τη σύνδεση, μόνο σε όσους λαμβάνουν την προσφορά."
            />
          </div>
          <ol className="mt-16 grid gap-8 md:grid-cols-3">
            {AUCTION_POINTS.map(([t, d], i) => (
              <li key={t} className="border-t border-[var(--s-ink)] pt-5">
                <span className="font-num text-[length:var(--fs-24)] font-light text-[var(--s-mute)]">0{i + 1}</span>
                <p className="mt-2 text-[length:var(--fs-16)] font-medium">{t}</p>
                <p className="mt-1 text-[length:var(--fs-15)] text-[var(--s-ink-2)]">{d}</p>
              </li>
            ))}
          </ol>
          <dl className="mt-16 grid gap-x-10 gap-y-8 border-t border-[var(--s-line)] pt-10 sm:grid-cols-2 lg:grid-cols-4">
            {AUCTION_FACTS.map(([t, d]) => (
              <div key={t}>
                <dt className="text-[length:var(--fs-15)] font-medium">{t}</dt>
                <dd className="mt-1 text-[length:var(--fs-14)] text-[var(--s-ink-2)]">{d}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            <Link href="/auth/signin" className={btn.primary}>Δείτε τις ανοιχτές προσφορές</Link>
            <ArrowLink href="/auth/register">Δεν έχετε λογαριασμό;</ArrowLink>
          </div>
        </Container>
      </section>

      {/* ── Λειτουργίες B2B για πελάτες ── */}
      <section id="b2b" className="scroll-mt-28 py-24 md:py-32">
        <Container>
          <SectionTitle eyebrow="Για πελάτες" title="Τα έργα και οι παραγγελίες σας, πάντα ενημερωμένα">
            Η περιοχή πελάτη συνδέεται απευθείας με το εμπορικό μας σύστημα: βλέπετε ό,τι βλέπουμε κι εμείς για τα δικά σας έργα — και τίποτα που αφορά άλλους.
          </SectionTitle>
          <ul className="mt-14 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <li key={f.n} className="border-t border-[var(--s-ink)] pt-5">
                <span className="font-num text-[length:var(--fs-24)] font-light text-[var(--s-mute)]">{f.n}</span>
                <h3 className="font-site mt-2 text-[length:var(--fs-20)] font-light">{f.title}</h3>
                <p className="mt-2 text-[length:var(--fs-15)] text-[var(--s-ink-2)]">{f.text}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* ── Πώς αποκτάτε πρόσβαση ── */}
      <section className="border-y border-[var(--s-line)] py-20 md:py-24">
        <Container className="grid gap-12 md:grid-cols-[1fr_1.4fr] md:items-start">
          <div>
            <Eyebrow>Πρόσβαση</Eyebrow>
            <h2 className="font-site mt-4 text-[length:var(--fs-28)] font-light leading-tight">Ο λογαριασμός ανοίγει μόνο για επαγγελματίες</h2>
            <p className="mt-4 text-[length:var(--fs-16)] text-[var(--s-ink-2)]">Κάθε χρήστης δένεται με την καρτέλα της εταιρείας του στο σύστημά μας — έτσι βλέπει μόνο τις δικές του τιμές, προσφορές, έργα και παραστατικά.</p>
          </div>
          <ol className="grid gap-8 sm:grid-cols-3">
            {[
              ['Αίτημα πρόσβασης', 'Συμπληρώνετε επωνυμία, ΑΦΜ και στοιχεία επικοινωνίας.'],
              ['Ενεργοποίηση', 'Σας συνδέουμε με την καρτέλα πελάτη ή συνεργάτη, συνήθως μέσα σε μία εργάσιμη.'],
              ['Είσοδος', 'Με email και κωδικό ή με κωδικό μίας χρήσης στο email σας.'],
            ].map(([t, d], i) => (
              <li key={t}>
                <span className="font-num text-[length:var(--fs-24)] font-light text-[var(--s-mute)]">0{i + 1}</span>
                <p className="mt-2 text-[length:var(--fs-16)] font-medium">{t}</p>
                <p className="mt-1 text-[length:var(--fs-15)] text-[var(--s-ink-2)]">{d}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* ── Κατάλογος για επαγγελματίες (χωρίς τιμές) ── */}
      <section className="py-24 md:py-32">
        <Container>
          <SectionTitle eyebrow="Κατάλογος" title="Υλικά για το έργο σας">
            Φυσικά πέτρινα δάπεδα, τσιμεντοκονίες, ασβεστοχρώματα, πλακίδια, ψηφίδες και υλικά τοποθέτησης. Τιμές και διαθεσιμότητα μόνο στην περιοχή πελατών.
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
              <div className="mt-14 text-center"><Link href="/products" className={btn.ghost}>Όλος ο κατάλογος ({featured.total})</Link></div>
            </>
          )}
        </Container>
      </section>

      {/* ── Το atelier: ραντεβού για επαγγελματίες ── */}
      <section className="relative">
        <div className="relative h-[60vh] min-h-[380px]">
          <Image src="/site/studies.jpg" alt="Κάτοψη με δείγματα ξύλου και υλικών πάνω σε γραφείο" fill sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-black/45" />
          <Container className="relative flex h-full flex-col items-center justify-center text-center text-white">
            <p className="text-[length:var(--fs-12)] font-medium uppercase tracking-[0.18em] text-white/85">Touch & Feel · {ATELIER_PROFILE.yearsOfExperience}+ χρόνια εμπειρίας</p>
            <h2 className="font-site mt-4 max-w-2xl text-[length:var(--fs-32)] font-light leading-tight">Δείτε και αγγίξτε τα υλικά σε πραγματική κλίμακα</h2>
            <p className="mt-4 max-w-xl text-[length:var(--fs-16)] text-white/90">Εκθεσιακές επιφάνειες, εργαστήριο δειγμάτων και mock-ups, meeting room για mood boards — με προμετρήσεις, κοστολόγια και χρονοδιαγράμματα για το έργο σας.</p>
            <p className="mt-6 text-[length:var(--fs-14)] uppercase tracking-[0.12em] text-white/85">{c.hours}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <a href={`mailto:${c.salesEmail}?subject=${encodeURIComponent('Ραντεβού στο atelier')}`} className="inline-flex min-h-12 items-center border border-white px-6 text-[length:var(--fs-15)] font-medium transition-colors hover:bg-white hover:text-[var(--s-ink)]">Κλείστε ραντεβού</a>
              <a href={`tel:${c.phones[0].replace(/\s/g, '')}`} className="inline-flex min-h-12 items-center px-6 text-[length:var(--fs-15)] font-medium tabular-nums underline-offset-4 hover:underline">{c.phones[0]}</a>
            </div>
          </Container>
        </div>
      </section>
    </>
  );
}
