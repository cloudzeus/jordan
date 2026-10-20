import Link from 'next/link';
import type { Metadata } from 'next';
import { FiSearch } from 'react-icons/fi';
import { siteCategories, siteProducts } from '@/lib/site-catalog';
import { Container, Eyebrow, inputCls } from '@/components/site/ui';
import { cn } from '@/lib/utils';
import { ProductCard } from './product-card';

export const metadata: Metadata = { title: 'Υλικά', description: 'Κατάλογος υλικών: φυσική πέτρα, πλακίδια, κόλλες και υλικά τοποθέτησης.' };

type SP = Promise<{ q?: string; category?: string; page?: string }>;

function href(base: { q?: string; category?: number | null }, page?: number) {
  const u = new URLSearchParams();
  if (base.q) u.set('q', base.q);
  if (base.category != null) u.set('category', String(base.category));
  if (page && page > 1) u.set('page', String(page));
  const s = u.toString();
  return s ? `/products?${s}` : '/products';
}

export default async function ProductsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 80) || undefined;
  const category = sp.category && /^\d+$/.test(sp.category) ? Number(sp.category) : null;
  const page = Math.max(1, Number(sp.page) || 1);
  const [cats, res] = await Promise.all([siteCategories().catch(() => []), siteProducts({ q, category, page })]);
  const active = cats.find((c) => c.code === category);

  return (
    <Container className="py-14 md:py-20">
      <Eyebrow>Κατάλογος</Eyebrow>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-8">
        <h1 className="font-site text-(length:--fs-36) font-light leading-none">{active?.name ?? 'Υλικά'}</h1>
        <form action="/products" role="search" className="relative w-full max-w-sm">
          {category != null && <input type="hidden" name="category" value={category} />}
          <label htmlFor="q" className="sr-only">Αναζήτηση υλικού</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Αναζήτηση — όνομα ή κωδικός" className={cn(inputCls, 'pr-12')} />
          <button type="submit" className="absolute right-0 top-0 grid size-12 cursor-pointer place-items-center text-(--s-ink-2) hover:text-(--s-ink)" aria-label="Αναζήτηση">
            <FiSearch className="size-4" aria-hidden />
          </button>
        </form>
      </div>

      {cats.length > 0 && (
        <nav aria-label="Κατηγορίες" className="-mx-5 mt-10 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          <ul className="flex min-w-max gap-2 sm:min-w-0 sm:flex-wrap">
            {[{ code: null as number | null, name: 'Όλα', count: null as number | null }, ...cats].map((c) => {
              const on = c.code === category;
              return (
                <li key={c.code ?? 'all'}>
                  <Link
                    href={href({ q, category: c.code })}
                    aria-current={on ? 'page' : undefined}
                    className={cn(
                      'inline-flex min-h-11 items-center gap-2 border px-4 text-(length:--fs-14) transition-colors',
                      on ? 'border-(--s-ink) bg-(--s-ink) text-white' : 'border-(--s-line) text-(--s-ink-2) hover:border-(--s-ink) hover:text-(--s-ink)',
                    )}
                  >
                    {c.name}{c.count != null && <span className={on ? 'text-white/70' : 'text-(--s-mute)'}>{c.count}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <p className="mt-10 border-t border-(--s-line) pt-5 text-(length:--fs-14) text-(--s-mute)" aria-live="polite">
        {res.total === 0 ? 'Κανένα αποτέλεσμα' : `${res.total.toLocaleString('el-GR')} ${res.total === 1 ? 'είδος' : 'είδη'}`}
        {q && <> για «{q}» · <Link href={href({ category })} className="s-link text-(--s-ink)">καθαρισμός</Link></>}
      </p>

      {res.items.length === 0 ? (
        <div className="py-24 text-center">
          <p className="font-site text-(length:--fs-24) font-light">Δεν βρέθηκε κάτι εδώ.</p>
          <p className="mt-3 text-(length:--fs-15) text-(--s-ink-2)">Δοκιμάστε άλλη λέξη ή <Link href="/products" className="s-link text-(--s-ink)">δείτε όλα τα υλικά</Link>.</p>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 md:gap-x-6 lg:grid-cols-4">
          {res.items.map((p) => <li key={p.mtrl}><ProductCard p={p} /></li>)}
        </ul>
      )}

      {res.pages > 1 && (
        <nav aria-label="Σελίδες" className="mt-16 flex items-center justify-between border-t border-(--s-line) pt-6 text-(length:--fs-15)">
          {page > 1 ? <Link href={href({ q, category }, page - 1)} className="inline-flex min-h-11 items-center s-link">← Προηγούμενη</Link> : <span />}
          <span className="tabular-nums text-(--s-mute)">{page} / {res.pages}</span>
          {page < res.pages ? <Link href={href({ q, category }, page + 1)} className="inline-flex min-h-11 items-center s-link">Επόμενη →</Link> : <span />}
        </nav>
      )}
    </Container>
  );
}
