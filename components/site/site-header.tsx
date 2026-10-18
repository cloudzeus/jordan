'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FiArrowUpRight, FiMenu, FiUser, FiX } from 'react-icons/fi';
import { cn } from '@/lib/utils';

type NavItem = { href: string; label: string };

/**
 * Κεφαλίδα του B2B website. Στην αρχική κάθεται ΔΙΑΦΑΝΗΣ πάνω στο βίντεο του showroom (λευκό λογότυπο)·
 * με την κύλιση γίνεται λευκή με μαύρο λογότυπο. Στο κινητό: πλήρης οθόνη μενού.
 */
export function SiteHeader({ nav, account, signedIn }: { nav: NavItem[]; account: { href: string; label: string }; signedIn: boolean }) {
  const path = usePathname();
  const overlayPage = path === '/';
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  React.useEffect(() => { setOpen(false); }, [path]);
  React.useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const clear = overlayPage && !scrolled && !open;

  return (
    <header className={cn('fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,color] duration-300',
      clear ? 'border-b border-transparent bg-transparent text-white' : 'border-b border-[var(--s-line)] bg-white text-[var(--s-ink)]')}>
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-6 px-5 sm:px-8 md:h-20 lg:px-12">
        <Link href="/" aria-label="Atelier by Damask — αρχική" className="relative block h-10 w-[78px] shrink-0 md:h-12 md:w-[94px]">
          <Image src="/site/brand/logo-white.png" alt="" fill sizes="94px" priority className={cn('object-contain transition-opacity duration-300', clear ? 'opacity-100' : 'opacity-0')} />
          <Image src="/site/brand/logo-black.png" alt="" fill sizes="94px" priority className={cn('object-contain transition-opacity duration-300', clear ? 'opacity-0' : 'opacity-100')} />
        </Link>
        <span className={cn('hidden border-l pl-4 text-[length:var(--fs-11)] uppercase leading-tight tracking-[0.22em] xl:block', clear ? 'border-white/30 text-white/80' : 'border-[var(--s-line)] text-[var(--s-mute)]')}>B2B πύλη<br />επαγγελματιών</span>

        <nav aria-label="Κύρια" className="ml-auto hidden items-center gap-8 lg:flex">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="group relative py-2 text-[length:var(--fs-14)]">
              {n.label}
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-current transition-transform duration-300 group-hover:scale-x-100" />
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 lg:ml-6">
          <Link href={account.href} className={cn('hidden min-h-11 items-center gap-2 border px-4 text-[length:var(--fs-14)] font-medium transition-colors sm:inline-flex',
            clear ? 'border-white/60 hover:bg-white hover:text-[var(--s-ink)]' : 'border-[var(--s-ink)] hover:bg-[var(--s-ink)] hover:text-white')}>
            <FiUser className="size-4" aria-hidden />{account.label}{signedIn && <FiArrowUpRight className="size-3.5" aria-hidden />}
          </Link>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="site-menu" aria-label={open ? 'Κλείσιμο μενού' : 'Μενού'}
            className="grid size-11 cursor-pointer place-items-center lg:hidden">
            {open ? <FiX className="size-6" aria-hidden /> : <FiMenu className="size-6" aria-hidden />}
          </button>
        </div>
      </div>

      {/* Κινητό: μενού πλήρους οθόνης με μεγάλη τυπογραφία */}
      <div id="site-menu" hidden={!open} className="fixed inset-x-0 bottom-0 top-16 overflow-y-auto bg-white px-5 pb-10 pt-6 text-[var(--s-ink)] lg:hidden">
        <nav aria-label="Κύρια (κινητό)" className="flex flex-col">
          {nav.map((n, i) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="flex items-baseline gap-4 border-b border-[var(--s-line)] py-5">
              <span className="font-num text-[length:var(--fs-14)] text-[var(--s-mute)]">0{i + 1}</span>
              <span className="font-display text-[length:var(--fs-40)]">{n.label}</span>
            </Link>
          ))}
        </nav>
        <Link href={account.href} className="mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 bg-[var(--s-ink)] px-6 text-[length:var(--fs-16)] font-medium text-white">
          <FiUser className="size-4" aria-hidden />{account.label}
        </Link>
        {!signedIn && <Link href="/auth/register" className="mt-3 inline-flex min-h-12 w-full items-center justify-center border border-[var(--s-ink)] px-6 text-[length:var(--fs-16)] font-medium">Αίτημα πρόσβασης</Link>}
      </div>
    </header>
  );
}
