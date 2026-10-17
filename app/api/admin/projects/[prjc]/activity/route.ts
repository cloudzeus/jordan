import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { SoftoneError } from '@/lib/softone';
import { fetchProjectActivity } from '@/lib/project-activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — παραστατικά και υλικά/υπηρεσίες ενός έργου, ζωντανά από το SoftOne. Μόνο ανάγνωση.
export async function GET(_req: Request, ctx: { params: Promise<{ prjc: string }> }) {
  await requirePermission('metadata.read');
  const prjc = Number((await ctx.params).prjc);
  if (!Number.isInteger(prjc) || prjc <= 0) return NextResponse.json({ error: 'invalid_prjc' }, { status: 400 });
  try {
    return NextResponse.json(await fetchProjectActivity(prjc));
  } catch (e) {
    // Το SoftOne δεν απάντησε σωστά → 502 με το μήνυμά του· οτιδήποτε άλλο είναι δικό μας λάθος.
    if (e instanceof SoftoneError) {
      return NextResponse.json({ error: 'softone_error', message: e.message }, { status: 502 });
    }
    return NextResponse.json({ error: 'internal_error', message: (e as Error).message }, { status: 500 });
  }
}
