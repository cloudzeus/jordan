import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { overdue } from '@/lib/statement/core';
import { statementEmail } from '@/lib/statement/email';
import { statementDocFor, statementErrorResponse } from '@/lib/statement/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — προεπισκόπηση της κατάστασης λογαριασμού (email + σύνοψη). Μόνο ανάγνωση από το SoftOne.
export async function POST(req: Request, ctx: { params: Promise<{ trdr: string }> }) {
  await requirePermission('metadata.read');
  const body = await req.json().catch(() => ({}));
  try {
    const d = await statementDocFor((await ctx.params).trdr, body);
    const m = statementEmail(d);
    const s = d.statement;
    return NextResponse.json({
      subject: m.subject, html: m.html, text: m.text,
      recipient: d.customer.email ?? null, customer: d.customer.name,
      summary: { closing: s.closing, overdue: overdue(s), open: s.open.length, lines: s.lines.length, opening: s.opening, from: s.from, to: s.to },
      banks: d.brand.bankAccounts?.length ?? 0,
    });
  } catch (e) {
    return statementErrorResponse(e);
  }
}
