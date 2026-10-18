import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { staffWith } from '@/lib/staff-guard';
import { deleteBlock } from '@/lib/appointments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE — ανοίγει ξανά το διάστημα.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await staffWith('appointments.manage');
  if ('error' in g) return g.error;
  const { id } = await ctx.params;
  await deleteBlock(id).catch(() => null);
  await logAudit({ userId: g.user.id, userEmail: g.user.email, action: 'appointments.unblock', resource: 'appointment_block', resourceId: id }).catch(() => null);
  return NextResponse.json({ ok: true });
}
