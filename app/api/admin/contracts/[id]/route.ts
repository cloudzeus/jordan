import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { contractInput } from '@/lib/contracts/core';
import { deleteContract, getContract, updateContract } from '@/lib/contracts/service';
import { fail, idOf } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requirePermission('projects.read');
  const c = await getContract(await idOf(ctx));
  return c ? NextResponse.json({ contract: c }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requirePermission('projects.manage');
  const id = await idOf(ctx);
  try {
    await updateContract(id, contractInput.parse(await req.json().catch(() => null)), u.id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'contract.update', resource: 'contract', resourceId: id }).catch(() => null);
    return NextResponse.json({ contract: await getContract(id) });
  } catch (e) { return fail(e); }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requirePermission('projects.manage');
  const id = await idOf(ctx);
  try {
    await deleteContract(id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'contract.delete', resource: 'contract', resourceId: id }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
