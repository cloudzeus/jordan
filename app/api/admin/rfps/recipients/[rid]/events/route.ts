import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { recipientEvents } from '@/lib/rfp/service';
import { EVENT_LABEL } from '@/lib/rfp/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — ημερολόγιο συνεδρίας (απόδειξη) με έλεγχο της αλυσίδας hash. ?format=csv για λήψη.
export async function GET(req: Request, ctx: { params: Promise<{ rid: string }> }) {
  await requirePermission('projects.manage');
  const rid = (await ctx.params).rid;
  const out = await recipientEvents(rid);
  if (new URL(req.url).searchParams.get('format') !== 'csv') return NextResponse.json(out);
  const esc = (v: unknown) => { const s = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [['Ώρα (UTC)', 'Γεγονός', 'Από', 'IP', 'Συσκευή/browser', 'Session', 'Στοιχεία', 'Hash', 'Προηγούμενο hash']];
  for (const e of out.events) rows.push([e.at, EVENT_LABEL[e.type] ?? e.type, e.actor, e.ip ?? '', e.userAgent ?? '', e.sessionId ?? '', JSON.stringify(e.data), e.hash, e.prevHash ?? '']);
  rows.push([], [`Αλυσίδα hash: ${out.chain.ok ? 'ΑΚΕΡΑΙΗ' : `ΣΠΑΣΜΕΝΗ στο γεγονός ${(out.chain.brokenAt ?? 0) + 1}`}`]);
  return new Response('﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="rfp-log-${rid}.csv"`, 'Cache-Control': 'no-store' },
  });
}
