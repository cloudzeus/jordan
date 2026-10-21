import type { Metadata } from 'next';
import { requireParty } from '@/lib/rbac';
import { NotLinked, PartyHome } from '../_party/party-home';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Συνεργείο' };

/** Συνεργεία (προμηθευτές SoftOne με ρόλο SUPPLIER): αναθέσεις, πρόγραμμα, πληρωμές. */
export default async function SupplierHome() {
  const { user, party } = await requireParty();
  return party ? <PartyHome user={user} party={party} /> : <NotLinked user={user} />;
}
