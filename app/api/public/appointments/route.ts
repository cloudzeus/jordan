import { NextResponse } from 'next/server';
import { AppointmentError, bookAppointment } from '@/lib/appointments';
import { appointmentCode, formatSlotEl } from '@/lib/appointments-core';
import { bookingSchema, clientIp, tooMany } from '@/lib/public-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — κράτηση ελεύθερης ώρας από το website. Δημιουργεί ραντεβού + lead.
export async function POST(req: Request) {
  const parsed = bookingSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Ελέγξτε τα στοιχεία' }, { status: 400 });
  const b = parsed.data;
  if (b.website) return NextResponse.json({ ok: true, code: appointmentCode(0), when: '', status: 'PENDING' }); // honeypot: bots
  if (tooMany(`book:${clientIp(req)}`, 5, 60 * 60_000)) return NextResponse.json({ error: 'rate_limited', message: 'Πολλές προσπάθειες — δοκιμάστε ξανά αργότερα ή τηλεφωνήστε μας' }, { status: 429 });
  try {
    const a = await bookAppointment(b);
    return NextResponse.json({ ok: true, code: appointmentCode(a.number), when: formatSlotEl(a.startsAt.toISOString(), a.endsAt.toISOString()), status: a.status });
  } catch (e) {
    if (e instanceof AppointmentError) return NextResponse.json({ error: 'appointment', message: e.message }, { status: e.status });
    throw e;
  }
}
