// lib/contracts/softone.ts — SERVER. Δημιουργία έργου (PRJC) στο SoftOne από σύμβαση.
// ΓΡΑΦΕΙ στο SoftOne ΜΟΝΟ όταν ο χρήστης επιβεβαιώσει ρητά το payload που είδε (confirm=true)·
// χωρίς αυτό επιστρέφει dry-run. Μετά την εγγραφή διαβάζει πίσω την εγγραφή και ενημερώνει τον καθρέφτη.
import 'server-only';
import { prisma } from '@/lib/db';
import { softoneCall, softoneFetchProjects, SoftoneError } from '@/lib/softone';
import { buildPrjcPayload, contractRef, nextProjectCode, projectName } from './core';
import { ContractError, linkProject } from './service';

export async function prjcPlan(contractId: string) {
  const c = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!c) throw new ContractError('Η σύμβαση δεν βρέθηκε', 404);
  if (c.prjc) throw new ContractError('Η σύμβαση έχει ήδη έργο SoftOne', 409);
  // Μέχρι την αποδοχή είμαστε σε σχεδιασμό: τίποτα προς το SoftOne.
  if (c.stage === 'OFFER') throw new ContractError('Το έργο δημιουργείται στο SoftOne μόνο μετά την αποδοχή της προσφοράς', 409);
  if (!c.trdr) throw new ContractError('Για νέο έργο στο SoftOne χρειάζεται πελάτης από το SoftOne', 409);
  const codes = (await prisma.softoneProject.findMany({ select: { code: true } })).map((p) => p.code);
  const code = nextProjectCode(codes);
  const payload = buildPrjcPayload({
    code, name: projectName(c.customerName, c.title), trdr: c.trdr,
    fromDate: c.startDate?.toISOString().slice(0, 10) ?? null, finalDate: c.endDate?.toISOString().slice(0, 10) ?? null,
    remarks: `${contractRef(c.number)} · ${c.title}`,
  });
  return { code, payload };
}

/** ΓΡΑΦΕΙ στο SoftOne. Καλείται μόνο με ρητή επιβεβαίωση από τον χρήστη. */
export async function createPrjc(contractId: string, expectedCode: string, userId: string) {
  const { code, payload } = await prjcPlan(contractId);
  if (code !== expectedCode) throw new ContractError(`Ο κωδικός άλλαξε (${code}) — ξαναδείτε την προεπισκόπηση`, 409);
  const res = await softoneCall<{ success?: boolean; error?: string; errorcode?: number; id?: string | number }>('setData', payload);
  if (res.success === false || res.id == null) throw new SoftoneError(res.error ?? `setData PRJC απέτυχε (code ${res.errorcode ?? '?'})`);
  const prjc = Number(res.id);
  const [row] = await softoneFetchProjects(`PRJC=${prjc}`);
  if (!row || row.code !== code) throw new SoftoneError(`Το έργο δεν επιβεβαιώθηκε στο SoftOne (PRJC ${prjc})`);
  await prisma.softoneProject.upsert({
    where: { prjc },
    create: { prjc, code: row.code, name: row.name, trdr: row.trdr, prjType: row.prjType, isActive: row.isActive, actStatus: row.actStatus, trdrSu: row.trdrSu, remarks: row.remarks, crdDate: row.crdDate, fromDate: row.fromDate, finalDate: row.finalDate, closeDate: row.closeDate },
    update: { code: row.code, name: row.name, trdr: row.trdr, isActive: row.isActive, syncedAt: new Date() },
  });
  await linkProject(contractId, prjc, userId);
  return { prjc, code: row.code, name: row.name };
}
