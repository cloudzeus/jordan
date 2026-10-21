import { NextResponse } from 'next/server';
import { FloorPlanError } from '@/lib/floorplan/plans';

export function planFail(e: unknown) {
  if (e instanceof FloorPlanError) return NextResponse.json({ error: 'floorplan', message: e.message }, { status: e.status });
  console.error('[floorplan]', e);
  return NextResponse.json({ error: 'internal', message: e instanceof Error ? e.message : 'Σφάλμα' }, { status: 500 });
}
