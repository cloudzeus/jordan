import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { buildRoomsDocx } from '@/lib/project-rooms-doc';
import { roomsDocInput, RoomsError } from '@/lib/project-rooms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?kind=spec|contractor — «Προδιαγραφές δαπέδων» ή «Οδηγίες προς εργολάβο» σε Word.
export async function GET(req: Request, ctx: { params: Promise<{ prjc: string }> }) {
  await requirePermission('projects.read');
  const prjc = Number((await ctx.params).prjc);
  if (!Number.isInteger(prjc) || prjc <= 0) return NextResponse.json({ error: 'invalid_prjc' }, { status: 400 });
  const kind = new URL(req.url).searchParams.get('kind') === 'contractor' ? 'contractor' : 'spec';
  try {
    const input = await roomsDocInput(prjc, kind);
    const buf = await buildRoomsDocx(input);
    const name = `${kind === 'contractor' ? 'odigies-ergolavou' : 'prodiagrafes-dapedon'}-${input.project.code.replace(/[^\w.-]+/g, '_')}.docx`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    if (e instanceof RoomsError) return NextResponse.json({ error: 'rooms_error', message: e.message }, { status: e.status });
    throw e;
  }
}
