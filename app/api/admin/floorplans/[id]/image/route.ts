import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { serveStoredFile } from '@/lib/serve-file';
import { contentDisposition } from '@/lib/entity-files/core';
import { getEntityFile } from '@/lib/entity-files/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?v=plan|annotated|source|3d — η εικόνα μιας χαρτογράφησης. Δικαίωμα έργων (όχι αρχείων): όποιος βλέπει το
// έργο βλέπει και την κάτοψή του. `plan` = σχέδιο χωρίς σημειώσεις (για ξανάνοιγμα), `source` = το πρωτότυπο αρχείο (λήψη),
// `3d` = η τελευταία εικόνα της προβολής 3D.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requirePermission('projects.read');
  const id = (await ctx.params).id;
  const v = new URL(req.url).searchParams.get('v');
  let fileId: string | null | undefined;
  if (v === '3d') {
    // Μόνο το ένα πεδίο του JSON — όχι τα περιγράμματα.
    const r = await prisma.$queryRawUnsafe<{ f: string | null }[]>(`SELECT "data"->>'render3dFileId' AS f FROM "FloorPlan" WHERE "id" = $1`, id);
    fileId = r[0]?.f;
  } else {
    const p = await prisma.floorPlan.findUnique({ where: { id }, select: { imageFileId: true, annotatedFileId: true, sourceFileId: true } });
    fileId = v === 'plan' ? p?.imageFileId : v === 'source' ? p?.sourceFileId : p?.annotatedFileId;
  }
  const f = fileId ? await getEntityFile(fileId) : null;
  if (!f) return NextResponse.json({ error: 'not_found', message: 'Η εικόνα δεν βρέθηκε' }, { status: 404 });
  return serveStoredFile(req, { key: f.storageKey, contentType: f.mimeType, fileName: f.name, disposition: contentDisposition(v === 'source' ? 'attachment' : 'inline', f.name) });
}
