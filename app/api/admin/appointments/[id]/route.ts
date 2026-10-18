import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { staffWith } from '@/lib/staff-guard';
import { APPOINTMENT_STATUSES } from '@/lib/appointments-core';
import { AppointmentError, assignAppointment, changeAppointmentStatus, rescheduleAppointment } from '@/lib/appointments';
import { syncAppointmentToSoftone } from '@/lib/appointment-softone';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const note = z.string().trim().max(1000).optional().nullable();
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status'), status: z.enum(APPOINTMENT_STATUSES).refine((s) => s !== 'PENDING', 'Μη έγκυρη κατάσταση'), staffNote: note, notify: z.boolean().optional() }),
  z.object({ action: z.literal('reschedule'), start: z.string().datetime(), force: z.boolean().optional(), staffNote: note, notify: z.boolean().optional() }),
  z.object({ action: z.literal('assign'), assignedToId: z.string().min(1).nullable() }),
  z.object({ action: z.literal('softone') }),
]);

// PATCH — επιβεβαίωση / ακύρωση / ολοκλήρωση / μη προσέλευση / μεταφορά ραντεβού.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await staffWith('appointments.manage');
  if ('error' in g) return g.error;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία' }, { status: 400 });
  const { id } = await ctx.params;
  const b = parsed.data;
  try {
    if (b.action === 'softone') {
      const result = await syncAppointmentToSoftone(id, { force: true });
      const a = await prisma.appointment.findUnique({ where: { id }, select: { softoneActionCode: true, softoneError: true } });
      await logAudit({ userId: g.user.id, userEmail: g.user.email, action: 'appointment.softone', resource: 'appointment', resourceId: id, metadata: { result } }).catch(() => null);
      const message = { SYNCED: `Στο SoftOne: ${a?.softoneActionCode ?? ''}`, FAILED: `SoftOne: ${a?.softoneError ?? 'αποτυχία'}`, SKIPPED: 'Ο υπεύθυνος δεν είναι συνδεδεμένος με χρήστη SoftOne ή το ραντεβού δεν είναι επιβεβαιωμένο', DISABLED: 'Η καταχώριση ραντεβού στο SoftOne είναι κλειστή (Ρυθμίσεις → Διασυνδέσεις)' }[result];
      return NextResponse.json({ result, message }, { status: result === 'SYNCED' ? 200 : result === 'FAILED' ? 502 : 409 });
    }
    if (b.action === 'assign') {
      const r = await assignAppointment(id, g.user.id, b.assignedToId);
      await logAudit({ userId: g.user.id, userEmail: g.user.email, action: 'appointment.assign', resource: 'appointment', resourceId: id, metadata: { assignedToId: r.assignedToId } }).catch(() => null);
      return NextResponse.json({ appointment: { id: r.id, assignedToId: r.assignedToId } });
    }
    const r = b.action === 'status'
      ? await changeAppointmentStatus(id, g.user.id, b.status, b.staffNote, b.notify !== false)
      : await rescheduleAppointment(id, g.user.id, b.start, { force: b.force, staffNote: b.staffNote, notify: b.notify });
    await logAudit({ userId: g.user.id, userEmail: g.user.email, action: `appointment.${b.action}`, resource: 'appointment', resourceId: id, metadata: { status: r.status, start: r.startsAt.toISOString() } }).catch(() => null);
    return NextResponse.json({ appointment: { id: r.id, status: r.status, start: r.startsAt.toISOString() } });
  } catch (e) {
    if (e instanceof AppointmentError) return NextResponse.json({ error: 'appointment', message: e.message }, { status: e.status });
    throw e;
  }
}
