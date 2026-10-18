import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { staffWith } from '@/lib/staff-guard';
import { staffUnsubscribe } from '@/lib/newsletter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE — διαγραφή από τη λίστα (η εγγραφή μένει ως «Διαγράφηκε» για το ιστορικό συναίνεσης).
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await staffWith('leads.manage');
  if ('error' in g) return g.error;
  const { id } = await ctx.params;
  await staffUnsubscribe(id).catch(() => null);
  await logAudit({ userId: g.user.id, userEmail: g.user.email, action: 'newsletter.unsubscribe', resource: 'newsletter_subscriber', resourceId: id }).catch(() => null);
  return NextResponse.json({ ok: true });
}
