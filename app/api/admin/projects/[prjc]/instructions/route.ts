import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { buildProjectInstructions } from '@/lib/project-profit';
import { docxDisposition } from '@/lib/instructions-doc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — Word με τις κατευθύνσεις για τα θέματα ΕΝΟΣ έργου, ανά ομάδα παραληπτών.
export async function GET(_req: Request, ctx: { params: Promise<{ prjc: string }> }) {
  await requirePermission('projects.financials');
  const prjc = Number((await ctx.params).prjc);
  if (!Number.isInteger(prjc) || prjc <= 0) return NextResponse.json({ error: 'invalid_prjc' }, { status: 400 });
  const { buffer, filename } = await buildProjectInstructions(prjc);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': docxDisposition(filename),
      'Cache-Control': 'private, no-store',
    },
  });
}
