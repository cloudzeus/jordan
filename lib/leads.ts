import 'server-only';
import { prisma } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { softoneCreateProspect } from '@/lib/softone-lead';

/**
 * Leads του website (ραντεβού, newsletter): ΕΝΑ ανά email. Κάθε νέα επαφή συμπληρώνει τα στοιχεία που
 * λείπουν (ποτέ δεν σβήνει υπάρχοντα με κενά) και προσθέτει την πηγή της.
 *
 * SoftOne: γράφεται ως υποψήφιος πελάτης (CUSTOMER, ISPROSP=1) ΜΟΝΟ όταν είναι ανοιχτή η ρύθμιση
 * `leads.softoneEnabled` (προεπιλογή: κλειστή). Με κλειστή τη ρύθμιση το lead μένει «DISABLED» και
 * στέλνεται αργότερα από τη σελίδα Leads (⋮ → «Αποστολή στο SoftOne»).
 */

export type LeadSource = 'appointment' | 'newsletter';
export type LeadInput = { email: string; name?: string | null; company?: string | null; phone?: string | null; profession?: string | null; notes?: string | null };

export const LEAD_SOFTONE_LABEL: Record<string, string> = {
  PENDING: 'Σε αναμονή', DISABLED: 'Μόνο στην εφαρμογή', CREATED: 'Υποψήφιος στο SoftOne', LINKED: 'Συνδέθηκε με υπάρχοντα πελάτη', FAILED: 'Αποτυχία',
};

const clean = (v: string | null | undefined, max = 200) => (v ?? '').trim().slice(0, max) || null;

/** Δημιουργεί ή συμπληρώνει το lead του email (μέσα ή έξω από transaction). */
export async function upsertLead(input: LeadInput, source: LeadSource, db: Pick<typeof prisma, 'lead'> = prisma) {
  const email = input.email.trim().toLowerCase();
  const data = { name: clean(input.name), company: clean(input.company), phone: clean(input.phone, 40), profession: clean(input.profession, 80) };
  const existing = await db.lead.findUnique({ where: { email } });
  if (!existing) {
    return db.lead.create({ data: { email, ...data, notes: clean(input.notes, 2000), sources: [source] } });
  }
  const fill = Object.fromEntries(Object.entries(data).filter(([k, v]) => v && !existing[k as keyof typeof data]));
  const sources = existing.sources.includes(source) ? existing.sources : [...existing.sources, source];
  if (!Object.keys(fill).length && sources === existing.sources) return existing;
  return db.lead.update({ where: { id: existing.id }, data: { ...fill, sources } });
}

export async function softoneLeadsEnabled() {
  const v = await getSetting<unknown>('leads.softoneEnabled');
  return v === true || v === 'true';
}

/**
 * Στέλνει το lead στο SoftOne (best-effort: ποτέ δεν πετάει). `force` = από το admin, για DISABLED/FAILED.
 * Επιστρέφει την κατάσταση που γράφτηκε.
 */
export async function syncLeadToSoftone(leadId: string, opts: { force?: boolean } = {}) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return null;
  if (lead.softoneStatus === 'CREATED' || lead.softoneStatus === 'LINKED') return lead.softoneStatus;
  if (!(await softoneLeadsEnabled())) {
    if (lead.softoneStatus !== 'DISABLED') await prisma.lead.update({ where: { id: leadId }, data: { softoneStatus: 'DISABLED' } });
    return 'DISABLED';
  }
  if (!opts.force && lead.softoneStatus === 'FAILED') return 'FAILED';
  try {
    const r = await softoneCreateProspect({
      email: lead.email, name: lead.name, company: lead.company, phone: lead.phone, profession: lead.profession,
      note: `Lead website (${lead.sources.join(', ')})`,
    });
    const status = r.linked ? 'LINKED' : 'CREATED';
    await prisma.lead.update({ where: { id: leadId }, data: { softoneStatus: status, softoneTrdr: r.trdr, softoneCode: r.code, softoneError: null, softoneSyncedAt: new Date() } });
    return status;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[leads] SoftOne', leadId, msg);
    await prisma.lead.update({ where: { id: leadId }, data: { softoneStatus: 'FAILED', softoneError: msg.slice(0, 500), softoneSyncedAt: new Date() } });
    return 'FAILED';
  }
}

export async function listLeads() {
  const rows = await prisma.lead.findMany({
    orderBy: { createdAt: 'desc' }, take: 1000,
    include: { subscriber: { select: { status: true } }, appointments: { select: { id: true, startsAt: true, status: true }, orderBy: { startsAt: 'desc' }, take: 1 }, _count: { select: { appointments: true } } },
  });
  return rows.map((l) => ({
    id: l.id, email: l.email, name: l.name, company: l.company, phone: l.phone, profession: l.profession, sources: l.sources,
    softoneStatus: l.softoneStatus, softoneLabel: LEAD_SOFTONE_LABEL[l.softoneStatus] ?? l.softoneStatus,
    softoneCode: l.softoneCode, softoneTrdr: l.softoneTrdr, softoneError: l.softoneError,
    newsletter: l.subscriber?.status ?? null,
    appointments: l._count.appointments, lastAppointment: l.appointments[0]?.startsAt.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
  }));
}
export type LeadView = Awaited<ReturnType<typeof listLeads>>[number];
