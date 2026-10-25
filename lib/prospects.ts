import 'server-only';
import { prisma } from '@/lib/db';
import { SODTYPE_LABEL, SoftoneError } from '@/lib/softone';
import { findCustomerByAfm, findCustomerByEmail, nextCustomerCode, prospectName, softoneCreateCustomer } from '@/lib/softone-lead';
import { proposeTraderClass } from '@/lib/trader-classes-server';
import { canTransition, contractRef, nextProjectCode, projectName } from '@/lib/contracts/core';
import { ContractError, transition } from '@/lib/contracts/service';
import { createPrjc } from '@/lib/contracts/softone';
import { customerFields, prospectInput, type AcceptPlan, type CustomerStep, type ProjectStep, type ProspectInput } from './prospects-core';

/**
 * Δυνητικοί πελάτες: προσφορές σε κάποιον που ΔΕΝ υπάρχει στο SoftOne. Μέχρι την αποδοχή ζουν μόνο
 * στην εφαρμογή (στοιχεία, κατόψεις, PDF στον φάκελο `prospects/…`). Με την αποδοχή — και μόνο μετά από
 * ρητή επιβεβαίωση του χρήστη που είδε τι θα γραφτεί — γίνονται με τη σειρά:
 *   1. πελάτης στο SoftOne (ή σύνδεση με υπάρχοντα με ίδιο ΑΦΜ/email — χωρίς διπλότυπο),
 *   2. η μετάβαση «Αποδοχή» της προσφοράς,
 *   3. το έργο (PRJC) στο SoftOne, συνδεδεμένο με τη σύμβαση.
 * Κάθε βήμα είναι επαναλήψιμο: αν κάτι αποτύχει, «Ολοκλήρωση εγγραφών» συνεχίζει από εκεί που σταμάτησε.
 */

export class ProspectError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const SELECT = {
  id: true, name: true, contactName: true, email: true, phone: true, afm: true, doy: true, profession: true,
  address: true, zip: true, city: true, notes: true, trdr: true, convertedAt: true, createdAt: true, updatedAt: true,
} as const;

export async function listProspects() {
  const rows = await prisma.prospect.findMany({
    orderBy: [{ convertedAt: { sort: 'desc', nulls: 'first' } }, { updatedAt: 'desc' }], take: 1000,
    select: { ...SELECT, contracts: { select: { id: true, number: true, title: true, status: true, stage: true } } },
  });
  const trdrs = rows.map((r) => r.trdr).filter((x): x is number => x != null);
  const codes = new Map((await prisma.softoneTrader.findMany({ where: { trdr: { in: trdrs } }, select: { trdr: true, code: true } })).map((t) => [t.trdr, t.code]));
  return rows.map((r) => ({
    ...r, convertedAt: r.convertedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
    customerCode: r.trdr ? codes.get(r.trdr) ?? null : null,
    contracts: r.contracts.map((c) => ({ id: c.id, ref: contractRef(c.number), title: c.title, status: c.status, stage: c.stage })),
  }));
}
export type ProspectRow = Awaited<ReturnType<typeof listProspects>>[number];

export const getProspect = (id: number) => prisma.prospect.findUnique({ where: { id }, select: SELECT });

/** Για τον επιλογέα πελάτη της προσφοράς: μόνο όσοι δεν έγιναν ακόμη πελάτες SoftOne. */
export async function searchProspects(q: string) {
  const s = q.trim();
  if (s.length < 2) return [];
  return prisma.prospect.findMany({
    where: { trdr: null, OR: [{ name: { contains: s, mode: 'insensitive' } }, { contactName: { contains: s, mode: 'insensitive' } }, { email: { contains: s, mode: 'insensitive' } }, { afm: { contains: s } }, { phone: { contains: s } }] },
    select: { id: true, name: true, email: true, phone: true, city: true }, orderBy: { name: 'asc' }, take: 8,
  });
}

export async function createProspect(raw: unknown, userId: string) {
  const input = prospectInput.parse(raw);
  return prisma.prospect.create({ data: { ...input, createdById: userId }, select: SELECT });
}

export async function updateProspect(id: number, raw: unknown) {
  const input: ProspectInput = prospectInput.parse(raw);
  const cur = await prisma.prospect.findUnique({ where: { id }, select: { trdr: true } });
  if (!cur) throw new ProspectError('Ο δυνητικός πελάτης δεν βρέθηκε', 404);
  // Μετά τη μετατροπή η καρτέλα ζει στο SoftOne — εκεί αλλάζουν τα στοιχεία, εδώ μόνο οι σημειώσεις.
  const data = cur.trdr ? { notes: input.notes } : input;
  const p = await prisma.prospect.update({ where: { id }, data, select: SELECT });
  // Οι ανοιχτές προσφορές κρατούν στιγμιότυπο του ονόματος — ενημερώνεται μαζί.
  if (!cur.trdr) await prisma.contract.updateMany({ where: { prospectId: id, trdr: null, stage: 'OFFER' }, data: { customerName: p.name } });
  return p;
}

export async function deleteProspect(id: number) {
  const n = await prisma.contract.count({ where: { prospectId: id } });
  if (n) throw new ProspectError('Ο δυνητικός πελάτης έχει προσφορές — διαγράψτε ή μεταφέρετε πρώτα τις προσφορές', 409);
  await prisma.prospect.delete({ where: { id } });
}

// ── Αποδοχή ──────────────────────────────────────────────────────────────────────────────────────

async function contractForAccept(contractId: string) {
  const c = await prisma.contract.findUnique({ where: { id: contractId }, select: { id: true, number: true, title: true, status: true, stage: true, trdr: true, prjc: true, prospectId: true, customerName: true } });
  if (!c) throw new ContractError('Η σύμβαση δεν βρέθηκε', 404);
  return c;
}

/** Υπάρχων πελάτης SoftOne με ίδιο ΑΦΜ ή email (ανάγνωση μόνο, GetTable). */
async function matchCustomer(p: { afm: string | null; email: string | null }) {
  if (p.afm) { const r = await findCustomerByAfm(p.afm); if (r) return { ...r, by: 'afm' as const }; }
  if (p.email) { const r = await findCustomerByEmail(p.email); if (r) return { trdr: r.trdr, code: r.code, name: null, by: 'email' as const }; }
  return null;
}

/**
 * ΠΡΟΕΠΙΣΚΟΠΗΣΗ (τίποτα δεν γράφεται): τι θα γίνει στο SoftOne με την αποδοχή. Κωδικοί πελάτη/έργου
 * είναι οι επόμενοι της αρίθμησης· στην εκτέλεση ελέγχονται ξανά ώστε να μη γραφτεί κάτι διαφορετικό.
 */
export async function acceptPlan(contractId: string): Promise<AcceptPlan> {
  const c = await contractForAccept(contractId);
  const accept = c.stage === 'OFFER';
  if (accept && !canTransition(c.status, 'accept')) throw new ContractError('Η προσφορά δεν μπορεί να γίνει αποδεκτή σε αυτή την κατάσταση', 409);
  if (!accept && c.status === 'CANCELLED') throw new ContractError('Η σύμβαση έχει ακυρωθεί', 409);

  let customer: CustomerStep;
  let customerName = c.customerName;
  const p = !c.trdr && c.prospectId ? await prisma.prospect.findUnique({ where: { id: c.prospectId } }) : null;
  if (c.trdr) {
    const t = await prisma.softoneTrader.findUnique({ where: { trdr: c.trdr }, select: { name: true } });
    customer = { mode: 'existing', trdr: c.trdr, name: t?.name ?? c.customerName ?? `Πελάτης #${c.trdr}` };
  } else if (p?.trdr) {
    customer = { mode: 'existing', trdr: p.trdr, name: p.name };
  } else if (p) {
    const m = await matchCustomer(p);
    if (m) {
      const t = await prisma.softoneTrader.findUnique({ where: { trdr: m.trdr }, select: { name: true } });
      customer = { mode: 'link', trdr: m.trdr, code: m.code, name: t?.name ?? m.name ?? p.name, by: m.by };
      customerName = customer.name;
    } else {
      customer = { mode: 'create', code: await nextCustomerCode(), name: prospectName({ company: p.name }), fields: customerFields(p) };
    }
  } else {
    throw new ContractError('Η προσφορά δεν έχει πελάτη SoftOne ούτε δυνητικό πελάτη — ορίστε πελάτη πρώτα', 409);
  }

  let project: ProjectStep;
  const trdr = 'trdr' in customer ? customer.trdr : null;
  if (c.prjc) {
    const pr = await prisma.softoneProject.findUnique({ where: { prjc: c.prjc }, select: { code: true } });
    project = { mode: 'exists', prjc: c.prjc, code: pr?.code ?? null };
  } else if (trdr != null && trdr < 0) {
    project = { mode: 'skip', reason: 'Demo πελάτης — δεν καταχωρείται έργο στο SoftOne' };
  } else {
    const codes = (await prisma.softoneProject.findMany({ select: { code: true } })).map((x) => x.code);
    project = { mode: 'create', code: nextProjectCode(codes), name: projectName(customerName, c.title) };
  }
  return { contractId: c.id, ref: contractRef(c.number), title: c.title, accept, customer, project };
}

/**
 * Δυνητικός → πελάτης SoftOne. ΓΡΑΦΕΙ στο SoftOne (εκτός αν βρεθεί υπάρχων με ίδιο ΑΦΜ/email). Μετά:
 * καθρέφτης, όλες οι προσφορές του, οι κατόψεις και ο φάκελος αρχείων περνούν στον πελάτη.
 */
export async function convertProspect(id: number, expectedCode: string | null): Promise<{ trdr: number; code: string; linked: boolean }> {
  const p = await prisma.prospect.findUnique({ where: { id } });
  if (!p) throw new ProspectError('Ο δυνητικός πελάτης δεν βρέθηκε', 404);
  if (p.trdr) return { trdr: p.trdr, code: (await prisma.softoneTrader.findUnique({ where: { trdr: p.trdr }, select: { code: true } }))?.code ?? '', linked: true };

  // Ίδιο αποτέλεσμα με την προεπισκόπηση: αν στο μεταξύ άλλαξε η αρίθμηση, ο χρήστης ξαναβλέπει.
  if (expectedCode && !(await matchCustomer(p))) {
    const code = await nextCustomerCode();
    if (code !== expectedCode) throw new ProspectError(`Ο κωδικός πελάτη άλλαξε (${code}) — ξαναδείτε την προεπισκόπηση`, 409);
  }
  // Αποδεκτή προσφορά ⇒ κανονικός πελάτης (όχι «Υποψήφιος»), με ή χωρίς ΑΦΜ.
  const r = await softoneCreateCustomer({
    company: p.name, name: p.contactName, email: p.email, phone: p.phone, afm: p.afm, profession: p.profession,
    address: p.address, city: p.city, zip: p.zip, note: 'Από αποδεκτή προσφορά (εφαρμογή)',
  }, { prospect: false });
  const name = prospectName({ company: p.name });
  if (!r.linked) {
    const mirror = { sodtype: 13, kind: SODTYPE_LABEL[13] ?? 'Πελάτης', code: r.code, name, afm: p.afm, doy: p.doy, profession: p.profession, address: p.address, city: p.city, zip: p.zip, phone: p.phone, email: p.email, isActive: true };
    await prisma.softoneTrader.upsert({ where: { trdr: r.trdr }, update: mirror, create: { trdr: r.trdr, ...mirror } });
    void proposeTraderClass({ trdr: r.trdr, sodtype: 13, code: r.code, name, afm: p.afm }).catch(() => null);
  }

  await prisma.$transaction(async (tx) => {
    await tx.prospect.update({ where: { id }, data: { trdr: r.trdr, convertedAt: new Date() } });
    // Το `prospectId` μένει στις προσφορές για το ιστορικό· ο πελάτης πλέον είναι το `trdr`.
    await tx.contract.updateMany({ where: { prospectId: id, trdr: null }, data: { trdr: r.trdr } });
    await tx.floorPlan.updateMany({ where: { prospectId: id, trdr: null }, data: { trdr: r.trdr } });
    // Επαφή της πύλης: ο υπεύθυνος (ή ο ίδιος ο ιδιώτης) με email/τηλέφωνο — πρόσβαση δίνεται από την καρτέλα.
    if ((p.email || p.phone) && !(await tx.customerContact.count({ where: { trdr: r.trdr } }))) {
      await tx.customerContact.create({ data: { trdr: r.trdr, name: p.contactName || p.name, email: p.email, mobile: p.phone, isPrimary: true } });
    }
    // Αρχεία: ο φάκελος `prospects/…` γίνεται φάκελος του πελάτη (η διαδρομή στο Bunny δεν αλλάζει)·
    // αν ο πελάτης έχει ήδη φάκελο, τα αρχεία μετακινούνται εκεί.
    const pf = await tx.entityFolder.findUnique({ where: { entityType_entityId: { entityType: 'PROSPECT', entityId: id } } });
    if (pf) {
      const tf = await tx.entityFolder.findUnique({ where: { entityType_entityId: { entityType: 'TRADER', entityId: r.trdr } } });
      if (!tf) await tx.entityFolder.update({ where: { id: pf.id }, data: { entityType: 'TRADER', entityId: r.trdr } });
      else {
        await tx.entityFile.updateMany({ where: { folderId: pf.id }, data: { folderId: tf.id } });
        await tx.entityFolder.update({ where: { id: tf.id }, data: { subfolders: [...new Set([...tf.subfolders, ...pf.subfolders])] } });
        await tx.entityFolder.delete({ where: { id: pf.id } });
      }
    }
  });
  return r;
}

export type AcceptResult = { accepted: boolean; customer: { trdr: number; code: string; linked: boolean } | null; project: { prjc: number; code: string } | null; warning: string | null };

/**
 * ΕΚΤΕΛΕΣΗ (γράφει στο SoftOne): πελάτης → αποδοχή → έργο, όπως τα είδε ο χρήστης στην προεπισκόπηση.
 * `by` = ποιος αποδέχθηκε (προσωπικό ή ο πελάτης από την πύλη) — για το ιστορικό της σύμβασης.
 */
export async function acceptAndRegister(contractId: string, expected: { customerCode: string | null; projectCode: string | null }, userId: string, by?: { kind: 'STAFF' | 'CUSTOMER'; name: string | null }): Promise<AcceptResult> {
  const plan = await acceptPlan(contractId);
  const c = await contractForAccept(contractId);
  let customer: AcceptResult['customer'] = null;
  if (plan.customer.mode === 'create' || plan.customer.mode === 'link') {
    customer = await convertProspect(c.prospectId!, plan.customer.mode === 'create' ? expected.customerCode : null);
  }
  if (plan.accept) await transition(contractId, 'accept', userId, by);
  if (plan.project.mode !== 'create') return { accepted: plan.accept, customer, project: null, warning: plan.project.mode === 'skip' ? plan.project.reason : null };
  // Η αποδοχή έχει γίνει — αν το έργο αποτύχει, η σύμβαση μένει αποδεκτή και το βήμα επαναλαμβάνεται.
  try {
    const pr = await createPrjc(contractId, expected.projectCode ?? plan.project.code, userId);
    return { accepted: plan.accept, customer, project: { prjc: pr.prjc, code: pr.code }, warning: null };
  } catch (e) {
    const msg = e instanceof ContractError || e instanceof SoftoneError ? e.message : 'σφάλμα επικοινωνίας';
    console.error('[prospects] project after accept', e);
    return { accepted: plan.accept, customer, project: null, warning: `Η προσφορά έγινε αποδεκτή, αλλά το έργο δεν δημιουργήθηκε στο SoftOne (${msg}). Δοκιμάστε «Ολοκλήρωση εγγραφών SoftOne».` };
  }
}


/**
 * Αποδοχή από την πύλη (υπάρχων πελάτης SoftOne): το έργο δημιουργείται αμέσως, χωρίς να περιμένει το
 * προσωπικό. Best-effort — σε αποτυχία η σύμβαση δείχνει «Ολοκλήρωση εγγραφών SoftOne».
 */
export async function createProjectAfterAccept(contractId: string, userId: string) {
  try {
    const plan = await acceptPlan(contractId);
    if (plan.customer.mode !== 'existing' || plan.project.mode !== 'create') return null;
    return await createPrjc(contractId, plan.project.code, userId);
  } catch (e) {
    console.error('[prospects] auto project', e instanceof Error ? e.message : e);
    return null;
  }
}
