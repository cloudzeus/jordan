import Link from 'next/link';
import type { Metadata } from 'next';
import { FiMenu, FiArrowUpRight, FiUser } from 'react-icons/fi';
import { getCurrentUserWithPermissions } from '@/lib/rbac';
import { siteCompany } from '@/lib/site-company';
import { homeFor } from '@/lib/auth-home';
import { Container } from '@/components/site/ui';

export async function generateMetadata(): Promise<Metadata> {
  const c = await siteCompany();
  return {
    title: { absolute: `${c.name} — B2B πύλη για αρχιτέκτονες & κατασκευαστές`, template: `%s · ${c.name}` },
    description: 'Η B2B πύλη της Atelier by Damask: δυναμικές προσφορές κοινού container, παρακολούθηση έργων και παραγγελιών, παραγγελίες από τον κατάλογο — μόνο για επαγγελματίες.',
  };
}

const NAV = [
  { href: '/#auctions', label: 'Δυναμικές προσφορές' },
  { href: '/#b2b', label: 'Λειτουργίες B2B' },
  { href: '/products', label: 'Κατάλογος' },
  { href: '/#contact', label: 'Επικοινωνία' },
];

const LEGAL = [
  { href: '/legal/terms', label: 'Όροι χρήσης' },
  { href: '/legal/privacy', label: 'Πολιτική απορρήτου' },
  { href: '/legal/cookies', label: 'Cookies' },
];

/**
 * Δημόσιο website — ΑΥΣΤΗΡΑ B2B: απευθύνεται σε τεχνικά γραφεία, αρχιτέκτονες και κατασκευαστές.
 * Λευκό, ήσυχο, η φωτογραφία κάνει τη δουλειά. Ο συνδεδεμένος βλέπει «Η περιοχή μου».
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [c, user] = await Promise.all([siteCompany(), getCurrentUserWithPermissions().catch(() => null)]);
  const account = user
    ? { href: homeFor(user.role.key), label: 'Η περιοχή μου' }
    : { href: '/auth/signin', label: 'Είσοδος επαγγελματιών' };
  const year = new Date().getFullYear();

  return (
    <div className="site flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-white focus:px-4 focus:py-2">Μετάβαση στο περιεχόμενο</a>

      <header className="sticky top-0 z-40 border-b border-[var(--s-line)] bg-white/95 backdrop-blur-sm">
        <Container className="relative grid h-16 grid-cols-[1fr_auto_1fr] items-center md:h-[68px]">
          {/* Κινητό: <details> — δουλεύει χωρίς JavaScript. */}
          <details className="group relative justify-self-start md:hidden">
            <summary className="-ml-3 grid size-11 cursor-pointer list-none place-items-center [&::-webkit-details-marker]:hidden" aria-label="Μενού">
              <FiMenu className="size-5" aria-hidden />
            </summary>
            <nav aria-label="Κύρια (κινητό)" className="absolute left-0 top-14 w-64 border border-[var(--s-line)] bg-white py-2">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="block px-5 py-3 text-[length:var(--fs-16)] hover:bg-[var(--s-paper)]">{n.label}</Link>
              ))}
            </nav>
          </details>
          <span className="hidden md:block" />
          <Link href="/" className="font-num justify-self-center text-[length:var(--fs-20)] font-light uppercase tracking-[0.14em]" aria-label={`${c.name} — αρχική`}>
            {c.name}
          </Link>
          <Link
            href={account.href}
            aria-label={account.label}
            className="inline-flex min-h-11 items-center gap-1.5 justify-self-end text-[length:var(--fs-14)] text-[var(--s-ink)] transition-colors hover:text-[var(--s-accent)]"
          >
            <FiUser className="size-4" aria-hidden />
            <span className="hidden sm:inline">{account.label}</span>
            {user && <FiArrowUpRight className="hidden size-3.5 sm:block" aria-hidden />}
          </Link>
        </Container>
        <nav aria-label="Κύρια" className="hidden h-11 items-center justify-center gap-10 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="s-link text-[length:var(--fs-14)] text-[var(--s-ink-2)] transition-colors hover:text-[var(--s-ink)]">{n.label}</Link>
          ))}
        </nav>
      </header>

      <main id="main" className="flex-1">{children}</main>

      <footer id="contact" className="mt-24 scroll-mt-28 bg-[var(--s-paper)]">
        <Container className="grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:py-20">
          <div className="max-w-sm">
            <p className="font-num text-[length:var(--fs-20)] font-light uppercase tracking-[0.14em]">{c.name}</p>
            <p className="mt-4 text-[length:var(--fs-15)] text-[var(--s-ink-2)]">B2B πύλη της {c.brand}: φυσικά δομικά υλικά και αρχιτεκτονικά τελειώματα για τεχνικά γραφεία, αρχιτέκτονες και κατασκευαστές.</p>
            <p className="mt-4 text-[length:var(--fs-13)] text-[var(--s-mute)]">Η πύλη απευθύνεται αποκλειστικά σε επαγγελματίες. Δεν πραγματοποιούνται πωλήσεις σε καταναλωτές.</p>
          </div>
          <div>
            <p className="text-[length:var(--fs-12)] font-medium uppercase tracking-[0.18em] text-[var(--s-mute)]">Πλοήγηση</p>
            <ul className="mt-4 space-y-1">
              {NAV.map((n) => <li key={n.href}><Link href={n.href} className="s-link inline-flex min-h-9 items-center text-[length:var(--fs-15)]">{n.label}</Link></li>)}
              <li><Link href="/auth/signin" className="s-link inline-flex min-h-9 items-center text-[length:var(--fs-15)]">Είσοδος επαγγελματιών</Link></li>
              <li><Link href="/auth/register" className="s-link inline-flex min-h-9 items-center text-[length:var(--fs-15)]">Αίτημα πρόσβασης</Link></li>
            </ul>
          </div>
          <address className="not-italic">
            <p className="text-[length:var(--fs-12)] font-medium uppercase tracking-[0.18em] text-[var(--s-mute)]">Επικοινωνία</p>
            <ul className="mt-4 space-y-1 text-[length:var(--fs-15)]">
              {c.phones.map((p) => <li key={p}><a href={`tel:${p.replace(/\s/g, '')}`} className="s-link inline-flex min-h-9 items-center tabular-nums">{p}</a></li>)}
              <li><a href={`mailto:${c.salesEmail}`} className="s-link inline-flex min-h-9 items-center">{c.salesEmail}</a></li>
              <li className="pt-1 text-[var(--s-ink-2)]">{c.address}</li>
              <li className="pt-1 text-[length:var(--fs-13)] font-medium uppercase tracking-[0.12em] text-[var(--s-ink)]">{c.hours}</li>
            </ul>
          </address>
          <div>
            <p className="text-[length:var(--fs-12)] font-medium uppercase tracking-[0.18em] text-[var(--s-mute)]">Νομικά</p>
            <ul className="mt-4 space-y-1">
              {LEGAL.map((n) => <li key={n.href}><Link href={n.href} className="s-link inline-flex min-h-9 items-center text-[length:var(--fs-15)]">{n.label}</Link></li>)}
            </ul>
          </div>
        </Container>
        <Container className="flex flex-wrap justify-between gap-2 border-t border-[var(--s-line)] py-6 text-[length:var(--fs-13)] text-[var(--s-mute)]">
          <span>© {year} {c.legal}{c.vat ? ` · ΑΦΜ ${c.vat}` : ''}</span>
          <span>Φωτογραφίες: Adobe Stock</span>
        </Container>
      </footer>
    </div>
  );
}
