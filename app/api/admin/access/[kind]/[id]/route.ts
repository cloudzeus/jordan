import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { grantAccess, grantInput, passwordSchema, revokeAccess, setActive, setPassword } from '@/lib/portal-access';
import { accessErrorResponse, invalid, kindOf } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ kind: string; id: string }> };
const resolve = async (ctx: Ctx) => { const p = await ctx.params; return { kind: kindOf(p.kind), id: p.id }; };

// POST — νέα πρόσβαση: { email, password, sendWelcome }.
export async function POST(req: Request, ctx: Ctx) {
  const u = await requirePermission('users.create');
  const { kind, id } = await resolve(ctx);
  if (!kind) return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  const parsed = grantInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  try {
    const r = await grantAccess(kind, id, parsed.data);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'portal.access.grant', resource: 'user', resourceId: r.userId, metadata: { kind, holderId: id, email: r.email, role: r.role, welcome: r.welcome } }).catch(() => null);
    return NextResponse.json(r, { status: 201 });
  } catch (e) { return accessErrorResponse(e); }
}

// PATCH — { password } ή { isActive }.
export async function PATCH(req: Request, ctx: Ctx) {
  const u = await requirePermission('users.update');
  const { kind, id } = await resolve(ctx);
  if (!kind) return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  const parsed = z.union([z.object({ password: passwordSchema }), z.object({ isActive: z.boolean() })]).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  try {
    if ('password' in parsed.data) {
      const r = await setPassword(kind, id, parsed.data.password);
      await logAudit({ userId: u.id, userEmail: u.email, action: 'portal.access.password', resource: 'user', resourceId: r.userId }).catch(() => null);
      return NextResponse.json({ ok: true });
    }
    const r = await setActive(kind, id, parsed.data.isActive);
    await logAudit({ userId: u.id, userEmail: u.email, action: parsed.data.isActive ? 'portal.access.enable' : 'portal.access.disable', resource: 'user', resourceId: r.userId }).catch(() => null);
    return NextResponse.json(r);
  } catch (e) { return accessErrorResponse(e); }
}

// DELETE — αφαίρεση πρόσβασης (διαγραφή χρήστη· το πρόσωπο μένει).
export async function DELETE(_req: Request, ctx: Ctx) {
  const u = await requirePermission('users.delete');
  const { kind, id } = await resolve(ctx);
  if (!kind) return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  try {
    const r = await revokeAccess(kind, id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'portal.access.revoke', resource: 'user', resourceId: r.userId, metadata: { email: r.email } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) { return accessErrorResponse(e); }
}
