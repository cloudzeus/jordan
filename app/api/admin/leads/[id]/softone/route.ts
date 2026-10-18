import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { staffWith } from '@/lib/staff-guard';
import { LEAD_SOFTONE_LABEL, softoneLeadsEnabled, syncLeadToSoftone } from '@/lib/leads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — στέλνει (ξανά) το lead στο SoftOne ως υποψήφιο πελάτη. Μόνο με ανοιχτή τη ρύθμιση `leads.softoneEnabled`.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await staffWith('leads.manage');
  if ('error' in g) return g.error;
  if (!(await softoneLeadsEnabled())) return NextResponse.json({ error: 'disabled', message: 'Η αποστολή leads στο SoftOne είναι κλειστή (Ρυθμίσεις → Διασυνδέσεις)' }, { status: 409 });
  const { id } = await ctx.params;
  const status = await syncLeadToSoftone(id, { force: true });
  if (!status) return NextResponse.json({ error: 'not_found', message: 'Το lead δεν βρέθηκε' }, { status: 404 });
  await logAudit({ userId: g.user.id, userEmail: g.user.email, action: 'lead.softone', resource: 'lead', resourceId: id, metadata: { status } }).catch(() => null);
  return NextResponse.json({ status, label: LEAD_SOFTONE_LABEL[status] ?? status }, { status: status === 'FAILED' ? 502 : 200 });
}
