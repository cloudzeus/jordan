import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { createPartner, listPartners, partnerInput } from '@/lib/partners';
import { parseBody } from './_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — λίστα συνεργατών (τοπικό μητρώο).
export async function GET() {
  await requirePermission('metadata.read');
  return NextResponse.json({ partners: await listPartners() });
}

// POST — νέος συνεργάτης (εταιρία ή πρόσωπο).
export async function POST(req: Request) {
  const u = await requirePermission('metadata.manage');
  const body = await parseBody(req, partnerInput);
  if (body.res) return body.res;
  const p = await createPartner(body.data);
  await logAudit({ userId: u.id, userEmail: u.email, action: 'partner.create', resource: 'partner', resourceId: p.id, metadata: { name: p.name, type: body.data.type } }).catch(() => null);
  return NextResponse.json({ partner: p }, { status: 201 });
}
