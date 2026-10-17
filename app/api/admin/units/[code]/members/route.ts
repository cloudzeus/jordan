import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { unitMembers } from '@/lib/units';
import { unitErrorResponse } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — ενεργά είδη/υπηρεσίες που χρησιμοποιούν τη μονάδα (βασική / αγορών / πώλησης).
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  await requirePermission('units.read');
  const code = Number((await ctx.params).code);
  if (!Number.isInteger(code)) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  try { return NextResponse.json({ items: await unitMembers(code) }); } catch (e) { return unitErrorResponse(e); }
}
