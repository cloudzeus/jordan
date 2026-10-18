import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { SoftoneError } from '@/lib/softone';
import { PartyError } from '@/lib/appointment-parties';
import { AppointmentError, bookStaffAppointment } from '@/lib/appointments';
import { appointmentCode, formatSlotEl } from '@/lib/appointments-core';
import { requireAssistantApi } from '@/lib/assistant/access';
import { verifyProposal } from '@/lib/assistant/calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { token, conversationId?, allowOverlap? } — ο χρήστης πάτησε «Επιβεβαίωση» στην κάρτα του Air Jordan.
// Η ΜΟΝΗ εγγραφή του βοηθού: ραντεβού μέσω της κοινής λειτουργίας του ημερολογίου (εφαρμογή + SoftOne
// + email .ics), με το ΥΠΟΓΕΓΡΑΜΜΕΝΟ περιεχόμενο της πρότασης — όχι ό,τι στείλει ο browser.
export async function POST(req: Request) {
  const u = await requireAssistantApi();
  if (u instanceof NextResponse) return u;
  if (!u.canSchedule) return NextResponse.json({ error: 'forbidden', message: 'Δεν έχετε δικαίωμα να κλείνετε ραντεβού' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { token?: unknown; conversationId?: unknown; allowOverlap?: unknown };
  const p = typeof b.token === 'string' ? verifyProposal(b.token, u.id) : null;
  if (!p) return NextResponse.json({ error: 'expired', message: 'Η πρόταση έληξε ή δεν είναι έγκυρη — ζητήστε την ξανά από τον Air Jordan' }, { status: 400 });

  // Διπλό πάτημα / επανάληψη: το ίδιο ραντεβού δεν κλείνεται δύο φορές.
  const start = new Date(p.start);
  const dup = await prisma.appointment.findFirst({
    where: { createdById: u.id, startsAt: start, status: { in: ['PENDING', 'CONFIRMED'] }, createdAt: { gt: new Date(Date.now() - 60 * 60_000) } },
    select: { id: true, number: true, startsAt: true, endsAt: true, name: true },
  });
  if (dup) return NextResponse.json({ duplicate: true, code: appointmentCode(dup.number), summary: `Το ραντεβού ${appointmentCode(dup.number)} (${formatSlotEl(dup.startsAt.toISOString(), dup.endsAt.toISOString())}, ${dup.name}) έχει ήδη κλειστεί.` });

  try {
    const r = await bookStaffAppointment({
      who: p.party, when: p.start, minutes: p.minutes, place: p.place, location: p.location,
      topic: p.topic ?? undefined, notes: p.notes, createdBy: u.id, allowOverlap: b.allowOverlap === true,
    });
    await logAudit({ userId: u.id, userEmail: u.email, action: 'appointment.schedule', resource: 'appointment', resourceId: r.id, metadata: { via: 'assistant', party: p.party.kind, softone: r.softone } }).catch(() => null);
    const convId = typeof b.conversationId === 'string' ? b.conversationId : null;
    if (convId && (await prisma.assistantConversation.count({ where: { id: convId, userId: u.id } }))) {
      await prisma.assistantMessage.create({ data: { conversationId: convId, role: 'assistant', content: `✅ ${r.summary}`, citations: [{ refKey: `appointment:${r.id}`, label: `Ραντεβού ${r.code}`, url: '/admin/appointments' }] as never } });
      await prisma.assistantConversation.update({ where: { id: convId }, data: { updatedAt: new Date() } });
    }
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof AppointmentError || e instanceof PartyError) return NextResponse.json({ error: 'appointment', message: e.message, overlap: e.status === 409 }, { status: e.status });
    if (e instanceof SoftoneError) return NextResponse.json({ error: 'softone', message: `SoftOne: ${e.message}` }, { status: 502 });
    throw e;
  }
}
