import { redirect } from 'next/navigation';
import { PORTAL_HOME, requireUser } from '@/lib/rbac';

// /dashboard: κάθε ρόλος στη σελίδα του (εδώ καταλήγουν και οι ανακατευθύνσεις «χωρίς δικαίωμα»).
export default async function DashboardHome() {
  const u = await requireUser();
  redirect((u.role.key && PORTAL_HOME[u.role.key]) || '/admin');
}
