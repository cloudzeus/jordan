import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/app-url';

export const revalidate = 3600;

/** sitemap.xml: αρχική, ραντεβού και νομικά — στην τελική διεύθυνση (ο δημόσιος κατάλογος αφαιρέθηκε). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  const now = new Date();
  const fixed: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/appointment`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    ...['terms', 'privacy', 'cookies'].map((p) => ({ url: `${base}/legal/${p}`, lastModified: now, changeFrequency: 'yearly' as const, priority: 0.2 })),
  ];
  return fixed;
}
