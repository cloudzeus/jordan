import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { membersOf } from '@/lib/item-classifications';
import { classificationErrorResponse } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?kind=CATEGORY|GROUP&sodtype=51|52&code=N — τα ενεργά είδη της κατηγορίας/ομάδας.
export async function GET(req: Request) {
  await requirePermission('classifications.read');
  const q = new URL(req.url).searchParams;
  const kind = q.get('kind');
  const sodtype = Number(q.get('sodtype'));
  const code = Number(q.get('code'));
  if ((kind !== 'CATEGORY' && kind !== 'GROUP') || ![51, 52].includes(sodtype) || !Number.isInteger(code)) {
    return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  }
  try {
    return NextResponse.json({ items: await membersOf(kind, sodtype, code) });
  } catch (e) { return classificationErrorResponse(e); }
}
