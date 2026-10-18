import { NextResponse } from 'next/server';
import { customerTrdrOf, getCurrentUserWithPermissions } from '@/lib/rbac';
import { siteProducts } from '@/lib/site-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?q= — αναζήτηση καταλόγου για τη φόρμα «Νέα παραγγελία» (ΧΩΡΙΣ τιμές, όπως ο δημόσιος κατάλογος).
export async function GET(req: Request) {
  const u = await getCurrentUserWithPermissions();
  if (customerTrdrOf(u) == null) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim().slice(0, 80) || undefined;
  const ids = (url.searchParams.get('mtrl') ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 50);
  const res = await siteProducts({ q, take: 20, ...(ids.length ? { mtrls: ids } : {}) });
  return NextResponse.json({ items: res.items.map((i) => ({ mtrl: i.mtrl, code: i.code, name: i.name, unit: i.unit, photo: i.photo })) });
}
