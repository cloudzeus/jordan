import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { MAX_ENTITY_FILE_BYTES } from '@/lib/entity-files/core';
import { linkTaskFiles, unlinkTaskFile, uploadTaskFile } from '@/lib/project-tasks';
import { badPrjc, prjcOf, taskError, type TaskCtx } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// POST multipart { file } — ανέβασμα στον φάκελο του έργου (υποφάκελος «Εργασίες») + σύνδεση.
// POST JSON { fileIds } — σύνδεση υπαρχόντων αρχείων του έργου.
export async function POST(req: Request, ctx: TaskCtx) {
  const u = await requirePermission('projects.manage');
  await requirePermission('files.manage');
  const prjc = await prjcOf(ctx);
  if (!prjc) return badPrjc();
  const { id } = await ctx.params;
  try {
    if ((req.headers.get('content-type') ?? '').includes('application/json')) {
      const body = await req.json().catch(() => null);
      const ids = Array.isArray(body?.fileIds) ? body.fileIds.filter((x: unknown): x is string => typeof x === 'string').slice(0, 100) : [];
      if (!ids.length) return NextResponse.json({ error: 'invalid_input', message: 'Επιλέξτε αρχείο' }, { status: 400 });
      await linkTaskFiles(prjc, id, ids);
      return NextResponse.json({ ok: true });
    }
    const len = Number(req.headers.get('content-length') ?? 0);
    if (len > MAX_ENTITY_FILE_BYTES + 1024 * 1024) return NextResponse.json({ error: 'too_large', message: 'Το αρχείο ξεπερνά το όριο των 100 MB.' }, { status: 413 });
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'no_file', message: 'Δεν στάλθηκε αρχείο.' }, { status: 400 });
    const saved = await uploadTaskFile(prjc, id, { buffer: Buffer.from(await file.arrayBuffer()), name: file.name }, { id: u.id, name: u.name, email: u.email });
    await logAudit({ userId: u.id, userEmail: u.email, action: 'entity_file.upload', resource: 'softone_project', resourceId: String(prjc), metadata: { fileId: saved.id, name: saved.name, taskId: id } }).catch(() => null);
    return NextResponse.json({ file: saved }, { status: 201 });
  } catch (e) {
    return taskError(e);
  }
}

// DELETE ?fileId= — αφαιρεί τη σύνδεση (το αρχείο μένει στον φάκελο του έργου).
export async function DELETE(req: Request, ctx: TaskCtx) {
  await requirePermission('projects.manage');
  const prjc = await prjcOf(ctx);
  if (!prjc) return badPrjc();
  const { id } = await ctx.params;
  const fileId = new URL(req.url).searchParams.get('fileId');
  if (!fileId) return NextResponse.json({ error: 'invalid_input', message: 'Λείπει το αρχείο' }, { status: 400 });
  try {
    await unlinkTaskFile(prjc, id, fileId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return taskError(e);
  }
}
