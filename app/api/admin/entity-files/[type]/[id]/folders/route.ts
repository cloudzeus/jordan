import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { createSubfolder, deleteSubfolder } from '@/lib/entity-files/service';
import { badEntity, entityOf, filesError } from '../../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ type: string; id: string }> };

// POST { name } — νέος υποφάκελος (και ορατός φάκελος στο Bunny).
export async function POST(req: Request, { params }: Ctx) {
  await requirePermission('files.manage');
  const e = await entityOf(params);
  if (!e) return badEntity();
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json({ name: await createSubfolder(e.type, e.id, String(body?.name ?? '')) }, { status: 201 });
  } catch (err) {
    return filesError(err);
  }
}

// DELETE ?name=… — μόνο άδειος υποφάκελος.
export async function DELETE(req: Request, { params }: Ctx) {
  await requirePermission('files.manage');
  const e = await entityOf(params);
  if (!e) return badEntity();
  try {
    await deleteSubfolder(e.type, e.id, new URL(req.url).searchParams.get('name') ?? '');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return filesError(err);
  }
}
