import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { staffWith } from '@/lib/staff-guard';
import { normalizeRanges, WEEKDAYS_EL, type Weekly } from '@/lib/appointments-core';
import { saveAvailability } from '@/lib/appointments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const range = z.object({ from: z.string(), to: z.string() });
const input = z.object({
  slotMinutes: z.number().int().min(15).max(240),
  capacity: z.number().int().min(1).max(10),
  minNoticeHours: z.number().int().min(0).max(336),
  horizonDays: z.number().int().min(1).max(180),
  autoConfirm: z.boolean(),
  weekly: z.object({ 0: z.array(range), 1: z.array(range), 2: z.array(range), 3: z.array(range), 4: z.array(range), 5: z.array(range), 6: z.array(range) }),
});

// PUT — ωράριο, διάρκεια ραντεβού, χωρητικότητα, προειδοποίηση, ορίζοντας.
export async function PUT(req: Request) {
  const g = await staffWith('appointments.manage');
  if ('error' in g) return g.error;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία' }, { status: 400 });
  const weekly = {} as Weekly;
  for (const k of ['0', '1', '2', '3', '4', '5', '6'] as const) {
    const n = normalizeRanges(parsed.data.weekly[k]);
    if (n.problem) return NextResponse.json({ error: 'invalid_input', message: `${WEEKDAYS_EL[Number(k)]}: ${n.problem}` }, { status: 400 });
    weekly[k] = n.ranges;
  }
  await saveAvailability({ ...parsed.data, weekly }, g.user.id);
  await logAudit({ userId: g.user.id, userEmail: g.user.email, action: 'appointments.availability', resource: 'appointments', metadata: { slotMinutes: parsed.data.slotMinutes } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
