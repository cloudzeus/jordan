import { redirect } from 'next/navigation';
import { cache } from 'react';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

export type UserWithRole = Awaited<ReturnType<typeof getCurrentUserWithPermissions>>;

export const getCurrentUserWithPermissions = cache(async () => {
  const base = await getCurrentUser();
  if (!base) return null;
  const user = await prisma.user.findUnique({
    where: { id: base.id },
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  });
  // Ανενεργός χρήστης = μη συνδεδεμένος. Η συνεδρία είναι JWT (cookie), οπότε χωρίς αυτόν τον
  // έλεγχο η απενεργοποίηση δεν έκοβε κάποιον που ήταν ήδη μέσα.
  if (!user || !user.isActive) return null;
  const permissionKeys = new Set(user.role.permissions.map((rp) => rp.permission.key));
  return { ...user, permissionKeys };
});

export async function hasPermission(key: string): Promise<boolean> {
  const u = await getCurrentUserWithPermissions();
  if (!u) return false;
  if (u.role.key === 'SUPER_ADMIN') return true;
  return u.permissionKeys.has(key);
}

export async function requireUser() {
  const u = await getCurrentUserWithPermissions();
  if (!u) redirect('/auth/signin');
  return u;
}

export async function requirePermission(key: string) {
  const u = await requireUser();
  if (u.role.key === 'SUPER_ADMIN') return u;
  if (!u.permissionKeys.has(key)) redirect('/dashboard?error=forbidden');
  return u;
}

export async function requireAnyPermission(...keys: string[]) {
  const u = await requireUser();
  if (u.role.key === 'SUPER_ADMIN') return u;
  if (!keys.some((k) => u.permissionKeys.has(k))) redirect('/dashboard?error=forbidden');
  return u;
}

/** Εξωτερικοί ρόλοι (portal) → η αρχική τους σελίδα. */
export const PORTAL_HOME: Partial<Record<string, string>> = {
  CUSTOMER: '/dashboard/customer',
  COLLABORATOR: '/dashboard/collaborator',
  SUPPLIER: '/dashboard/supplier',
};

/** Μόνο προσωπικό (admin/υπάλληλοι): πελάτες/συνεργάτες/προμηθευτές πάνε στο portal τους. */
export async function requireStaff() {
  const u = await requireUser();
  const portal = u.role.key ? PORTAL_HOME[u.role.key] : undefined;
  if (portal) redirect(portal);
  return u;
}

/** Μόνο εξωτερικός χρήστης του portal (πελάτης/συνεργάτης). */
export async function requirePortalUser() {
  const u = await requireUser();
  if (u.role.key !== 'CUSTOMER' && u.role.key !== 'COLLABORATOR') redirect('/admin');
  return u;
}

/**
 * Μόνο πελάτης του B2B portal δεμένος με SoftOne TRDR. Τα έργα/παραγγελίες ΔΕΝ υπάρχουν για
 * συνεργάτες (δεν έχουν TRDR) — αυτοί επιστρέφουν στις προσφορές τους.
 */
export async function requireCustomer() {
  const u = await requirePortalUser();
  if (u.role.key !== 'CUSTOMER' || u.customerTrdr == null) redirect(PORTAL_HOME[u.role.key ?? ''] ?? '/dashboard');
  return { ...u, customerTrdr: u.customerTrdr };
}

/** Για route handlers: ο TRDR του συνδεδεμένου πελάτη ή null (ποτέ από το σώμα του αιτήματος). */
export function customerTrdrOf(u: UserWithRole): number | null {
  return u && u.isActive && u.role.key === 'CUSTOMER' && u.customerTrdr != null ? u.customerTrdr : null;
}
