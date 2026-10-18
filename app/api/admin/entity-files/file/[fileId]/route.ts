import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { serveStoredFile } from '@/lib/serve-file';
import { contentDisposition } from '@/lib/entity-files/core';
import { deleteEntityFile, getEntityFile, updateEntityFile } from '@/lib/entity-files/service';
import { filesError } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ fileId: string }> };

// GET — λήψη (ή `?inline=1` προβολή PDF στον browser). Ο έλεγχος δικαιωμάτων γίνεται σε ΚΑΘΕ
// αίτημα (και στα range/304) — το κλειδί του Bunny δεν φεύγει ποτέ προς τον browser.
export async function GET(req: Request, { params }: Ctx) {
  await requirePermission('files.read');
  const f = await getEntityFile((await params).fileId);
  if (!f) return NextResponse.json({ error: 'not_found', message: 'Το αρχείο δεν βρέθηκε.' }, { status: 404 });
  const inline = new URL(req.url).searchParams.get('inline') === '1' && f.ext === 'pdf';
  return serveStoredFile(req, {
    key: f.storageKey, contentType: f.mimeType, fileName: f.name,
    disposition: contentDisposition(inline ? 'inline' : 'attachment', f.name),
  });
}

// PATCH { name?, notes?, subfolder? } — μετονομασία / σημειώσεις / μετακίνηση σε υποφάκελο.
export async function PATCH(req: Request, { params }: Ctx) {
  await requirePermission('files.manage');
  const body = await req.json().catch(() => ({}));
  const patch: { name?: string; notes?: string | null; subfolder?: string } = {};
  if (typeof body?.name === 'string') patch.name = body.name;
  if (body?.notes === null || typeof body?.notes === 'string') patch.notes = body.notes;
  if (typeof body?.subfolder === 'string') patch.subfolder = body.subfolder;
  try {
    return NextResponse.json({ file: await updateEntityFile((await params).fileId, patch) });
  } catch (err) {
    return filesError(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const u = await requirePermission('files.manage');
  try {
    const f = await deleteEntityFile((await params).fileId);
    await logAudit({
      userId: u.id, userEmail: u.email, action: 'entity_file.delete', resource: 'entity_file', resourceId: f.id,
      metadata: { name: f.name, size: f.size },
    }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return filesError(err);
  }
}
