import Image from 'next/image';
import Link from 'next/link';
import { FiArrowRight, FiArrowDown } from 'react-icons/fi';
import { siteCategories } from '@/lib/site-catalog';
import { ATELIER_PROFILE, siteCompany } from '@/lib/site-company';
import { AuctionStory } from '@/components/site/auction-story';
import { PortalShowcase } from '@/components/site/portal-showcase';
import { HeroLive } from '@/components/site/hero-live';
import { CropMarks, DimLine, DimLineV, Grid, SectionMark } from '@/components/site/blueprint';

/**
 * Αρχική — ΑΥΣΤΗΡΑ B2B, εκδοτική: βίντεο του showroom, γιγάντια serif τυπογραφία, αρχιτεκτονικά
 * στοιχεία σχεδίου (κότες, σημάδια κοπής, τομές), 3D container, κίνηση GSAP (components/site/motion.tsx).
 * Υλικό (λογότυπο, φωτογραφίες, βίντεο): atelierdamask.gr. Κείμενα εταιρείας: lib/site-company.ts.
 */

const TICKER = ['Τραβερτίνης Classic · −11%', 'Limestone Moca · 14/20 παλέτες', 'Τσιμεντοκονία Base · επόμενη πτώση σε 2 παλ.', 'Ασβεστοκονία Pietra · νέο container', 'Ψηφίδα Carrara · −6%'];

const GALLERY = [
  { img: '/site/brand/floor.jpg', t: 'Φυσικά πέτρινα δάπεδα', s: 'Σε πραγματική κλίμακα, με γυμνό πόδι, στεγνά και βρεγμένα.', dim: '600 × 400 × 20' },
  { img: '/site/brand/lab.jpg', t: 'Ασβεστοχρώματα & τσιμεντοκονίες', s: 'Custom δείγματα χρώματος και υφής στο εργαστήριο.', dim: 'RAL · NCS · custom' },
  { img: '/site/apps/stone-house.jpg', t: 'Πέτρα στο κέλυφος', s: 'Επενδύσεις, κλώστρα, όψεις που γερνούν όμορφα.', dim: 'Ø 1:50' },
  { img: '/site/brand/velvet.jpg', t: 'Touch & Feel', s: 'Δοκιμή αντιολισθηρότητας και αφής πριν την επιλογή.', dim: 'R10 · R11 · R12' },
  { img: '/site/apps/kitchen.jpg', t: 'Κουζίνα & μπάνιο', s: 'Πλακίδια, ψηφίδες και επιφάνειες για υγρούς χώρους.', dim: '1:20 λεπτομέρεια' },
  { img: '/site/apps/terrace.jpg', t: 'Εξωτερικοί χώροι', s: 'Βεράντες, αίθρια, πισίνες — υλικά για τον ήλιο.', dim: '+0.00 / −0.15' },
];

const ROLES = [
  { k: 'A', img: '/site/brand/lab.jpg', t: 'Αρχιτέκτονες', items: ['Υλικά, κοστολόγια και χρονοδιαγράμματα για κάθε έργο', 'Mood boards και mock-ups στο atelier', 'Παρακολούθηση παραγγελιών ανά έργο'] },
  { k: 'B', img: '/site/brand/velvet.jpg', t: 'Διακοσμητές & designers', items: ['Δείγματα χρώματος και υφής κατά παραγγελία', 'Συνδυασμοί υλικών σε μεγάλες επιφάνειες', 'Δυναμικές τιμές σε premium υλικά'] },
  { k: 'C', img: '/site/brand/floor.jpg', t: 'Κατασκευαστές & εργολάβοι', items: ['Κοινά container: φθηνότερα, όσο γεμίζουν', 'Παραγγελία από το εργοτάξιο, από το κινητό', 'Δελτία και τιμολόγια πάντα διαθέσιμα'] },
];

export default async function HomePage() {
  const [c, cats] = await Promise.all([siteCompany(), siteCategories().catch(() => [])]);

  return (
    <>
      {/* ═══ HERO: βίντεο showroom + γιγάντια τυπογραφία + ζωντανό 3D container ═══ */}
      <section className="relative isolate -mt-16 min-h-[100svh] overflow-hidden bg-[#0B1620] text-white md:-mt-20">
        <div className="absolute inset-0 -z-10">
          <video className="size-full object-cover" src="/site/brand/showroom.mp4" poster="/site/brand/showroom.jpg" autoPlay muted loop playsInline preload="metadata" aria-hidden />
          <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(11,22,32,0.92)_0%,rgba(11,22,32,0.72)_45%,rgba(11,22,32,0.25)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#0B1620] to-transparent" />
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#0B1620]/80 to-transparent" />
        </div>
        <Grid color="#ffffff" opacity={0.05} />

        <div className="mx-auto grid min-h-[100svh] w-full max-w-[1440px] items-center gap-12 px-5 pb-28 pt-28 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:px-12">
          <div className="min-w-0">
            <p className="s-rise s-kicker text-[#D6B796]">B2B πύλη · μόνο για επαγγελματίες</p>
            <h1 style={{ ["--d" as string]: "0.1s" }} className="s-rise font-display mt-6 text-[length:var(--fs-56)] lg:text-[length:var(--fs-72)] xl:text-[length:var(--fs-96)]">
              Εκεί που η αρχιτεκτονική <em className="text-[#E8D5BF]">βρίσκει</em> τα υλικά της.
            </h1>
            <DimLine label="1 : 1 — ΠΡΑΓΜΑΤΙΚΗ ΚΛΙΜΑΚΑ" className="mt-8 max-w-xl text-white/55" />
            <p style={{ ["--d" as string]: "0.3s" }} className="s-rise mt-8 max-w-xl text-[length:var(--fs-18)] leading-relaxed text-white/80">
              Φυσικά δομικά υλικά και αρχιτεκτονικά τελειώματα για αρχιτέκτονες, διακοσμητές και κατασκευαστές — με κοινά container που γίνονται φθηνότερα όσο γεμίζουν.
            </p>
            <div style={{ ["--d" as string]: "0.4s" }} className="s-rise mt-10 flex flex-wrap items-center gap-4">
              <Link href="/auth/signin" className="group inline-flex min-h-14 items-center gap-3 bg-white px-7 text-[length:var(--fs-16)] font-medium text-[#0B1620] transition-colors hover:bg-[#E8D5BF]">
                Είσοδος επαγγελματιών <FiArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </Link>
              <Link href="/auth/register" className="inline-flex min-h-14 items-center border border-white/50 px-7 text-[length:var(--fs-16)] font-medium transition-colors hover:border-white hover:bg-white/10">Αίτημα πρόσβασης</Link>
            </div>
            <ul style={{ ["--d" as string]: "0.5s" }} className="s-rise mt-10 flex flex-wrap gap-x-8 gap-y-2 text-[length:var(--fs-13)] text-white/70">
              {['27+ χρόνια εμπειρίας', 'Showroom 1 : 1 στην Αθήνα', 'Τεχνική υποστήριξη & κοστολόγια'].map((t) => <li key={t} className="flex items-center gap-2"><span className="size-1 rounded-full bg-[#D6B796]" aria-hidden />{t}</li>)}
            </ul>
          </div>
          <div style={{ ["--d" as string]: "0.25s" }} className="s-rise min-w-0">
            <HeroLive />
            <p className="mt-4 text-[length:var(--fs-12)] text-white/55">Ενδεικτικό παράδειγμα · οι πραγματικές τιμές εμφανίζονται μετά τη σύνδεση</p>
          </div>
        </div>

        {/* Ταινία «ζωντανών» προσφορών */}
        <div className="absolute inset-x-0 bottom-0 border-t border-white/15 bg-[#0B1620]/75">
          <div className="flex overflow-hidden py-3" aria-hidden>
            <div className="s-marquee flex shrink-0 gap-12 whitespace-nowrap pr-12 text-[length:var(--fs-13)] uppercase tracking-[0.18em] text-white/70">
              {[...TICKER, ...TICKER].map((t, i) => <span key={i} className="flex items-center gap-3"><span className="size-1.5 rounded-full bg-[#BEF264]" />{t}</span>)}
            </div>
          </div>
        </div>
        <a href="#manifesto" className="absolute bottom-16 right-5 hidden items-center gap-2 text-[length:var(--fs-12)] uppercase tracking-[0.2em] text-white/70 hover:text-white sm:flex lg:right-12" aria-label="Κύλιση στο περιεχόμενο">
          Scroll <FiArrowDown className="size-4 animate-bounce motion-reduce:animate-none" aria-hidden />
        </a>
      </section>

      {/* ═══ ΜΑΝΙΦΕΣΤΟ: οι λέξεις φωτίζονται με την κύλιση ═══ */}
      <section id="manifesto" className="relative scroll-mt-20 overflow-hidden bg-[var(--s-paper)] py-24 md:py-36">
        <Grid />
        <div className="relative mx-auto grid w-full max-w-[1440px] gap-16 px-5 sm:px-8 lg:grid-cols-[auto_minmax(0,1fr)] lg:px-12">
          <DimLineV label="ATELIER · ΑΘΗΝΑ" className="hidden h-[26rem] text-[var(--s-mute)] lg:flex" />
          <div>
            <p className="s-kicker text-[var(--s-accent)]">{ATELIER_PROFILE.brand}</p>
            <p data-scrub-words className="font-display mt-8 max-w-5xl text-[length:var(--fs-40)] leading-[1.12] md:text-[length:var(--fs-56)]">
              Δεν είμαστε απλώς μια εταιρεία υλικών. Είμαστε το <em>εργαστήριο</em> του αρχιτέκτονα — υλικά, κοστολόγια, τεχνική υποστήριξη και χρονοδιαγράμματα, για ένα αποτέλεσμα εγγυημένο σε χρόνο και κόστος.
            </p>
            <dl data-reveal data-stagger className="mt-16 grid grid-cols-2 gap-x-8 gap-y-10 border-t border-[var(--s-ink)] pt-10 md:grid-cols-4">
              {[
                [String(ATELIER_PROFILE.yearsOfExperience), '+', 'χρόνια γνώσης & εμπειρίας'],
                ['8', '', 'κλιμάκια τιμής σε κάθε κοινό container'],
                ['1', ':1', 'δείγματα σε πραγματική κλίμακα'],
                ['100', '%', 'εξυπηρέτηση με ραντεβού'],
              ].map(([n, suf, l]) => (
                <div key={l}>
                  <dt className="font-display text-[length:var(--fs-72)] leading-none"><span data-count={n}>{n}</span>{suf}</dt>
                  <dd className="mt-3 max-w-[14rem] text-[length:var(--fs-14)] text-[var(--s-ink-2)]">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ═══ Η ΙΔΕΑ ΣΕ ΒΙΝΤΕΟ (Remotion) ═══ */}
      <section className="relative overflow-hidden bg-[#0B1620] text-white" aria-labelledby="film-title">
        <Grid color="#ffffff" opacity={0.05} />
        <div className="relative mx-auto grid w-full max-w-[1440px] items-center gap-12 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:px-12">
          <div>
            <p className="s-kicker text-[#D6B796]">Δυναμικές προσφορές</p>
            <h2 id="film-title" data-split className="font-display mt-5 text-[length:var(--fs-48)] lg:text-[length:var(--fs-64)]">Η ιδέα, σε <em className="text-[#E8D5BF]">δώδεκα</em> δευτερόλεπτα.</h2>
            <p data-reveal className="mt-6 max-w-md text-[length:var(--fs-18)] leading-relaxed text-white/75">Ένα κοινό container, πολλοί επαγγελματίες, μία τιμή που πέφτει για όλους με κάθε νέα κράτηση. Παρακάτω, βήμα-βήμα, καθώς κυλάτε.</p>
            <ul data-reveal data-stagger className="mt-8 grid grid-cols-3 gap-px bg-white/15 text-center">
              {[['20', 'παλέτες'], ['4', 'κλιμάκια'], ['−15%', 'για όλους']].map(([n, l]) => (
                <li key={l} className="bg-[#0B1620] px-2 py-4"><span className="font-display block text-[length:var(--fs-32)]">{n}</span><span className="text-[length:var(--fs-12)] uppercase tracking-[0.16em] text-white/60">{l}</span></li>
              ))}
            </ul>
          </div>
          <figure data-reveal="40" className="relative">
            <div className="relative overflow-hidden bg-black shadow-[0_50px_120px_-40px_rgba(0,0,0,0.8)]">
              <video className="hidden aspect-video w-full md:block" poster="/site/brand/offer-16x9.jpg" autoPlay muted loop playsInline preload="none" aria-label="Βίντεο: πώς λειτουργεί μια δυναμική προσφορά">
                <source src="/site/brand/offer-16x9.webm" type="video/webm" />
                <source src="/site/brand/offer-16x9.mp4" type="video/mp4" />
              </video>
              <video className="mx-auto aspect-[9/16] w-full max-w-sm md:hidden" poster="/site/brand/offer-9x16.jpg" autoPlay muted loop playsInline preload="none" aria-label="Βίντεο: πώς λειτουργεί μια δυναμική προσφορά">
                <source src="/site/brand/offer-9x16.webm" type="video/webm" />
                <source src="/site/brand/offer-9x16.mp4" type="video/mp4" />
              </video>
            </div>
            <CropMarks className="text-white/40" size={22} />
            <DimLine label="ΚΟΙΝΟ CONTAINER · 20 ΠΑΛΕΤΕΣ · ΕΝΔΕΙΚΤΙΚΑ" className="mt-5 text-white/45" />
          </figure>
        </div>
      </section>

      {/* ═══ ΔΥΝΑΜΙΚΕΣ ΠΡΟΣΦΟΡΕΣ: η δημοπρασία σε μία κύλιση ═══ */}
      <section id="auctions" className="scroll-mt-20" aria-label="Δυναμικές προσφορές">
        <AuctionStory product="Τραβερτίνης Classic" capacity={20} tiers={[{ from: 0, price: 48 }, { from: 6, price: 45.1 }, { from: 11, price: 42.7 }, { from: 16, price: 40.8 }]} />
      </section>
      {/* ═══ Η ΠΥΛΗ: οθόνες προϊόντος σε προοπτική ═══ */}
      <section id="b2b" className="scroll-mt-20" aria-label="Λειτουργίες της πύλης">
        <PortalShowcase />
      </section>

      {/* ═══ ΥΛΙΚΑ ΣΕ ΕΦΑΡΜΟΓΗ: οριζόντια γκαλερί ═══ */}
      <section aria-labelledby="gallery-title" className="bg-white">
        <div data-hscroll className="relative">
         <div className="overflow-x-clip lg:sticky lg:top-20 lg:flex lg:h-[calc(100dvh-5rem)] lg:flex-col lg:justify-center">
          <div className="mx-auto w-full max-w-[1440px] px-5 pt-24 sm:px-8 lg:px-12 lg:pt-0">
            <p className="s-kicker text-[var(--s-accent)]">Υλικά σε εφαρμογή</p>
            <h2 id="gallery-title" data-split className="font-display mt-4 max-w-4xl text-[length:var(--fs-48)]">Δείτε, αγγίξτε, <em>αποφασίστε</em> με σιγουριά.</h2>
          </div>
          <div data-track className="mt-12 flex snap-x snap-mandatory gap-6 overflow-x-auto px-5 pb-24 sm:px-8 lg:mt-8 lg:w-max lg:snap-none lg:overflow-visible lg:px-12 lg:pb-0">
            {GALLERY.map((g, i) => (
              <figure key={g.t} className="group relative w-[78vw] shrink-0 snap-start sm:w-[52vw] lg:w-[calc(54vh*0.8)]">
                <div data-velocity className="relative aspect-[4/5] origin-center overflow-hidden bg-[var(--s-paper)]">
                  <Image src={g.img} alt={g.t} fill sizes="(min-width: 1024px) 30rem, 78vw" className="s-img object-cover" />
                  <span className="absolute left-4 top-4 bg-white/90 px-2 py-1 text-[length:var(--fs-12)] uppercase tracking-[0.18em] text-[var(--s-ink)]">Φ. 0{i + 1}</span>
                </div>
                <CropMarks className="text-[var(--s-mute)]" />
                <DimLine label={g.dim} className="mt-4 text-[var(--s-mute)]" />
                <figcaption className="mt-3">
                  <p className="font-display text-[length:var(--fs-28)]">{g.t}</p>
                  <p className="mt-1 text-[length:var(--fs-15)] text-[var(--s-ink-2)]">{g.s}</p>
                </figcaption>
              </figure>
            ))}
          </div>
         </div>
        </div>
      </section>

      {/* ═══ ΓΙΑ ΠΟΙΟΝ ═══ */}
      <section className="relative overflow-hidden border-t border-[var(--s-line)] bg-white py-24 md:py-32" aria-labelledby="roles-title">
        <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8 lg:px-12">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="s-kicker text-[var(--s-accent)]">Για ποιον</p>
              <h2 id="roles-title" data-split className="font-display mt-4 text-[length:var(--fs-56)]">Ένας χώρος, τρεις <em>ματιές.</em></h2>
            </div>
            <p className="max-w-md text-[length:var(--fs-16)] text-[var(--s-ink-2)]">Απευθυνόμαστε στην αγορά της κατοικίας και των κατασκευών μεσαίας κλίμακας — σε όσους θέλουν ένα ξεχωριστό αποτέλεσμα.</p>
          </div>
          <ul className="mt-16 grid gap-10 md:grid-cols-3 md:gap-6" data-reveal data-stagger>
            {ROLES.map((r) => (
              <li key={r.k} className="group">
                <div data-velocity className="relative aspect-[3/4] overflow-hidden bg-[var(--s-paper)]">
                  <div data-parallax="0.12" className="absolute inset-[-8%]"><Image src={r.img} alt="" fill sizes="(min-width: 768px) 33vw, 100vw" className="s-img object-cover" /></div>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B1620]/85 via-[#0B1620]/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-6 text-white">
                    <h3 className="font-display text-[length:var(--fs-36)] leading-none">{r.t}</h3>
                    <SectionMark letter={r.k} sheet="B2B" className="text-white/80" />
                  </div>
                </div>
                <ul className="mt-6 space-y-3">
                  {r.items.map((it) => <li key={it} className="flex gap-3 border-b border-[var(--s-line)] pb-3 text-[length:var(--fs-15)] text-[var(--s-ink-2)]"><span className="mt-2.5 h-px w-4 shrink-0 bg-[var(--s-ink)]" />{it}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ═══ TOUCH & FEEL: βίντεο ═══ */}
      <section className="relative overflow-hidden bg-[var(--s-paper)] py-24 md:py-32">
        <Grid />
        <div className="relative mx-auto grid w-full max-w-[1440px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:px-12">
          <div className="relative" data-reveal="50">
            <div className="relative aspect-[16/10] overflow-hidden bg-[#0B1620]">
              <video className="size-full object-cover" src="/site/brand/touch-feel.mp4" poster="/site/brand/touch-feel.jpg" autoPlay muted loop playsInline preload="none" aria-hidden />
            </div>
            <CropMarks className="text-[var(--s-ink)]" size={24} />
            <DimLine label="ΕΡΓΑΣΤΗΡΙΟ · MOCK-UPS · MEETING ROOM" className="mt-5 text-[var(--s-mute)]" />
          </div>
          <div>
            <p className="s-kicker text-[var(--s-accent)]">Touch & Feel concept</p>
            <h2 data-split className="font-display mt-4 text-[length:var(--fs-56)]">Άγγιξε, νιώσε, <em>επίλεξε.</em></h2>
            <p data-reveal className="mt-6 text-[length:var(--fs-18)] leading-relaxed text-[var(--s-ink-2)]">
              Μεγάλες επιφάνειες για κάθε υλικό, ώστε να το νιώσετε με το χέρι — ακόμη και με γυμνό πόδι, σε στεγνή ή βρεγμένη επιφάνεια. Δοκιμάζετε αντιολισθηρότητα, υφή και χρώμα πριν αποφασίσετε.
            </p>
            <p className="mt-8 text-[length:var(--fs-13)] font-medium uppercase tracking-[0.18em] text-[var(--s-ink)]">{c.hours} · {c.address}</p>
            <a href="/appointment" className="group mt-6 inline-flex min-h-12 items-center gap-3 border border-[var(--s-ink)] px-6 text-[length:var(--fs-15)] font-medium hover:bg-[var(--s-ink)] hover:text-white">
              Κλείστε ραντεβού <FiArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </a>
          </div>
        </div>
      </section>

      {/* ═══ ΚΑΤΑΛΟΓΟΣ: ταινία κατηγοριών ═══ */}
      {cats.length > 0 && (
        <section className="overflow-hidden border-y border-[var(--s-line)] bg-white py-10" aria-label="Κατηγορίες καταλόγου">
          <div className="flex">
            <div className="s-marquee flex shrink-0 items-center gap-10 whitespace-nowrap pr-10">
              {[...cats.slice(0, 10), ...cats.slice(0, 10)].map((k, i) => (
                <Link key={`${k.code}-${i}`} href={`/products?category=${k.code}`} tabIndex={i >= Math.min(10, cats.length) ? -1 : undefined}
                  className="font-display s-outline text-[length:var(--fs-64)] text-[var(--s-ink)] transition-colors hover:text-[var(--s-ink)] hover:[-webkit-text-stroke:0]">
                  {k.name}<span className="ml-10 inline-block size-2 rounded-full bg-[var(--s-accent)] align-middle" aria-hidden />
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══ ΚΛΕΙΣΙΜΟ: πρόσβαση ═══ */}
      <section className="relative isolate overflow-hidden bg-[#0B1620] text-white">
        <div className="absolute inset-0 -z-10">
          <div data-parallax="0.25" className="absolute inset-[-12%]"><Image src="/site/brand/door.jpg" alt="" fill sizes="100vw" className="object-cover opacity-45" /></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B1620] via-[#0B1620]/80 to-[#0B1620]/30" />
        </div>
        <Grid color="#ffffff" opacity={0.05} />
        <div className="mx-auto w-full max-w-[1440px] px-5 py-24 sm:px-8 md:py-36 lg:px-12">
          <p className="s-kicker text-[#D6B796]">Πρόσβαση μόνο για επαγγελματίες</p>
          <h2 data-split className="font-display mt-6 text-[length:var(--fs-64)] md:text-[length:var(--fs-96)] xl:text-[length:var(--fs-120)]">Ας χτίσουμε <em className="text-[#E8D5BF]">μαζί.</em></h2>
          <ol className="mt-14 grid max-w-5xl gap-px bg-white/15 md:grid-cols-3" data-reveal data-stagger>
            {[
              ['01', 'Αίτημα πρόσβασης', 'Επωνυμία, ΑΦΜ και στοιχεία επικοινωνίας.'],
              ['02', 'Ενεργοποίηση', 'Σας συνδέουμε με την καρτέλα σας — συνήθως μέσα σε μία εργάσιμη.'],
              ['03', 'Είσοδος', 'Με κωδικό ή με κωδικό μίας χρήσης στο email σας.'],
            ].map(([n, t, d]) => (
              <li key={n} className="bg-[#0B1620]/85 p-6 md:p-8">
                <span className="font-num text-[length:var(--fs-14)] text-[#D6B796]">{n}</span>
                <p className="font-display mt-3 text-[length:var(--fs-28)]">{t}</p>
                <p className="mt-2 text-[length:var(--fs-15)] text-white/70">{d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-12 flex flex-wrap gap-4">
            <Link href="/auth/register" className="group inline-flex min-h-14 items-center gap-3 bg-white px-7 text-[length:var(--fs-16)] font-medium text-[#0B1620] hover:bg-[#E8D5BF]">Αίτημα πρόσβασης <FiArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden /></Link>
            <Link href="/auth/signin" className="inline-flex min-h-14 items-center border border-white/50 px-7 text-[length:var(--fs-16)] font-medium hover:border-white hover:bg-white/10">Έχω λογαριασμό</Link>
          </div>
        </div>
      </section>
    </>
  );
}
