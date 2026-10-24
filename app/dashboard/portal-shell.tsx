import Image from 'next/image';
import Link from 'next/link';
import { FiCreditCard, FiEye, FiFileText, FiHome, FiLayers, FiLogOut, FiMenu, FiMessageSquare, FiPackage, FiPlus, FiZap } from 'react-icons/fi';
import type { IconType } from 'react-icons';
import { prisma } from '@/lib/db';
import { siteCompany } from '@/lib/site-company';
import { homeFor } from '@/lib/auth-home';
import type { PortalUser, UserWithRole } from '@/lib/rbac';
import { endViewAsAction } from '@/app/admin/users/view-as-actions';
import { Container } from '@/components/site/ui';
import { SiteMotion } from '@/components/site/motion';
import { cn } from '@/lib/utils';

export type PortalSection = 'home' | 'offers' | 'projects' | 'contracts' | 'orders' | 'new-order' | 'assignments' | 'payments' | 'rfps' | 'requests';

const isCustomer = (u: NonNullable<UserWithRole>) => u.role.key === 'CUSTOMER' && u.customerTrdr != null;
const isCrew = (u: NonNullable<UserWithRole>) => u.role.key === 'SUPPLIER';

/** Ποιον «ακούει» η πύλη — η μικρή ετικέτα δίπλα στο λογότυπο. */
const AUDIENCE: Record<string, string> = { CUSTOMER: 'πελατών', COLLABORATOR: 'συνεργατών', SUPPLIER: 'συνεργείων' };
const ROLE_ONE: Record<string, string> = { CUSTOMER: 'πελάτης', COLLABORATOR: 'συνεργάτης', SUPPLIER: 'συνεργείο' };

/**
 * Ενότητες του B2B portal ανά ρόλο:
 *  • πελάτης (SoftOne TRDR): container, έργα, προσφορές & συμβάσεις, παραγγελίες·
 *  • συνεργάτης: αιτήματα προσφοράς, αναθέσεις, πληρωμές, container·
 *  • συνεργείο: αιτήματα προσφοράς, αναθέσεις, πληρωμές (τα container είναι για αγοραστές).
 */
type NavItem = { key: PortalSection; href: string; label: string; hint: string; icon: IconType; tone: string };

export function portalNav(user: NonNullable<UserWithRole>): NavItem[] {
  const home: NavItem = { key: 'home', href: homeFor(user.role.key), label: 'Επισκόπηση', hint: 'Τι χρειάζεται από εσάς και πού βρισκόμαστε', icon: FiHome, tone: '#1C3241' };
  const offers: NavItem = { key: 'offers', href: '/dashboard/offers', label: 'Δυναμικές προσφορές', hint: 'Υλικά σε ειδικές τιμές για περιορισμένο χρόνο', icon: FiZap, tone: '#C2410C' };
  if (isCustomer(user)) {
    return [
      home,
      { key: 'projects', href: '/dashboard/customer/projects', label: 'Έργα', hint: 'Πρόοδος, εργασίες και τεχνικοί φάκελοι', icon: FiLayers, tone: '#2563EB' },
      { key: 'contracts', href: '/dashboard/customer/contracts', label: 'Προσφορές', hint: 'Προσφορές και συμβάσεις — ερωτήσεις και αποδοχή', icon: FiFileText, tone: '#7A5C43' },
      { key: 'payments', href: '/dashboard/customer/payments', label: 'Πληρωμές', hint: 'Δόσεις: τι πληρώθηκε και τι ακολουθεί', icon: FiCreditCard, tone: '#15803D' },
      { key: 'requests', href: '/dashboard/customer/requests', label: 'Ζητήστε προσφορά', hint: 'Περιγράψτε τι θέλετε — σας βοηθά ο βοηθός μας', icon: FiMessageSquare, tone: '#B45309' },
      { key: 'orders', href: '/dashboard/customer/orders', label: 'Παραγγελίες', hint: 'Παραγγελίες υλικών, δελτία και τιμολόγια', icon: FiPackage, tone: '#0F766E' },
      offers,
    ];
  }
  const work: NavItem[] = [
    { key: 'rfps', href: '/dashboard/rfps', label: 'Αιτήματα προσφοράς', hint: 'Δουλειές για τις οποίες ζητάμε τιμή σας', icon: FiMessageSquare, tone: '#B45309' },
    { key: 'assignments', href: '/dashboard/assignments', label: 'Αναθέσεις', hint: 'Οι δουλειές που σας ανατέθηκαν και το πρόγραμμα', icon: FiLayers, tone: '#2563EB' },
    { key: 'payments', href: '/dashboard/payments', label: 'Πληρωμές', hint: 'Τι σας οφείλεται και τι πληρώθηκε', icon: FiCreditCard, tone: '#15803D' },
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
  // Μετρητές «χρειάζεται εσάς»: προσφορές προς απάντηση, δόσεις προς πληρωμή.
  const badges: Partial<Record<PortalSection, number>> = customer
    ? await Promise.all([
      prisma.contract.count({ where: { trdr: user.customerTrdr!, status: 'SENT' } }),
      prisma.contractMilestone.count({ where: { partyId: null, status: 'DONE', contract: { trdr: user.customerTrdr!, status: { in: ['ACCEPTED', 'ACTIVE', 'COMPLETED'] } } } }),
    ]).then(([o, p]) => ({ contracts: o, payments: p })).catch(() => ({}))
    : {};
  const initials = (user.name ?? user.email).split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="site portal flex min-h-dvh flex-col bg-white">
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      <SiteMotion />
      <header className="sticky top-0 z-40 border-b border-(--s-line) bg-white">
        {user.viewAs && <ViewAsBar name={user.name ?? user.email} role={ROLE_ONE[user.role.key ?? ''] ?? ''} admin={user.viewAs.adminName} />}
        <div className="mx-auto flex h-16 w-full max-w-[90rem] items-center gap-4 px-5 sm:px-8 lg:px-12">
          {/* Κινητό: <details> — δουλεύει χωρίς JavaScript. */}
          <details className="lg:hidden">
            <summary className="-ml-2 grid size-11 cursor-pointer list-none place-items-center rounded-lg hover:bg-(--s-paper) [&::-webkit-details-marker]:hidden" aria-label="Μενού">
              <FiMenu className="size-6" aria-hidden />
            </summary>
            <nav aria-label="Περιοχή πελάτη (κινητό)" className="absolute inset-x-0 top-full z-50 h-[calc(100dvh-4rem)] overflow-y-auto border-t border-(--s-line) bg-(--s-paper) px-4 pb-10 pt-4">
              <ul className="space-y-2">
                {nav.map((n) => (
                  <li key={n.key}>
                    <Link href={n.href} aria-current={n.key === active ? 'page' : undefined}
                      className="flex items-center gap-4 rounded-xl bg-white p-4 ring-1 ring-(--s-line) aria-[current=page]:ring-2 aria-[current=page]:ring-(--s-ink)">
                      <span className="grid size-11 shrink-0 place-items-center rounded-full" style={{ background: `${n.tone}14`, color: n.tone }}><n.icon className="size-5" aria-hidden /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-(length:--fs-17) font-semibold text-(--s-ink)">{n.label}</span>
                        <span className="block text-(length:--fs-14) text-(--s-ink-2)">{n.hint}</span>
                      </span>
                      {badges[n.key] ? <span className="grid min-w-6 place-items-center rounded-full px-1.5 text-(length:--fs-12) font-semibold text-white" style={{ background: n.tone }}>{badges[n.key]}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
              {customer && <Link href="/dashboard/customer/orders/new" className="p-btn p-btn-primary mt-6 w-full"><FiPlus className="size-4" aria-hidden />Νέα παραγγελία υλικών</Link>}
            </nav>
          </details>
          <Link href="/" aria-label="Atelier by Damask — website" className="relative block h-10 w-[4.875rem] shrink-0">
            <Image src="/site/brand/logo-black.png" alt="" fill sizes="86px" className="object-contain" priority />
          </Link>
          <span className="hidden border-l border-(--s-line) pl-4 text-(length:--fs-14) font-medium text-(--s-ink-2) md:block">Πύλη {AUDIENCE[user.role.key ?? ''] ?? 'συνεργατών'}</span>
          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
            {customer && (
              <>
                <Link href="/dashboard/customer/orders/new" aria-current={active === 'new-order' ? 'page' : undefined} className="p-btn p-btn-ghost hidden md:inline-flex"><FiPlus className="size-4" aria-hidden />Νέα παραγγελία</Link>
                <Link href="/dashboard/customer/requests" className="p-btn p-btn-accent hidden sm:inline-flex"><FiMessageSquare className="size-4" aria-hidden />Ζητήστε προσφορά</Link>
              </>
            )}
            <div className="hidden min-w-0 items-center gap-3 border-l border-(--s-line) pl-4 xl:flex">
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-(--s-ink) text-(length:--fs-14) font-semibold text-white">{initials}</span>
              <div className="min-w-0 max-w-48">
                <p className="truncate text-(length:--fs-14) font-semibold text-(--s-ink)">{user.name ?? user.email}</p>
                {org && <p className="truncate text-(length:--fs-13) text-(--s-ink-2)">{org}</p>}
              </div>
            </div>
            {/* Σε «Προβολή ως» η αποσύνδεση θα έβγαζε τον διαχειριστή — η έξοδος γίνεται από τη μπάρα. */}
            {!user.viewAs && (
              <form action="/api/auth/logout" method="post">
                <button className="inline-flex size-11 cursor-pointer items-center justify-center rounded-lg text-(--s-ink-2) transition-colors hover:bg-(--s-paper) hover:text-(--s-ink)" aria-label="Αποσύνδεση" title="Αποσύνδεση">
                  <FiLogOut className="size-5" aria-hidden />
                </button>
              </form>
            )}
          </div>
        </div>
        {/* Πλοήγηση: εικονίδιο + χρώμα ενότητας, μία γραμμή, μετρητής εκκρεμοτήτων. */}
        <nav aria-label="Περιοχή πελάτη" className="hidden border-t border-(--s-line) lg:block">
          <ul className="mx-auto flex w-full max-w-[90rem] items-stretch gap-1 overflow-x-auto px-8 [scrollbar-width:none] lg:px-10">
            {nav.map((n) => {
              const on = n.key === active;
              return (
                <li key={n.key} className="shrink-0">
                  <Link href={n.href} aria-current={on ? 'page' : undefined} title={n.hint}
                    className={cn('group relative flex h-14 items-center gap-2.5 rounded-t-lg px-3.5 text-(length:--fs-15) transition-colors', on ? 'font-semibold text-(--s-ink)' : 'font-medium text-(--s-ink-2) hover:bg-(--s-paper) hover:text-(--s-ink)')}
                    style={on ? { background: `${n.tone}0F` } : undefined}>
                    <span className="grid size-8 place-items-center rounded-full transition-colors" style={{ background: on ? n.tone : `${n.tone}14`, color: on ? '#fff' : n.tone }}><n.icon className="size-4" aria-hidden /></span>
                    {n.label}
                    {badges[n.key] ? <span className="grid min-w-5 place-items-center rounded-full px-1.5 text-(length:--fs-12) font-semibold text-white" style={{ background: n.tone }} aria-label={`${badges[n.key]} εκκρεμότητες`}>{badges[n.key]}</span> : null}
                    <span aria-hidden className={cn('absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-transform duration-300', on ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100')} style={{ background: n.tone }} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
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
