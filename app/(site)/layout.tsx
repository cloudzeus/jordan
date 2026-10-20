import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getCurrentUserWithPermissions } from '@/lib/rbac';
import { siteCompany } from '@/lib/site-company';
import { homeFor } from '@/lib/auth-home';
import { SiteHeader } from '@/components/site/site-header';
import { SiteMotion } from '@/components/site/motion';
import { AccessModalHost } from '@/components/site/access-modal';
import { BookingModalHost } from '@/components/site/booking-modal';
import { NewsletterForm, NewsletterModalHost } from '@/components/site/newsletter';
import { DimLine, Grid } from '@/components/site/blueprint';

export async function generateMetadata(): Promise<Metadata> {
  const c = await siteCompany();
  return {
    title: { absolute: `${c.brand} — B2B πύλη για αρχιτέκτονες, διακοσμητές & κατασκευαστές`, template: `%s · ${c.brand}` },
    description: 'Η B2B πύλη της Atelier by Damask: δυναμικές προσφορές κοινού container, παρακολούθηση έργων και παραγγελιών, παραγγελίες από τον κατάλογο — μόνο για επαγγελματίες.',
    icons: { icon: '/site/brand/logo-black.png' },
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website', locale: 'el_GR', url: '/', siteName: c.brand,
      title: `${c.brand} — B2B πύλη`,
      description: 'Δυναμικές προσφορές κοινού container, έργα και παραγγελίες — μόνο για επαγγελματίες.',
      images: [{ url: '/site/brand/floor.jpg', width: 1600, height: 1067, alt: c.brand }],
    },
  };
}

const NAV = [
  { href: '/#auctions', label: 'Δυναμικές προσφορές' },
  { href: '/#b2b', label: 'Η πύλη' },
  { href: '/products', label: 'Κατάλογος' },
  { href: '/#contact', label: 'Επικοινωνία' },
];

const LEGAL = [
  { href: '/legal/terms', label: 'Όροι χρήσης' },
  { href: '/legal/privacy', label: 'Πολιτική απορρήτου' },
  { href: '/legal/cookies', label: 'Cookies' },
];

/**
 * Δημόσιο website — ΑΥΣΤΗΡΑ B2B, εκδοτικό: διάφανη κεφαλίδα πάνω στο βίντεο της αρχικής, κίνηση GSAP
 * (SiteMotion), σκούρο footer με το λογότυπο. Ο συνδεδεμένος βλέπει «Η περιοχή μου».
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [c, user] = await Promise.all([siteCompany(), getCurrentUserWithPermissions().catch(() => null)]);
  const account = user ? { href: homeFor(user.role.key), label: 'Η περιοχή μου' } : { href: '/auth/signin', label: 'Είσοδος' };
  const year = new Date().getFullYear();

  return (
    <div className="site flex min-h-dvh flex-col">
      {/* Πριν το πρώτο paint: ενεργοποιεί την απόκρυψη στοιχείων που θα «αποκαλυφθούν» (βλ. globals.css). */}
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:bg-white focus:px-4 focus:py-2">Μετάβαση στο περιεχόμενο</a>
      <SiteHeader nav={NAV} account={account} signedIn={!!user} />
      <SiteMotion />
      <AccessModalHost />
      <BookingModalHost address={c.address} hours={c.hours} phone={c.phones[0]} />
      <NewsletterModalHost />

      <main id="main" className="flex-1 pt-16 md:pt-20">{children}</main>

      <footer id="contact" className="relative scroll-mt-20 overflow-hidden bg-[#0B1620] text-white">
        <Grid color="#ffffff" opacity={0.04} />
        <div className="relative mx-auto w-full max-w-[1440px] px-5 pt-20 sm:px-8 lg:px-12">
          <div className="grid gap-14 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
            <div className="max-w-sm">
              <Image src="/site/brand/logo-white.png" alt={c.brand} width={180} height={94} className="h-auto w-[150px]" />
              <p className="mt-6 text-(length:--fs-15) leading-relaxed text-white/70">{c.tagline}</p>
            </div>
            <div>
              <p className="s-kicker text-[#D6B796]">Πλοήγηση</p>
              <ul className="mt-5 space-y-1">
                {NAV.map((n) => <li key={n.href}><Link href={n.href} className="inline-flex min-h-10 items-center text-(length:--fs-15) text-white/80 hover:text-white">{n.label}</Link></li>)}
                <li><Link href="/auth/register" className="inline-flex min-h-10 items-center text-(length:--fs-15) text-white/80 hover:text-white">Αίτημα πρόσβασης</Link></li>
              </ul>
            </div>
            <address className="not-italic">
              <p className="s-kicker text-[#D6B796]">Atelier · Αθήνα</p>
              <ul className="mt-5 space-y-1 text-(length:--fs-15) text-white/80">
                {c.phones.map((p) => <li key={p}><a href={`tel:${p.replace(/\s/g, '')}`} className="inline-flex min-h-10 items-center tabular-nums hover:text-white">{p}</a></li>)}
                <li><a href={`mailto:${c.salesEmail}`} className="inline-flex min-h-10 items-center hover:text-white">{c.salesEmail}</a></li>
                <li className="pt-2 text-white/60">{c.address}</li>
                <li className="pt-2 text-(length:--fs-12) font-medium uppercase tracking-[0.18em] text-[#D6B796]">{c.hours}</li>
                <li><Link href="/appointment" className="inline-flex min-h-10 items-center gap-2 font-medium text-white hover:text-[#E8D5BF]">Κλείστε ραντεβού <span aria-hidden>→</span></Link></li>
              </ul>
            </address>
            <div>
              <p className="s-kicker text-[#D6B796]">Νομικά</p>
              <ul className="mt-5 space-y-1">
                {LEGAL.map((n) => <li key={n.href}><Link href={n.href} className="inline-flex min-h-10 items-center text-(length:--fs-15) text-white/80 hover:text-white">{n.label}</Link></li>)}
              </ul>
            </div>
          </div>
          <div className="mt-16 grid gap-6 border-t border-white/10 pt-10 lg:grid-cols-[1.3fr_2fr] lg:items-start">
            <div>
              <p className="s-kicker text-[#D6B796]">Newsletter</p>
              <p className="font-display mt-3 text-(length:--fs-28) text-white">Νέα υλικά & δυναμικές προσφορές, πρώτοι εσείς.</p>
            </div>
            <div className="max-w-xl lg:justify-self-end lg:w-full"><NewsletterForm tone="dark" source="footer" idPrefix="nlf" /></div>
          </div>
          <DimLine label={`${c.legal}${c.vat ? ` · ΑΦΜ ${c.vat}` : ''}`} className="mt-20 text-white/35" />
          <p aria-hidden className="font-display pointer-events-none mt-6 select-none whitespace-nowrap text-center text-(length:--fs-120) leading-[0.8] text-white/6">Atelier</p>
          <div className="flex flex-wrap justify-between gap-2 border-t border-white/10 py-6 text-(length:--fs-13) text-white/50">
            <span>© {year} {c.legal}</span>
            <span>Φωτογραφίες & βίντεο: Atelier by Damask</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
