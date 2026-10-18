import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { reorderMedia } from '@/lib/item-media/service';
import { badMtrl, mediaError, mtrlOf } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ kind: z.enum(['IMAGE', 'VIDEO', 'PANORAMA', 'DOCUMENT']), ids: z.array(z.string()).min(1).max(500) });

// PUT { kind, ids } — νέα σειρά εμφάνισης για έναν τύπο.
export async function PUT(req: Request, { params }: { params: Promise<{ mtrl: string }> }) {
  await requirePermission('metadata.manage');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return badMtrl();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', message: 'Μη έγκυρο αίτημα.' }, { status: 400 });
  try {
    await reorderMedia(mtrl, parsed.data.kind, parsed.data.ids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mediaError(e);
  }
}
