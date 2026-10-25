import { redirect } from 'next/navigation';
import { cache } from 'react';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { readViewAs } from '@/lib/view-as';

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

export type PortalUser = NonNullable<UserWithRole> & {
  /** Ο διαχειριστής βλέπει το portal ως αυτόν τον χρήστη (μόνο ανάγνωση). */
  viewAs?: { adminId: string; adminName: string; back: string };
};

/**
 * Ο χρήστης που «βλέπει» το portal: ο ίδιος, ή — για διαχειριστή με `portal.view_as` σε λειτουργία
 * «Προβολή ως» — ο πελάτης/συνεργάτης/συνεργείο-στόχος. ΜΟΝΟ για ανάγνωση (σελίδες, λήψεις αρχείων) —
 * μοναδική εξαίρεση το αίτημα προσφοράς εκ μέρους του πελάτη (createOfferRequestAction, με καταγραφή).
 * Οι υπόλοιπες ενέργειες χρησιμοποιούν `getCurrentUserWithPermissions()`, άρα εκεί ο διαχειριστής δεν
 * ενεργεί εκ μέρους του πελάτη.
 */
export const getPortalUser = cache(async (): Promise<PortalUser | null> => {
  const real = await getCurrentUserWithPermissions();
  if (!real) return null;
  if (real.role.key && PORTAL_HOME[real.role.key]) return real;
  if (real.role.key !== 'SUPER_ADMIN' && !real.permissionKeys.has('portal.view_as')) return real;
  const claims = await readViewAs(real.id);
  if (!claims) return real;
  const t = await prisma.user.findUnique({ where: { id: claims.sub }, include: { role: { include: { permissions: { include: { permission: true } } } } } });
  if (!t || !t.isActive || !t.role.key || !PORTAL_HOME[t.role.key]) return real;
  return { ...t, permissionKeys: new Set<string>(), viewAs: { adminId: real.id, adminName: real.name ?? real.email, back: claims.back } };
});

/** Μόνο εξωτερικός χρήστης του portal (πελάτης/συνεργάτης/συνεργείο) — ή διαχειριστής σε «Προβολή ως». */
export async function requirePortalUser(): Promise<PortalUser> {
  const u = await getPortalUser();
  if (!u) redirect('/auth/signin');
  if (u.role.key !== 'CUSTOMER' && u.role.key !== 'COLLABORATOR' && u.role.key !== 'SUPPLIER') redirect('/admin');
  return u;
}

/** Ποιος «εκτελεί» στο portal: συνεργάτης (Partner) ή συνεργείο (προμηθευτής SoftOne). */
export type PartyRef = { partnerId: string; supplierTrdr: null } | { partnerId: null; supplierTrdr: number };

export function partyOf(u: UserWithRole): PartyRef | null {
  if (!u || !u.isActive) return null;
  if (u.role.key === 'COLLABORATOR' && u.partnerId) return { partnerId: u.partnerId, supplierTrdr: null };
  if (u.role.key === 'SUPPLIER' && u.supplierTrdr != null) return { partnerId: null, supplierTrdr: u.supplierTrdr };
  return null;
}

/** Συνεργάτης ή συνεργείο. `party` = null όταν ο λογαριασμός δεν έχει δεθεί ακόμη (η σελίδα το λέει). */
export async function requireParty() {
  const u = await requirePortalUser();
  if (u.role.key === 'CUSTOMER') redirect('/dashboard/customer');
  return { user: u, party: partyOf(u) };
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
