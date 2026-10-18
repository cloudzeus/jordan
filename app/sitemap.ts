import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/app-url';
import { siteProducts } from '@/lib/site-catalog';

export const revalidate = 3600;

/** sitemap.xml: αρχική, κατάλογος, νομικά και κάθε ενεργό είδος — στην τελική διεύθυνση. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const now = new Date();
  const fixed: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/products`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    ...['terms', 'privacy', 'cookies'].map((p) => ({ url: `${base}/legal/${p}`, lastModified: now, changeFrequency: 'yearly' as const, priority: 0.2 })),
  ];
  // Τα είδη σε σελίδες των 500· αν η βάση δεν απαντά, μένουν οι σταθερές σελίδες.
  const items: MetadataRoute.Sitemap = [];
  try {
    for (let page = 1; page <= 20; page++) {
      const r = await siteProducts({ page, take: 500 });
      items.push(...r.items.map((i) => ({ url: `${base}/products/${i.mtrl}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.5 })));
      if (page >= r.pages) break;
    }
  } catch {}
  return [...fixed, ...items];
}
