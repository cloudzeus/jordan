import Link from 'next/link';
import { Container, Eyebrow } from '@/components/site/ui';

/**
 * Σελίδα νομικού κειμένου του website (όροι, απόρρητο, cookies): μία στήλη ανάγνωσης, αριθμημένες
 * ενότητες, πλοήγηση ανάμεσα στα τρία κείμενα. Το περιεχόμενο ζει στις σελίδες (app/(site)/legal/*).
 */
export const LEGAL_UPDATED = '18 Οκτωβρίου 2026';

const DOCS = [
  { href: '/legal/terms', label: 'Όροι χρήσης' },
  { href: '/legal/privacy', label: 'Πολιτική απορρήτου' },
  { href: '/legal/cookies', label: 'Cookies' },
];

export function LegalPage({ title, current, intro, children }: { title: string; current: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Container className="py-14 md:py-20">
      <div className="mx-auto max-w-3xl">
        <Eyebrow>Νομικά</Eyebrow>
        <h1 className="font-site mt-4 text-[length:var(--fs-36)] font-light leading-tight">{title}</h1>
        <p className="mt-3 text-[length:var(--fs-14)] text-[var(--s-mute)]">Τελευταία ενημέρωση: {LEGAL_UPDATED}</p>
        <nav aria-label="Νομικά κείμενα" className="mt-8 flex flex-wrap gap-2">
          {DOCS.map((d) => (
            <Link key={d.href} href={d.href} aria-current={d.href === current ? 'page' : undefined}
              className="inline-flex min-h-11 items-center border border-[var(--s-line)] px-4 text-[length:var(--fs-14)] text-[var(--s-ink-2)] hover:border-[var(--s-ink)] aria-[current=page]:border-[var(--s-ink)] aria-[current=page]:bg-[var(--s-ink)] aria-[current=page]:text-white">
              {d.label}
            </Link>
          ))}
        </nav>
        {intro && <div className="mt-10 text-[length:var(--fs-16)] leading-relaxed text-[var(--s-ink-2)]">{intro}</div>}
        <div className="legal mt-10 space-y-10">{children}</div>
      </div>
    </Container>
  );
}

export function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`s${n}`} className="border-t border-[var(--s-line)] pt-6">
      <h2 id={`s${n}`} className="font-site text-[length:var(--fs-20)] font-light">
        <span className="font-num mr-3 tabular-nums text-[var(--s-mute)]">{String(n).padStart(2, '0')}</span>{title}
      </h2>
      <div className="mt-4 space-y-3 text-[length:var(--fs-15)] leading-relaxed text-[var(--s-ink-2)] [&_li]:pl-1 [&_strong]:font-medium [&_strong]:text-[var(--s-ink)] [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

/** Ταυτότητα υπευθύνου/παρόχου — ίδια σε όλα τα κείμενα. */
export function CompanyBlock({ c }: { c: { legal: string; brand: string; vat: string | null; address: string; phones: string[]; salesEmail: string; privacyEmail: string } }) {
  return (
    <dl className="grid gap-x-6 gap-y-1.5 bg-[var(--s-paper)] px-5 py-4 text-[length:var(--fs-15)] sm:grid-cols-[10rem_1fr]">
      <dt className="text-[var(--s-mute)]">Επωνυμία</dt><dd className="text-[var(--s-ink)]">{c.legal} («{c.brand}»)</dd>
      {c.vat && <><dt className="text-[var(--s-mute)]">ΑΦΜ</dt><dd className="tabular-nums text-[var(--s-ink)]">{c.vat}</dd></>}
      <dt className="text-[var(--s-mute)]">Έδρα / atelier</dt><dd className="text-[var(--s-ink)]">{c.address}</dd>
      <dt className="text-[var(--s-mute)]">Τηλέφωνα</dt><dd className="tabular-nums text-[var(--s-ink)]">{c.phones.join(' · ')}</dd>
      <dt className="text-[var(--s-mute)]">Email</dt><dd className="text-[var(--s-ink)]"><a className="s-link" href={`mailto:${c.salesEmail}`}>{c.salesEmail}</a>{c.privacyEmail !== c.salesEmail && <> · <a className="s-link" href={`mailto:${c.privacyEmail}`}>{c.privacyEmail}</a></>}</dd>
    </dl>
  );
}
