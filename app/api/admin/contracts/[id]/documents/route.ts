import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { generateDocument } from '@/lib/contracts/documents';
import { getContract } from '@/lib/contracts/service';
import { fail, idOf } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const body = z.object({ partyId: z.string().min(1).nullish().transform((v) => v ?? null) });

// POST { partyId? } — νέα έκδοση εγγράφου (πελάτης ή συνεργείο): AI → PDF → αρχεία έργου/πελάτη.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requirePermission('projects.manage');
  const id = await idOf(ctx);
  try {
    const { partyId } = body.parse(await req.json().catch(() => ({})));
    const doc = await generateDocument(id, partyId, { id: u.id, name: u.name, email: u.email });
    await logAudit({ userId: u.id, userEmail: u.email, action: 'contract.document', resource: 'contract', resourceId: id, metadata: { doc: doc.id, partyId, version: doc.version } }).catch(() => null);
    return NextResponse.json({ documentId: doc.id, contract: await getContract(id) });
  } catch (e) { return fail(e); }
}
