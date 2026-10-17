import Link from 'next/link';
import { FiLogOut } from 'react-icons/fi';
import { company } from '@/lib/site-catalog';
import { homeFor } from '@/lib/auth-home';
import type { UserWithRole } from '@/lib/rbac';
import { Container } from '@/components/site/ui';

/** Πλαίσιο της περιοχής πελατών/συνεργατών — ίδιο ύφος με το website (λευκό, λεπτές γραμμές). */
export async function PortalShell({ user, org, children }: { user: NonNullable<UserWithRole>; org: string | null; children: React.ReactNode }) {
  const c = await company();
  const home = homeFor(user.role.key);
  return (
    <div className="site flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-[var(--s-line)] bg-white/95 backdrop-blur-sm">
        <Container className="flex h-16 items-center gap-6">
          <Link href="/" className="font-num text-[length:var(--fs-20)] font-light uppercase tracking-[0.14em]">{c.name}</Link>
          <nav aria-label="Περιοχή πελάτη" className="hidden items-center gap-6 sm:flex">
            <Link href={home} className="s-link text-[length:var(--fs-14)] text-[var(--s-ink-2)] hover:text-[var(--s-ink)]">Προσφορές</Link>
            <Link href="/products" className="s-link text-[length:var(--fs-14)] text-[var(--s-ink-2)] hover:text-[var(--s-ink)]">Κατάλογος</Link>
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
          <span>{c.name}</span>
          <span>{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
        </Container>
      </footer>
    </div>
  );
}
