import { NextResponse } from 'next/server';
import { publicSlots } from '@/lib/appointments';
import { isDateStr } from '@/lib/appointments-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?from=YYYY-MM-DD&days=14 — οι ελεύθερες ώρες για το website (καμία πληροφορία για κρατήσεις άλλων).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const days = Number(url.searchParams.get('days') ?? 14) || 14;
  const data = await publicSlots(from && isDateStr(from) ? from : null, days);
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
