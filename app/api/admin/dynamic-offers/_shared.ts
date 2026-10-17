import { NextResponse } from 'next/server';
import { OfferError } from '@/lib/container-offers';
import { ItemMaintenanceError } from '@/lib/softone-sync/item-maintenance';

export function offerErrorResponse(e: unknown) {
  if (e instanceof OfferError) return NextResponse.json({ error: 'offer_error', message: e.message }, { status: e.status });
  if (e instanceof ItemMaintenanceError) return NextResponse.json({ error: e.code, message: `SoftOne: ${e.message}` }, { status: e.status });
  throw e;
}
export const invalid = (issues: { message: string; path: PropertyKey[] }[]) =>
  NextResponse.json({ error: 'invalid_input', message: issues[0]?.message ?? 'Μη έγκυρα στοιχεία', field: issues[0]?.path?.join('.') ?? null }, { status: 400 });
export type Ctx = { params: Promise<{ id: string }> };
