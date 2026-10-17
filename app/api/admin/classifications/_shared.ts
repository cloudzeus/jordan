import { NextResponse } from 'next/server';
import { SoftoneError } from '@/lib/softone';
import { ClassificationError } from '@/lib/item-classifications';

export function classificationErrorResponse(e: unknown) {
  if (e instanceof ClassificationError) return NextResponse.json({ error: 'classification_error', message: e.message }, { status: e.status });
  if (e instanceof SoftoneError) return NextResponse.json({ error: 'softone_error', message: e.message }, { status: 502 });
  throw e;
}
