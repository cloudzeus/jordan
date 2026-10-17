import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { partnerAccess } from '@/lib/portal-access';
import { accessErrorResponse } from '../../../access/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — κατάσταση πρόσβασης: των προσώπων (εταιρία) ή του ίδιου (φυσικό πρόσωπο).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requirePermission('metadata.read');
  try { return NextResponse.json(await partnerAccess((await ctx.params).id)); } catch (e) { return accessErrorResponse(e); }
}
