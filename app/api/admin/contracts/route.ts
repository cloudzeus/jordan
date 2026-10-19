import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { contractInput } from '@/lib/contracts/core';
import { createContract, listContracts } from '@/lib/contracts/service';
import { fail } from './_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  await requirePermission('projects.read');
  return NextResponse.json({ contracts: await listContracts() });
}

// POST — νέα σύμβαση/προσφορά (ολόκληρη: κεφαλίδα, γραμμές, συνεργεία, μέλη, milestones).
export async function POST(req: Request) {
  const u = await requirePermission('projects.manage');
  try {
    const input = contractInput.parse(await req.json().catch(() => null));
    const id = await createContract(input, u.id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'contract.create', resource: 'contract', resourceId: id, metadata: { title: input.title, kind: input.kind } }).catch(() => null);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) { return fail(e); }
}
