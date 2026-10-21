import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { bunnyDownload } from '@/lib/bunny';
import { pdfResponse } from '@/lib/rfp/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — τα specs (PDF) ενός αιτήματος, όπως τα είδαν οι παραλήπτες.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requirePermission('projects.read');
  const r = await prisma.rfp.findUnique({ where: { id: (await ctx.params).id }, select: { specsFileId: true, specsFileName: true } });
  const f = r?.specsFileId ? await prisma.entityFile.findUnique({ where: { id: r.specsFileId }, select: { storageKey: true } }) : null;
  if (!f) return NextResponse.json({ error: 'not_found', message: 'Δεν υπάρχει PDF' }, { status: 404 });
  return pdfResponse(await bunnyDownload(f.storageKey), r!.specsFileName ?? 'specs.pdf');
}
