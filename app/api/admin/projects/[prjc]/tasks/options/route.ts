import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { projectFileChoices, searchTraders } from '@/lib/project-tasks';
import { badPrjc, prjcOf, type PrjcCtx } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?kind=CUSTOMER|SUPPLIER&q= — αναζήτηση συναλλασσομένων · ?files=1 — αρχεία του φακέλου του έργου.
export async function GET(req: Request, ctx: PrjcCtx) {
  await requirePermission('projects.read');
  const prjc = await prjcOf(ctx);
  if (!prjc) return badPrjc();
  const sp = new URL(req.url).searchParams;
  if (sp.get('files') === '1') {
    await requirePermission('files.read');
    return NextResponse.json({ files: await projectFileChoices(prjc) });
  }
  const kind = sp.get('kind') === 'SUPPLIER' ? 'SUPPLIER' : 'CUSTOMER';
  return NextResponse.json({ results: await searchTraders(kind, sp.get('q') ?? '') });
}
