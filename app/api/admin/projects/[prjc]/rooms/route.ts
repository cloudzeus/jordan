import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { roomInput } from '@/lib/project-rooms-core';
import { appendRooms, listRooms, replaceRooms, RoomsError } from '@/lib/project-rooms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prjcOf = async (ctx: { params: Promise<{ prjc: string }> }) => {
  const n = Number((await ctx.params).prjc);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const body = z.object({ rooms: z.array(roomInput).max(300) });

// GET — οι χώροι του έργου με το δάπεδό τους.
export async function GET(_req: Request, ctx: { params: Promise<{ prjc: string }> }) {
  await requirePermission('projects.read');
  const prjc = await prjcOf(ctx);
  if (!prjc) return NextResponse.json({ error: 'invalid_prjc' }, { status: 400 });
  return NextResponse.json({ rooms: await listRooms(prjc) });
}

async function write(req: Request, ctx: { params: Promise<{ prjc: string }> }, mode: 'replace' | 'append') {
  const u = await requirePermission('projects.manage');
  const prjc = await prjcOf(ctx);
  if (!prjc) return NextResponse.json({ error: 'invalid_prjc' }, { status: 400 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία' }, { status: 400 });
  try {
    const rooms = mode === 'replace' ? await replaceRooms(prjc, parsed.data.rooms, u.id) : await appendRooms(prjc, parsed.data.rooms, u.id);
    await logAudit({ userId: u.id, userEmail: u.email, action: `project.rooms.${mode}`, resource: 'project', resourceId: String(prjc), metadata: { count: parsed.data.rooms.length } }).catch(() => null);
    return NextResponse.json({ rooms });
  } catch (e) {
    if (e instanceof RoomsError) return NextResponse.json({ error: 'rooms_error', message: e.message }, { status: e.status });
    throw e;
  }
}

// PUT — αντικατάσταση της λίστας { rooms: [...] } (καρτέλα έργου).
export const PUT = (req: Request, ctx: { params: Promise<{ prjc: string }> }) => write(req, ctx, 'replace');
// POST — προσθήκη χώρων { rooms: [...] } (διαστασιολόγηση κάτοψης).
export const POST = (req: Request, ctx: { params: Promise<{ prjc: string }> }) => write(req, ctx, 'append');
