import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { staffWith } from '@/lib/staff-guard';
import { isDateStr, isHHMM } from '@/lib/appointments-core';
import { AppointmentError, createBlock } from '@/lib/appointments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const input = z.object({
  date: z.string().refine(isDateStr, 'Μη έγκυρη ημερομηνία'),
  toDate: z.string().refine(isDateStr, 'Μη έγκυρη ημερομηνία').optional().nullable(),
  allDay: z.boolean(),
  from: z.string().refine(isHHMM, 'Ώρα ΩΩ:ΛΛ').optional().nullable(),
  to: z.string().refine(isHHMM, 'Ώρα ΩΩ:ΛΛ').optional().nullable(),
  reason: z.string().trim().max(200).optional().nullable(),
}).refine((b) => b.allDay || (b.from && b.to), 'Συμπληρώστε ώρες ή επιλέξτε «Όλη η μέρα»');

// POST — κλειστή μέρα/διάστημα. Επιστρέφει πόσα ενεργά ραντεβού πέφτουν μέσα (δεν ακυρώνονται αυτόματα).
export async function POST(req: Request) {
  const g = await staffWith('appointments.manage');
  if ('error' in g) return g.error;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία' }, { status: 400 });
  try {
    const { block, clash } = await createBlock(parsed.data, g.user.id);
    await logAudit({ userId: g.user.id, userEmail: g.user.email, action: 'appointments.block', resource: 'appointment_block', resourceId: block.id }).catch(() => null);
    return NextResponse.json({ block: { id: block.id }, clash });
  } catch (e) {
    if (e instanceof AppointmentError) return NextResponse.json({ error: 'appointment', message: e.message }, { status: e.status });
    throw e;
  }
}
