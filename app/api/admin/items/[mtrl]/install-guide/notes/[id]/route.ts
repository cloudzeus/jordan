import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { deleteNote, retranscribeNote, updateNoteText } from '@/lib/install-guide/service';
import { badMtrl, mediaError, mtrlOf } from '../../../media/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const Body = z.union([
  z.object({ transcript: z.string().max(20000) }),
  z.object({ retranscribe: z.literal(true) }),
]);

// PATCH { transcript } — διόρθωση κειμένου · { retranscribe: true } — νέα απομαγνητοφώνηση από τον ήχο.
export async function PATCH(req: Request, { params }: { params: Promise<{ mtrl: string; id: string }> }) {
  const u = await requirePermission('metadata.manage');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return badMtrl();
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', message: 'Μη έγκυρο αίτημα.' }, { status: 400 });
  try {
    const note = 'retranscribe' in parsed.data ? await retranscribeNote(mtrl, id, u.id) : await updateNoteText(mtrl, id, parsed.data.transcript);
    return NextResponse.json({ note });
  } catch (e) {
    return mediaError(e);
  }
}

// DELETE — αφαίρεση ηχογράφησης (βάση + ήχος στο Bunny).
export async function DELETE(_req: Request, { params }: { params: Promise<{ mtrl: string; id: string }> }) {
  await requirePermission('metadata.manage');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return badMtrl();
  const { id } = await params;
  try {
    await deleteNote(mtrl, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mediaError(e);
  }
}
