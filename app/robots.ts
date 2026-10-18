import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/app-url';

/** robots.txt στην τελική διεύθυνση: δημόσιο το website, ποτέ διαχείριση/portal/API. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/dashboard', '/api', '/auth', '/pay'] }],
    sitemap: `${appUrl()}/sitemap.xml`,
    host: appUrl(),
  };
}
