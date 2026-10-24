// lib/text-assist/access.ts — SERVER. Ποιος καλεί τον βοηθό κειμένου (φωνή + AI μορφοποίηση).
import 'server-only';
import { NextResponse } from 'next/server';
import { getCurrentUserWithPermissions, type UserWithRole } from '@/lib/rbac';
import { textAssistAllowed } from './core';

/** Για route handlers: ο χρήστης ή απάντηση 401/403 (ποτέ redirect). */
export async function requireTextAssistApi(): Promise<NonNullable<UserWithRole> | NextResponse> {
  const u = await getCurrentUserWithPermissions();
  if (!u) return NextResponse.json({ error: 'unauthorized', message: 'Απαιτείται σύνδεση' }, { status: 401 });
  if (!textAssistAllowed(u.role.key)) {
    return NextResponse.json({ error: 'forbidden', message: 'Η φωνητική καταχώριση και η AI μορφοποίηση είναι διαθέσιμες μόνο σε διαχειριστές' }, { status: 403 });
  }
  return u;
}
