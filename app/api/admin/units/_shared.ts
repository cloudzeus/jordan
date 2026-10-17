import { NextResponse } from 'next/server';
import { SoftoneError } from '@/lib/softone';
import { UnitError } from '@/lib/units';

export function unitErrorResponse(e: unknown) {
  if (e instanceof UnitError) return NextResponse.json({ error: 'unit_error', message: e.message }, { status: e.status });
  if (e instanceof SoftoneError) return NextResponse.json({ error: 'softone_error', message: e.message }, { status: 502 });
  throw e;
}

export const invalid = (issues: { message: string; path: PropertyKey[] }[]) =>
  NextResponse.json({ error: 'invalid_input', message: issues[0]?.message ?? 'Μη έγκυρα στοιχεία', field: issues[0]?.path?.[0] ?? null }, { status: 400 });
