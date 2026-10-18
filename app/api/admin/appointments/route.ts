import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { staffWith } from '@/lib/staff-guard';
import { SoftoneError } from '@/lib/softone';
import { PartyError } from '@/lib/appointment-parties';
import { AppointmentError, scheduleStaffAppointment } from '@/lib/appointments';
import { appointmentCode } from '@/lib/appointments-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const opt = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const party = z.discriminatedUnion('kind', [
  z.object({ kind: z.enum(['trader', 'contact', 'partner', 'partnerContact']), id: z.string().min(1) }),
  z.object({
    kind: z.literal('new'),
    customer: z.object({
      name: z.string().trim().min(2, 'Συμπληρώστε επωνυμία').max(128),
      contactFirstName: opt(64), contactLastName: opt(64),
      afm: z.string().trim().max(20).optional().nullable().transform((v) => v?.replace(/\s/g, '') || null)
        .refine((v) => !v || /^[A-Z]{0,2}\d{8,12}$/i.test(v), 'Ο ΑΦΜ δεν φαίνεται σωστός'),
      email: z.string().trim().toLowerCase().max(64).email('Το email δεν φαίνεται σωστό').optional().nullable().or(z.literal('').transform(() => null)),
      phone: opt(32), profession: opt(64), address: opt(128), city: opt(64), zip: opt(10),
    }).refine((c) => !c.contactFirstName === !c.contactLastName, 'Για τον υπεύθυνο συμπληρώστε όνομα ΚΑΙ επώνυμο'),
  }),
  z.object({
    kind: z.literal('newContact'),
    contact: z.object({
      trdr: z.number().int().positive(),
      firstName: z.string().trim().min(1, 'Συμπληρώστε όνομα').max(64),
      lastName: z.string().trim().min(1, 'Συμπληρώστε επώνυμο').max(64),
      role: opt(64), mobile: opt(32),
      email: z.string().trim().toLowerCase().max(64).email('Το email δεν φαίνεται σωστό').optional().nullable().or(z.literal('').transform(() => null)),
    }),
  }),
]);
const input = z.object({
  start: z.string().datetime({ message: 'Διαλέξτε ημερομηνία και ώρα' }),
  minutes: z.number().int().min(15).max(600),
  party,
  topic: opt(80), message: opt(2000), staffNote: opt(1000),
  allowOverlap: z.boolean().optional(), notify: z.boolean().optional(),
  assignedToId: z.string().min(1).optional().nullable(),
  place: z.enum(['atelier', 'customer']).optional(),
  location: opt(200),
});

// POST — ραντεβού από το προσωπικό, με υπάρχοντα ή ΝΕΟ πελάτη (ο νέος γράφεται στο SoftOne).
export async function POST(req: Request) {
  const g = await staffWith('appointments.schedule');
  if ('error' in g) return g.error;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Ελέγξτε τα στοιχεία' }, { status: 400 });
  try {
    const { appointment: a, party: p } = await scheduleStaffAppointment(parsed.data, g.user.id);
    await logAudit({ userId: g.user.id, userEmail: g.user.email, action: 'appointment.schedule', resource: 'appointment', resourceId: a.id, metadata: { party: parsed.data.party.kind, trdr: p.trdr } }).catch(() => null);
    const np = p as typeof p & { code?: string; linked?: boolean };
    const created = np.code ? { code: np.code, linked: !!np.linked } : null;
    return NextResponse.json({ appointment: { id: a.id, code: appointmentCode(a.number), start: a.startsAt.toISOString() }, customer: created });
  } catch (e) {
    if (e instanceof AppointmentError || e instanceof PartyError) return NextResponse.json({ error: 'appointment', message: e.message }, { status: e.status });
    if (e instanceof SoftoneError) return NextResponse.json({ error: 'softone', message: `SoftOne: ${e.message}` }, { status: 502 });
    throw e;
  }
}
