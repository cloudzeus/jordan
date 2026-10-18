import { NextResponse } from 'next/server';
import { hasPermission, requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { listEntityFiles, uploadEntityFile } from '@/lib/entity-files/service';
import { MAX_ENTITY_FILE_BYTES } from '@/lib/entity-files/core';
import { badEntity, entityOf, filesError } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Ctx = { params: Promise<{ type: string; id: string }> };

// GET — φάκελος + αρχεία (και για πελάτη/προμηθευτή: οι φάκελοι των έργων του). Ο φάκελος
// δημιουργείται εδώ την πρώτη φορά (DB + Bunny).
export async function GET(_req: Request, { params }: Ctx) {
  await requirePermission('files.read');
  const e = await entityOf(params);
  if (!e) return badEntity();
  try {
    const data = await listEntityFiles(e.type, e.id);
    return NextResponse.json({ ...data, canManage: await hasPermission('files.manage') });
  } catch (err) {
    return filesError(err);
  }
}

// POST multipart { file, subfolder?, notes? } — ΕΝΑ αρχείο ανά αίτημα (πρόοδος ανά αρχείο).
export async function POST(req: Request, { params }: Ctx) {
  const u = await requirePermission('files.manage');
  const e = await entityOf(params);
  if (!e) return badEntity();
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_ENTITY_FILE_BYTES + 1024 * 1024) return NextResponse.json({ error: 'too_large', message: 'Το αρχείο ξεπερνά το όριο των 100 MB.' }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'no_file', message: 'Δεν στάλθηκε αρχείο.' }, { status: 400 });
  try {
    const saved = await uploadEntityFile({
      type: e.type, id: e.id, buffer: Buffer.from(await file.arrayBuffer()), name: file.name,
      subfolder: String(form?.get('subfolder') ?? ''), notes: (form?.get('notes') as string | null) ?? null,
      user: { id: u.id, name: u.name, email: u.email },
    });
    await logAudit({
      userId: u.id, userEmail: u.email, action: 'entity_file.upload', resource: e.type === 'TRADER' ? 'softone_trader' : 'softone_project', resourceId: String(e.id),
      metadata: { fileId: saved.id, name: saved.name, size: saved.size, subfolder: saved.subfolder },
    }).catch(() => null);
    return NextResponse.json({ file: saved }, { status: 201 });
  } catch (err) {
    return filesError(err);
  }
}
