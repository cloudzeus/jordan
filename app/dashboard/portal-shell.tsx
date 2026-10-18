import Image from 'next/image';
import Link from 'next/link';
import { FiLogOut, FiMenu, FiPlus } from 'react-icons/fi';
import { siteCompany } from '@/lib/site-company';
import { homeFor } from '@/lib/auth-home';
import type { UserWithRole } from '@/lib/rbac';
import { Container } from '@/components/site/ui';
import { SiteMotion } from '@/components/site/motion';
import { cn } from '@/lib/utils';

export type PortalSection = 'home' | 'offers' | 'projects' | 'orders' | 'new-order' | 'catalog';

const isCustomer = (u: NonNullable<UserWithRole>) => u.role.key === 'CUSTOMER' && u.customerTrdr != null;

/** Ενότητες του B2B portal. Έργα/παραγγελίες μόνο για πελάτη με SoftOne TRDR (οι συνεργάτες δεν έχουν). */
export function portalNav(user: NonNullable<UserWithRole>) {
  return [
    { key: 'home' as const, href: homeFor(user.role.key), label: 'Επισκόπηση' },
    { key: 'offers' as const, href: '/dashboard/offers', label: 'Δυναμικές προσφορές' },
    ...(isCustomer(user) ? [
      { key: 'projects' as const, href: '/dashboard/customer/projects', label: 'Έργα' },
      { key: 'orders' as const, href: '/dashboard/customer/orders', label: 'Παραγγελίες' },
    ] : []),
    { key: 'catalog' as const, href: '/products', label: 'Κατάλογος' },
  ];
}

/**
 * Πλαίσιο της B2B περιοχής πελατών/συνεργατών — ίδια γλώσσα με το website και τη «δημοπρασία»:
 * λογότυπο, υπογράμμιση ενεργής ενότητας, ΕΝΑ κύριο κουμπί (Νέα παραγγελία), κίνηση GSAP.
 */
export async function PortalShell({ user, org, active = 'offers', children }: { user: NonNullable<UserWithRole>; org: string | null; active?: PortalSection; children: React.ReactNode }) {
  const c = await siteCompany();
  const nav = portalNav(user);
  const customer = isCustomer(user);
  const initials = (user.name ?? user.email).split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="site flex min-h-dvh flex-col bg-white">
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      <SiteMotion />
      <header className="sticky top-0 z-40 border-b border-[var(--s-line)] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-5 px-5 sm:px-8 md:h-[72px] lg:px-12">
          {/* Κινητό: <details> — δουλεύει χωρίς JavaScript. */}
          <details className="relative lg:hidden">
            <summary className="-ml-3 grid size-11 cursor-pointer list-none place-items-center [&::-webkit-details-marker]:hidden" aria-label="Μενού">
              <FiMenu className="size-6" aria-hidden />
            </summary>
            <nav aria-label="Περιοχή πελάτη (κινητό)" className="fixed inset-x-0 bottom-0 top-16 z-50 overflow-y-auto bg-white px-5 pb-10 pt-4">
              {nav.map((n, i) => (
                <Link key={n.key} href={n.href} aria-current={n.key === active ? 'page' : undefined} className="flex items-baseline gap-4 border-b border-[var(--s-line)] py-4 aria-[current=page]:text-[var(--s-accent)]">
                  <span className="font-num text-[length:var(--fs-14)] text-[var(--s-mute)]">0{i + 1}</span>
                  <span className="font-display text-[length:var(--fs-36)]">{n.label}</span>
                </Link>
              ))}
              {customer && <Link href="/dashboard/customer/orders/new" className="mt-8 flex min-h-12 items-center justify-center gap-2 bg-[var(--s-ink)] text-[length:var(--fs-16)] font-medium text-white"><FiPlus className="size-4" aria-hidden />Νέα παραγγελία</Link>}
            </nav>
          </details>
          <Link href="/" aria-label="Atelier by Damask — website" className="relative block h-10 w-[78px] shrink-0 md:h-11 md:w-[86px]">
            <Image src="/site/brand/logo-black.png" alt="" fill sizes="86px" className="object-contain" priority />
          </Link>
          <span className="hidden border-l border-[var(--s-line)] pl-4 text-[length:var(--fs-11)] uppercase leading-tight tracking-[0.22em] text-[var(--s-mute)] xl:block">B2B<br />{customer ? 'πελάτες' : 'συνεργάτες'}</span>
          <nav aria-label="Περιοχή πελάτη" className="ml-4 hidden h-full items-stretch gap-7 lg:flex">
            {nav.map((n) => (
              <Link key={n.key} href={n.href} aria-current={n.key === active ? 'page' : undefined}
                className={cn('group relative flex items-center text-[length:var(--fs-14)] transition-colors', n.key === active ? 'text-[var(--s-ink)]' : 'text-[var(--s-ink-2)] hover:text-[var(--s-ink)]')}>
                {n.label}
                <span aria-hidden className={cn('absolute inset-x-0 -bottom-px h-0.5 origin-left bg-[var(--s-ink)] transition-transform duration-300', n.key === active ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100')} />
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            {customer && (
              <Link href="/dashboard/customer/orders/new" aria-current={active === 'new-order' ? 'page' : undefined}
                className="hidden min-h-11 items-center gap-2 bg-[var(--s-ink)] px-4 text-[length:var(--fs-14)] font-medium text-white transition-colors hover:bg-[#2C4556] sm:inline-flex">
                <FiPlus className="size-4" aria-hidden />Νέα παραγγελία
              </Link>
            )}
            <div className="hidden min-w-0 items-center gap-3 md:flex">
              <span aria-hidden className="font-num grid size-10 shrink-0 place-items-center rounded-full bg-[var(--s-paper)] text-[length:var(--fs-14)] text-[var(--s-ink)]">{initials}</span>
              <div className="min-w-0 max-w-[12rem]">
                <p className="truncate text-[length:var(--fs-13)] text-[var(--s-ink)]">{user.name ?? user.email}</p>
                {org && <p className="truncate text-[length:var(--fs-12)] text-[var(--s-mute)]">{org}</p>}
              </div>
            </div>
            <form action="/api/auth/logout" method="post">
              <button className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 text-[length:var(--fs-13)] text-[var(--s-ink-2)] transition-colors hover:text-[var(--s-ink)]" aria-label="Αποσύνδεση" title="Αποσύνδεση">
                <FiLogOut className="size-4" aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">{children}</main>
      <footer className="bg-[#0B1620] text-white">
        <Container className="flex flex-wrap items-center justify-between gap-4 py-8 text-[length:var(--fs-13)] text-white/60">
          <span className="flex items-center gap-4">
            <Image src="/site/brand/logo-white.png" alt="Atelier by Damask" width={835} height={438} className="h-auto w-[64px]" />
            <span>{c.legal} · <Link href="/legal/terms" className="hover:text-white">Όροι</Link> · <Link href="/legal/privacy" className="hover:text-white">Απόρρητο</Link></span>
          </span>
          <span className="tabular-nums">{c.hours} · {c.phones[0]} · <a href={`mailto:${c.salesEmail}`} className="hover:text-white">{c.salesEmail}</a></span>
        </Container>
      </footer>
    </div>
  );
}
