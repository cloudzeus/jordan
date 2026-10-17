import { NextResponse } from 'next/server';
import { AccessError, type HolderKind } from '@/lib/portal-access';
import { hasPermission } from '@/lib/rbac';

export const KINDS: HolderKind[] = ['customer-contact', 'partner-contact', 'partner'];
export const kindOf = (k: string): HolderKind | null => (KINDS as string[]).includes(k) ? (k as HolderKind) : null;

export function accessErrorResponse(e: unknown) {
  if (e instanceof AccessError) return NextResponse.json({ error: 'access_error', message: e.message }, { status: e.status });
  throw e;
}
export const invalid = (issues: { message: string; path: PropertyKey[] }[]) =>
  NextResponse.json({ error: 'invalid_input', message: issues[0]?.message ?? 'Μη έγκυρα στοιχεία', field: issues[0]?.path?.join('.') ?? null }, { status: 400 });

/** Πρόσβαση ΣΥΝΕΡΓΑΤΩΝ στο portal: εκτός από users.* χρειάζεται και partners.access. null = εντάξει. */
export async function partnerAccessDenied(kind: HolderKind) {
  if (kind === 'customer-contact') return null;
  return (await hasPermission('partners.access'))
    ? null
    : NextResponse.json({ error: 'forbidden', message: 'Χρειάζεται το δικαίωμα «Πρόσβαση συνεργατών στο portal».' }, { status: 403 });
}
