import Link from 'next/link';
import { FiLogOut, FiMenu } from 'react-icons/fi';
import { siteCompany } from '@/lib/site-company';
import { homeFor } from '@/lib/auth-home';
import type { UserWithRole } from '@/lib/rbac';
import { Container } from '@/components/site/ui';

export type PortalSection = 'offers' | 'projects' | 'orders' | 'new-order' | 'catalog';

/** Ενότητες του B2B portal. Έργα/παραγγελίες μόνο για πελάτη με SoftOne TRDR (οι συνεργάτες δεν έχουν). */
export function portalNav(user: NonNullable<UserWithRole>) {
  const home = homeFor(user.role.key);
  const customer = user.role.key === 'CUSTOMER' && user.customerTrdr != null;
  return [
    { key: 'offers' as const, href: home, label: 'Δυναμικές προσφορές' },
    ...(customer ? [
      { key: 'projects' as const, href: '/dashboard/customer/projects', label: 'Έργα' },
      { key: 'orders' as const, href: '/dashboard/customer/orders', label: 'Παραγγελίες' },
      { key: 'new-order' as const, href: '/dashboard/customer/orders/new', label: 'Νέα παραγγελία' },
    ] : []),
    { key: 'catalog' as const, href: '/products', label: 'Κατάλογος' },
  ];
}

/** Πλαίσιο της περιοχής πελατών/συνεργατών — ίδιο ύφος με το website (λευκό, λεπτές γραμμές). */
export async function PortalShell({ user, org, active = 'offers', children }: { user: NonNullable<UserWithRole>; org: string | null; active?: PortalSection; children: React.ReactNode }) {
  const c = await siteCompany();
  const nav = portalNav(user);
  return (
    <div className="site flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-[var(--s-line)] bg-white/95 backdrop-blur-sm">
        <Container className="flex h-16 items-center gap-6">
          {/* Κινητό: <details> — δουλεύει χωρίς JavaScript. */}
          <details className="relative lg:hidden">
            <summary className="-ml-3 grid size-11 cursor-pointer list-none place-items-center [&::-webkit-details-marker]:hidden" aria-label="Μενού">
              <FiMenu className="size-5" aria-hidden />
            </summary>
            <nav aria-label="Περιοχή πελάτη (κινητό)" className="absolute left-0 top-14 z-50 w-64 border border-[var(--s-line)] bg-white py-2">
              {nav.map((n) => (
                <Link key={n.key} href={n.href} aria-current={n.key === active ? 'page' : undefined} className="block px-5 py-3 text-[length:var(--fs-16)] hover:bg-[var(--s-paper)] aria-[current=page]:font-medium">{n.label}</Link>
              ))}
            </nav>
          </details>
          <Link href="/" className="font-num text-[length:var(--fs-20)] font-light uppercase tracking-[0.14em]">{c.name}</Link>
          <nav aria-label="Περιοχή πελάτη" className="hidden items-center gap-6 lg:flex">
            {nav.map((n) => (
              <Link key={n.key} href={n.href} aria-current={n.key === active ? 'page' : undefined} className="s-link text-[length:var(--fs-14)] text-[var(--s-ink-2)] hover:text-[var(--s-ink)] aria-[current=page]:text-[var(--s-ink)] aria-[current=page]:font-medium">{n.label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-[length:var(--fs-13)] text-[var(--s-ink)]">{user.name ?? user.email}</p>
              {org && <p className="truncate text-[length:var(--fs-12)] text-[var(--s-mute)]">{org}</p>}
            </div>
            <form action="/api/auth/logout" method="post">
              <button className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 px-2 text-[length:var(--fs-13)] text-[var(--s-ink-2)] transition-colors hover:text-[var(--s-ink)]" aria-label="Αποσύνδεση">
                <FiLogOut className="size-4" aria-hidden /><span className="hidden md:inline">Αποσύνδεση</span>
              </button>
            </form>
          </div>
        </Container>
      </header>
      <main id="main" className="flex-1">{children}</main>
      <footer className="border-t border-[var(--s-line)]">
        <Container className="flex flex-wrap justify-between gap-2 py-6 text-[length:var(--fs-13)] text-[var(--s-mute)]">
          <span>{c.legal ?? c.name} · <Link href="/legal/terms" className="s-link">Όροι χρήσης</Link> · <Link href="/legal/privacy" className="s-link">Απόρρητο</Link></span>
          <span className="tabular-nums">{c.phones[0]} · <a href={`mailto:${c.salesEmail}`} className="s-link">{c.salesEmail}</a></span>
        </Container>
      </footer>
    </div>
  );
}
