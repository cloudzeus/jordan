import Link from 'next/link';
import type { SiteKind } from '@/lib/site-catalog';
import { ProductPlaceholder } from '@/components/site/visuals';

type P = { mtrl: number; code: string | null; name: string; unit: string | null; photo: string | null; kind: SiteKind };

/** Κάρτα καταλόγου — χωρίς τιμή (οι τιμές μόνο στην περιοχή πελατών). */
export function ProductCard({ p }: { p: P }) {
  return (
    <Link href={`/products/${p.mtrl}`} className="group block">
      <div className="relative aspect-square overflow-hidden bg-(--s-paper)">
        {p.photo
          // eslint-disable-next-line @next/next/no-img-element -- φωτογραφίες από το CDN (Bunny), ήδη σε σωστό μέγεθος
          ? <img src={p.photo} alt={p.name} loading="lazy" decoding="async" className="s-img size-full object-cover" />
          : <ProductPlaceholder mtrl={p.mtrl} name={p.name} />}
      </div>
      <p className="mt-4 text-(length:--fs-15) leading-snug text-(--s-ink) group-hover:underline group-hover:underline-offset-4">{p.name}</p>
      <p className="mt-1 text-(length:--fs-13) text-(--s-mute)">{p.code}{p.unit ? ` · ${p.unit}` : ''}</p>
    </Link>
  );
}
