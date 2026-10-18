import type { Metadata } from 'next';
import { ATELIER_PROFILE } from '@/lib/site-company';

// Η περιοχή πελατών/συνεργατών έχει το όνομα της εταιρείας στον τίτλο της καρτέλας (όχι της εφαρμογής διαχείρισης).
export async function generateMetadata(): Promise<Metadata> {
  const brand = ATELIER_PROFILE.brand;
  return { title: { absolute: `${brand} · B2B`, template: `%s · ${brand}` }, robots: { index: false, follow: false }, icons: { icon: '/site/brand/logo-black.png' } };
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
