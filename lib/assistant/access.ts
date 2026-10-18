// lib/assistant/access.ts — SERVER. Ποιος βλέπει / καλεί τον Air Jordan.
//
// ΜΟΝΟ ADMIN και SUPER_ADMIN — ο ρόλος ελέγχεται ΠΑΝΤΑ, ακόμη κι αν κάποιος δώσει το δικαίωμα
// `assistant.use` σε άλλον ρόλο (ο βοηθός βλέπει οικονομικά έργων και καρτέλες). Μέσα στους δύο
// ρόλους, το δικαίωμα επιτρέπει να κοπεί η πρόσβαση σε συγκεκριμένο admin.
import 'server-only';
import { NextResponse } from 'next/server';
import { getCurrentUserWithPermissions, type UserWithRole } from '@/lib/rbac';
import { assistantAllowed } from './access-rules';

export type AssistantUser = NonNullable<UserWithRole> & { canFinancials: boolean; canMemory: boolean };

export async function getAssistantUser(): Promise<AssistantUser | null> {
  const u = await getCurrentUserWithPermissions();
  if (!u) return null;
  const roleKey = u.role.key ?? null;
  if (!assistantAllowed(roleKey, u.permissionKeys, 'assistant.use')) return null;
  return {
    ...u,
    canFinancials: roleKey === 'SUPER_ADMIN' || u.permissionKeys.has('projects.financials'),
    canMemory: assistantAllowed(roleKey, u.permissionKeys, 'assistant.memory'),
  };
}

/** Για route handlers: ο χρήστης ή απάντηση 401/403 (ποτέ redirect σε σελίδα). */
export async function requireAssistantApi(need: 'use' | 'memory' = 'use'): Promise<AssistantUser | NextResponse> {
  const u = await getAssistantUser();
  if (!u) return NextResponse.json({ error: 'forbidden', message: 'Ο Air Jordan είναι διαθέσιμος μόνο σε διαχειριστές' }, { status: 403 });
  if (need === 'memory' && !u.canMemory) return NextResponse.json({ error: 'forbidden', message: 'Χωρίς δικαίωμα διαχείρισης μνήμης' }, { status: 403 });
  return u;
}
