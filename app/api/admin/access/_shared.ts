import { NextResponse } from 'next/server';
import { AccessError, type HolderKind } from '@/lib/portal-access';

export const KINDS: HolderKind[] = ['customer-contact', 'partner-contact', 'partner'];
export const kindOf = (k: string): HolderKind | null => (KINDS as string[]).includes(k) ? (k as HolderKind) : null;

export function accessErrorResponse(e: unknown) {
  if (e instanceof AccessError) return NextResponse.json({ error: 'access_error', message: e.message }, { status: e.status });
  throw e;
}
export const invalid = (issues: { message: string; path: PropertyKey[] }[]) =>
  NextResponse.json({ error: 'invalid_input', message: issues[0]?.message ?? 'Μη έγκυρα στοιχεία', field: issues[0]?.path?.join('.') ?? null }, { status: 400 });
