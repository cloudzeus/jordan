import { NextResponse } from 'next/server';
import { ItemMediaError } from '@/lib/item-media/service';

export const mtrlOf = async (params: Promise<{ mtrl: string }>) => {
  const n = Number((await params).mtrl);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export const badMtrl = () => NextResponse.json({ error: 'invalid_mtrl', message: 'Άκυρο είδος.' }, { status: 400 });

export function mediaError(e: unknown) {
  if (e instanceof ItemMediaError) return NextResponse.json({ error: 'media_error', message: e.message }, { status: e.status });
  return NextResponse.json({ error: 'internal_error', message: (e as Error).message }, { status: 500 });
}
