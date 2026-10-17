import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { buildProjectInstructions } from '@/lib/project-profit';
import { docxDisposition } from '@/lib/instructions-doc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — Word με τις κατευθύνσεις για ΟΛΑ τα ανοιχτά θέματα των έργων, ανά ομάδα παραληπτών.
export async function GET() {
  await requirePermission('projects.financials');
  const { buffer, filename } = await buildProjectInstructions(null);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': docxDisposition(filename),
      'Cache-Control': 'private, no-store',
    },
  });
}
