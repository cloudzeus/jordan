import Image from 'next/image';
import Link from 'next/link';
import { FiEye, FiLogOut, FiMenu, FiPlus } from 'react-icons/fi';
import { siteCompany } from '@/lib/site-company';
import { homeFor } from '@/lib/auth-home';
import type { PortalUser, UserWithRole } from '@/lib/rbac';
import { endViewAsAction } from '@/app/admin/users/view-as-actions';
import { Container } from '@/components/site/ui';
import { SiteMotion } from '@/components/site/motion';
import { cn } from '@/lib/utils';

export type PortalSection = 'home' | 'offers' | 'projects' | 'contracts' | 'orders' | 'new-order' | 'assignments' | 'payments' | 'rfps';

const isCustomer = (u: NonNullable<UserWithRole>) => u.role.key === 'CUSTOMER' && u.customerTrdr != null;
const isCrew = (u: NonNullable<UserWithRole>) => u.role.key === 'SUPPLIER';

/** Ποιον «ακούει» η πύλη — η μικρή ετικέτα δίπλα στο λογότυπο. */
const AUDIENCE: Record<string, string> = { CUSTOMER: 'πελάτες', COLLABORATOR: 'συνεργάτες', SUPPLIER: 'συνεργεία' };
const ROLE_ONE: Record<string, string> = { CUSTOMER: 'πελάτης', COLLABORATOR: 'συνεργάτης', SUPPLIER: 'συνεργείο' };

/**
 * Ενότητες του B2B portal ανά ρόλο:
 *  • πελάτης (SoftOne TRDR): container, έργα, προσφορές & συμβάσεις, παραγγελίες·
 *  • συνεργάτης: αιτήματα προσφοράς, αναθέσεις, πληρωμές, container·
 *  • συνεργείο: αιτήματα προσφοράς, αναθέσεις, πληρωμές (τα container είναι για αγοραστές).
 */
export function portalNav(user: NonNullable<UserWithRole>) {
  const home = { key: 'home' as const, href: homeFor(user.role.key), label: 'Επισκόπηση' };
  const offers = { key: 'offers' as const, href: '/dashboard/offers', label: 'Δυναμικές προσφορές' };
  if (isCustomer(user)) {
    return [
      home, offers,
      { key: 'projects' as const, href: '/dashboard/customer/projects', label: 'Έργα' },
      { key: 'contracts' as const, href: '/dashboard/customer/contracts', label: 'Προσφορές & συμβάσεις' },
      { key: 'orders' as const, href: '/dashboard/customer/orders', label: 'Παραγγελίες' },
    ];
  }
  const work = [
    { key: 'rfps' as const, href: '/dashboard/rfps', label: 'Αιτήματα προσφοράς' },
    { key: 'assignments' as const, href: '/dashboard/assignments', label: 'Αναθέσεις' },
    { key: 'payments' as const, href: '/dashboard/payments', label: 'Πληρωμές' },
  ];
  return isCrew(user) ? [home, ...work] : [home, ...work, offers];
}

/**
 * Πλαίσιο της B2B περιοχής πελατών/συνεργατών — ίδια γλώσσα με το website και τη «δημοπρασία»:
 * λογότυπο, υπογράμμιση ενεργής ενότητας, ΕΝΑ κύριο κουμπί (Νέα παραγγελία), κίνηση GSAP.
 */
export async function PortalShell({ user, org, active = 'offers', children }: { user: PortalUser; org: string | null; active?: PortalSection; children: React.ReactNode }) {
  const c = await siteCompany();
  const nav = portalNav(user);
  const customer = isCustomer(user);
  const initials = (user.name ?? user.email).split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="site flex min-h-dvh flex-col bg-white">
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      <SiteMotion />
      <header className="sticky top-0 z-40 border-b border-(--s-line) bg-white/95 backdrop-blur-md">
        {user.viewAs && <ViewAsBar name={user.name ?? user.email} role={ROLE_ONE[user.role.key ?? ''] ?? ''} admin={user.viewAs.adminName} />}
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-5 px-5 sm:px-8 md:h-[72px] lg:px-12">
          {/* Κινητό: <details> — δουλεύει χωρίς JavaScript. */}
          <details className="relative lg:hidden">
            <summary className="-ml-3 grid size-11 cursor-pointer list-none place-items-center [&::-webkit-details-marker]:hidden" aria-label="Μενού">
              <FiMenu className="size-6" aria-hidden />
            </summary>
            <nav aria-label="Περιοχή πελάτη (κινητό)" className="fixed inset-x-0 bottom-0 top-16 z-50 overflow-y-auto bg-white px-5 pb-10 pt-4">
              {nav.map((n, i) => (
                <Link key={n.key} href={n.href} aria-current={n.key === active ? 'page' : undefined} className="flex items-baseline gap-4 border-b border-(--s-line) py-4 aria-[current=page]:text-(--s-accent)">
                  <span className="font-num text-(length:--fs-14) text-(--s-mute)">0{i + 1}</span>
                  <span className="font-display text-(length:--fs-36)">{n.label}</span>
                </Link>
              ))}
              {customer && <Link href="/dashboard/customer/orders/new" className="mt-8 flex min-h-12 items-center justify-center gap-2 bg-(--s-ink) text-(length:--fs-16) font-medium text-white"><FiPlus className="size-4" aria-hidden />Νέα παραγγελία</Link>}
            </nav>
          </details>
          <Link href="/" aria-label="Atelier by Damask — website" className="relative block h-10 w-[78px] shrink-0 md:h-11 md:w-[86px]">
            <Image src="/site/brand/logo-black.png" alt="" fill sizes="86px" className="object-contain" priority />
          </Link>
          <span className="hidden border-l border-(--s-line) pl-4 text-(length:--fs-11) uppercase leading-tight tracking-[0.22em] text-(--s-mute) xl:block">B2B<br />{AUDIENCE[user.role.key ?? ''] ?? 'συνεργάτες'}</span>
          <nav aria-label="Περιοχή πελάτη" className="ml-2 hidden h-full items-stretch gap-5 lg:flex xl:ml-4 xl:gap-7">
            {nav.map((n) => (
              <Link key={n.key} href={n.href} aria-current={n.key === active ? 'page' : undefined}
                className={cn('group relative flex items-center text-(length:--fs-14) transition-colors', n.key === active ? 'text-(--s-ink)' : 'text-(--s-ink-2) hover:text-(--s-ink)')}>
                {n.label}
                <span aria-hidden className={cn('absolute inset-x-0 -bottom-px h-0.5 origin-left bg-(--s-ink) transition-transform duration-300', n.key === active ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100')} />
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            {customer && (
              <Link href="/dashboard/customer/orders/new" aria-current={active === 'new-order' ? 'page' : undefined}
                className="hidden min-h-11 items-center gap-2 bg-(--s-ink) px-4 text-(length:--fs-14) font-medium text-white transition-colors hover:bg-[#2C4556] sm:inline-flex">
                <FiPlus className="size-4" aria-hidden />Νέα παραγγελία
              </Link>
            )}
            <div className="hidden min-w-0 items-center gap-3 xl:flex">
              <span aria-hidden className="font-num grid size-10 shrink-0 place-items-center rounded-full bg-(--s-paper) text-(length:--fs-14) text-(--s-ink)">{initials}</span>
              <div className="min-w-0 max-w-48">
                <p className="truncate text-(length:--fs-13) text-(--s-ink)">{user.name ?? user.email}</p>
                {org && <p className="truncate text-(length:--fs-12) text-(--s-mute)">{org}</p>}
              </div>
            </div>
{/* Σε «Προβολή ως» η αποσύνδεση θα έβγαζε τον διαχειριστή — η έξοδος γίνεται από τη μπάρα. */}
            {!user.viewAs && (
                        <form action="/api/auth/logout" method="post">
              <button className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 text-(length:--fs-13) text-(--s-ink-2) transition-colors hover:text-(--s-ink)" aria-label="Αποσύνδεση" title="Αποσύνδεση">
                <FiLogOut className="size-4" aria-hidden />
              </button>
            </form>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">{children}</main>
      <footer className="bg-[#0B1620] text-white">
        <Container className="flex flex-wrap items-center justify-between gap-4 py-8 text-(length:--fs-13) text-white/60">
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

/**
 * «Προβολή ως»: ο διαχειριστής βλέπει την πύλη όπως ο χρήστης. Σταθερή μπάρα σε μελάνι, για να μην
 * ξεχαστεί ποτέ ότι πρόκειται για προβολή — οι ενέργειες απορρίπτονται στον server.
 */
function ViewAsBar({ name, role, admin }: { name: string; role: string; admin: string }) {
  return (
    <div role="status" className="bg-(--s-ink) text-white">
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2 text-(length:--fs-13) sm:px-8 lg:px-12">
        <FiEye className="size-4 shrink-0 text-[#E9D8C4]" aria-hidden />
        <span className="min-w-0 flex-1">
          Προβολή ως <b className="font-medium">{name}</b>{role ? ` (${role})` : ''} · μόνο ανάγνωση — οι ενέργειες δεν εκτελούνται.
          <span className="hidden text-white/60 md:inline"> Διαχειριστής: {admin}</span>
        </span>
        <form action={endViewAsAction}>
          <button className="inline-flex min-h-9 cursor-pointer items-center border border-white/40 px-3 font-medium transition-colors hover:bg-white hover:text-(--s-ink)">Επιστροφή στο admin</button>
        </form>
      </div>
    </div>
  );
}
