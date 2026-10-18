import 'server-only';
import { prisma } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { appointmentCode } from '@/lib/appointments-core';
import { buildActionPayload, CANCELLED_PREFIX, softoneCreateAction, softoneUpdateAction, type ActionInput } from '@/lib/softone-action';

/**
 * Ραντεβού ↔ SoftOne CRM «Ραντεβού» (SOMEETING, SOSOURCE 2052). Γράφεται ΜΟΝΟ όταν:
 *  • είναι ανοιχτή η ρύθμιση `appointments.softoneEnabled` (προεπιλογή: κλειστή), και
 *  • το ραντεβού έχει υπεύθυνο που είναι συνδεδεμένος με χρήστη SoftOne (User.softoneUserId).
 * Επιβεβαιωμένο/ολοκληρωμένο → δημιουργία ή ενημέρωση (ώρα, υπεύθυνος). Ακύρωση → το θέμα παίρνει
 * πρόθεμα «ΑΚΥΡΩΘΗΚΕ — » (δεν διαγράφουμε ενέργειες του ERP). Αίτημα σε αναμονή → τίποτα ακόμη.
 * Best-effort: ποτέ δεν πετάει· αποτυχία = softoneSync «FAILED» με το μήνυμα, και «Ξανά» από το ⋮.
 */

export async function appointmentsSoftoneEnabled() {
  const v = await getSetting<unknown>('appointments.softoneEnabled');
  return v === true || v === 'true';
}

export function actionFor(a: { number: number; startsAt: Date; endsAt: Date; status: string; topic: string | null; name: string; company: string | null; phone: string | null; email: string | null; message: string | null; trdr: number | null; place?: string | null; location?: string | null }, actor: number, contactPrsn: number | null = null): ActionInput {
  const who = a.company && a.company !== a.name ? `${a.company} (${a.name})` : a.name;
  const subject = `${a.status === 'CANCELLED' ? CANCELLED_PREFIX : ''}${a.topic ?? 'Ραντεβού'} — ${who}`;
  const place = a.place === 'customer' ? 'customer' : 'atelier';
  const remarks = [`Ραντεβού ${appointmentCode(a.number)} (εφαρμογή)`, a.location && `Τόπος: ${a.location}`, a.phone && `Τηλ.: ${a.phone}`, a.email && `Email: ${a.email}`, a.message].filter(Boolean).join('\n');
  return { actor, trdr: a.trdr, contactPrsn, place, start: a.startsAt, end: a.endsAt, subject, remarks };
}

export type AppointmentSyncResult = 'SYNCED' | 'FAILED' | 'SKIPPED' | 'DISABLED';

export async function syncAppointmentToSoftone(id: string, opts: { force?: boolean } = {}): Promise<AppointmentSyncResult> {
  const a = await prisma.appointment.findUnique({ where: { id } });
  if (!a) return 'SKIPPED';
  if (!(await appointmentsSoftoneEnabled())) return 'DISABLED';
  if (a.softoneSync === 'FAILED' && !opts.force && !a.softoneAction) {
    // μια αποτυχημένη δημιουργία δεν ξαναδοκιμάζεται σιωπηλά σε κάθε αλλαγή — μόνο από το ⋮
    return 'FAILED';
  }
  const user = a.assignedToId ? await prisma.user.findUnique({ where: { id: a.assignedToId }, select: { softoneUserId: true } }) : null;
  if (!user?.softoneUserId) return 'SKIPPED';
  const syncable = ['CONFIRMED', 'COMPLETED', 'NO_SHOW'].includes(a.status) || (a.status === 'CANCELLED' && a.softoneAction);
  if (!syncable) return 'SKIPPED';
  try {
    const contact = a.customerContactId ? await prisma.customerContact.findUnique({ where: { id: a.customerContactId }, select: { softonePrsn: true } }) : null;
    const input = actionFor(a, user.softoneUserId, contact?.softonePrsn ?? null);
    if (a.softoneAction) {
      await softoneUpdateAction(a.softoneAction, input);
      await prisma.appointment.update({ where: { id }, data: { softoneSync: 'SYNCED', softoneError: null } });
    } else {
      const r = await softoneCreateAction(input);
      await prisma.appointment.update({ where: { id }, data: { softoneSync: 'SYNCED', softoneError: null, softoneAction: r.id, softoneActionCode: r.code } });
    }
    return 'SYNCED';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[appointments] SoftOne', id, msg);
    await prisma.appointment.update({ where: { id }, data: { softoneSync: 'FAILED', softoneError: msg.slice(0, 500) } });
    return 'FAILED';
  }
}

/** Το ακριβές setData που ΘΑ σταλεί για ένα ραντεβού — χωρίς καμία εγγραφή (για έλεγχο/έγκριση). */
export async function dryRunAppointmentSoftone(id: string) {
  const a = await prisma.appointment.findUnique({ where: { id } });
  if (!a) return { ok: false as const, reason: 'Το ραντεβού δεν βρέθηκε' };
  const user = a.assignedToId ? await prisma.user.findUnique({ where: { id: a.assignedToId }, select: { softoneUserId: true } }) : null;
  if (!user?.softoneUserId) return { ok: false as const, reason: 'Ο υπεύθυνος δεν είναι συνδεδεμένος με χρήστη SoftOne' };
  const contact = a.customerContactId ? await prisma.customerContact.findUnique({ where: { id: a.customerContactId }, select: { softonePrsn: true } }) : null;
  const input = actionFor(a, user.softoneUserId, contact?.softonePrsn ?? null);
  return { ok: true as const, enabled: await appointmentsSoftoneEnabled(), payload: { service: 'setData', ...buildActionPayload(input, a.softoneAction ?? '') } };
}
