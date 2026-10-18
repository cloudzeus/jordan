import 'server-only';
import { prisma } from '@/lib/db';
import { resolveLayout, sanitizeLayout, type Access, type Layout } from './widgets';

type StaffUser = { id: string; role: { key: string | null }; permissionKeys: ReadonlySet<string> };

export const accessOf = (u: StaffUser): Access => ({ roleKey: u.role.key, permissions: u.permissionKeys });

/** Η διάταξη του χρήστη, περιορισμένη σε ό,τι επιτρέπεται τώρα (αλλιώς η προεπιλογή του ρόλου). */
export async function loadLayout(u: StaffUser): Promise<{ layout: Layout; custom: boolean }> {
  const row = await prisma.dashboardLayout.findUnique({ where: { userId: u.id }, select: { layout: true } });
  return { layout: resolveLayout(row?.layout ?? null, accessOf(u)), custom: !!row };
}

export async function saveLayout(u: StaffUser, raw: unknown): Promise<Layout | null> {
  const clean = sanitizeLayout(raw);
  if (!clean) return null;
  await prisma.dashboardLayout.upsert({ where: { userId: u.id }, update: { layout: clean }, create: { userId: u.id, layout: clean } });
  return resolveLayout(clean, accessOf(u));
}

export async function resetLayout(userId: string) {
  await prisma.dashboardLayout.deleteMany({ where: { userId } });
}
