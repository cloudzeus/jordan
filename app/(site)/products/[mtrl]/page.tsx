import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { company, related, siteProduct } from '@/lib/site-catalog';
import { getCurrentUserWithPermissions } from '@/lib/rbac';
import { homeFor, isStaffRole } from '@/lib/auth-home';
import { btn, Container, Eyebrow } from '@/components/site/ui';
import { ProductPlaceholder } from '@/components/site/visuals';
import { ProductCard } from '../product-card';

type Params = Promise<{ mtrl: string }>;
const parse = (s: string) => (/^\d{1,10}$/.test(s) ? Number(s) : null);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const id = parse((await params).mtrl);
  const p = id != null ? await siteProduct(id) : null;
  return p ? { title: p.name, description: `${p.name}${p.category?.name ? ` — ${p.category.name}` : ''}. Κωδικός ${p.code}.` } : { title: 'Υλικό' };
}

export default async function ProductPage({ params }: { params: Params }) {
  const id = parse((await params).mtrl);
  const p = id != null ? await siteProduct(id) : null;
  if (!p) notFound();
  const [c, rel, user] = await Promise.all([company(), related(p.mtrl, p.category?.code), getCurrentUserWithPermissions().catch(() => null)]);
  const [main, ...rest] = p.photos;
  const subject = encodeURIComponent(`Ενδιαφέρον για ${p.name} (${p.code})`);

  const specs: [string, string][] = [
    ['Κωδικός', p.code ?? '—'],
    ...(p.category?.name ? [['Κατηγορία', p.category.name] as [string, string]] : []),
    ...(p.group ? [['Ομάδα', p.group] as [string, string]] : []),
    ...(p.unit ? [['Μονάδα', p.unit] as [string, string]] : []),
    ...p.attributes.map((a) => [a.name, `${a.value}${a.unit ? ` ${a.unit}` : ''}`] as [string, string]),
  ];

  return (
    <Container className="py-10 md:py-16">
      <nav aria-label="Διαδρομή" className="text-[length:var(--fs-13)] text-[var(--s-mute)]">
        <Link href="/products" className="s-link">Υλικά</Link>
        {p.category?.name && <> <span aria-hidden>/</span> <Link href={`/products?category=${p.category.code}`} className="s-link">{p.category.name}</Link></>}
      </nav>

      <div className="mt-8 grid gap-10 md:grid-cols-[1.2fr_1fr] md:gap-16">
        <div className="space-y-4">
          <div className="relative aspect-square overflow-hidden bg-[var(--s-paper)]">
            {main
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={main.url} alt={p.name} className="size-full object-cover" />
              : <ProductPlaceholder mtrl={p.mtrl} name={p.name} />}
          </div>
          {rest.length > 0 && (
            <ul className="grid grid-cols-4 gap-4">
              {rest.slice(0, 8).map((ph, i) => (
                <li key={ph.url} className="aspect-square overflow-hidden bg-[var(--s-paper)]">
                  <a href={ph.url} target="_blank" rel="noreferrer" aria-label={`Φωτογραφία ${i + 2} σε πλήρες μέγεθος`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ph.thumb} alt="" loading="lazy" className="size-full object-cover" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="md:pt-4">
          {p.category?.name && <Eyebrow>{p.category.name}</Eyebrow>}
          <h1 className="font-site mt-4 text-[length:var(--fs-28)] font-light leading-tight">{p.name}</h1>
          {p.name2 && p.name2 !== p.name && <p className="mt-3 text-[length:var(--fs-16)] text-[var(--s-ink-2)]">{p.name2}</p>}

          <dl className="mt-10 border-t border-[var(--s-line)]">
            {specs.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[9rem_1fr] gap-4 border-b border-[var(--s-line)] py-3 text-[length:var(--fs-15)]">
                <dt className="text-[var(--s-mute)]">{k}</dt>
                <dd className="text-[var(--s-ink)]">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-10 space-y-4">
            {user?.role.key === 'CUSTOMER' && user.customerTrdr != null ? (
              <>
                <Link href={`/dashboard/customer/orders/new?add=${p.mtrl}`} className={`${btn.primary} w-full sm:w-auto`}>Προσθήκη σε νέα παραγγελία</Link>
                <p className="text-[length:var(--fs-14)] text-[var(--s-ink-2)]">Τιμή και διαθεσιμότητα επιβεβαιώνονται με την παραγγελία. <Link href={homeFor(user.role.key)} className="s-link text-[var(--s-ink)]">Δυναμικές προσφορές</Link></p>
              </>
            ) : user ? (
              <Link href={homeFor(user.role.key)} className={btn.primary}>{isStaffRole(user.role.key) ? 'Στη διαχείριση' : 'Στην περιοχή μου'}</Link>
            ) : (
              <>
                {c.email && <a href={`mailto:${c.email}?subject=${subject}`} className={`${btn.primary} w-full sm:w-auto`}>Ζητήστε προσφορά</a>}
                <p className="text-[length:var(--fs-14)] text-[var(--s-ink-2)]">
                  Επαγγελματίας με λογαριασμό; <Link href="/auth/signin" className="s-link text-[var(--s-ink)]">Συνδεθείτε</Link> για να το παραγγείλετε. Νέος συνεργάτης; <Link href="/auth/register" className="s-link text-[var(--s-ink)]">Αίτημα πρόσβασης</Link>.
                </p>
              </>
            )}
            {c.phone && <p className="text-[length:var(--fs-14)] text-[var(--s-mute)]">ή καλέστε στο <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="s-link text-[var(--s-ink)]">{c.phone}</a></p>}
          </div>
        </div>
      </div>

      {rel.length > 0 && (
        <section className="mt-24 border-t border-[var(--s-line)] pt-12" aria-labelledby="related">
          <h2 id="related" className="font-site text-[length:var(--fs-20)] font-light">Στην ίδια κατηγορία</h2>
          <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 md:gap-x-6">
            {rel.slice(0, 4).map((r) => <li key={r.mtrl}><ProductCard p={r} /></li>)}
          </ul>
        </section>
      )}
    </Container>
  );
}
