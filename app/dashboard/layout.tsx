import type { Metadata } from 'next';
import { company } from '@/lib/site-catalog';

// Η περιοχή πελατών/συνεργατών έχει το όνομα της εταιρείας στον τίτλο της καρτέλας (όχι της εφαρμογής διαχείρισης).
export async function generateMetadata(): Promise<Metadata> {
  const c = await company();
  return { title: { default: c.name, template: `%s · ${c.name}` }, robots: { index: false, follow: false } };
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
