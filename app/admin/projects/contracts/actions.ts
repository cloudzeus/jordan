'use server';

// Server Actions των προσφορών/συμβάσεων — τα καλεί απευθείας το UI (χωρίς fetch σε /api).
// Μένουν REST: η δημιουργία εγγράφου (AI → PDF, έως 5 λεπτά — τα actions τρέχουν ένα-ένα και θα
// κλείδωναν τις υπόλοιπες ενέργειες), η απομαγνητοφώνηση και οι αναζητήσεις-καθώς-γράφεις (ακυρώσιμες).
// Τα REST routes μένουν και για εξωτερικούς πελάτες.
import { revalidatePath } from 'next/cache';
import { z, ZodError } from 'zod';
import { logAudit } from '@/lib/audit';
import { actor, done, doneEmpty, fail, parse, type ActionResult } from '@/lib/server-actions';
import { contractInput, DocParseError, type ContractAction } from '@/lib/contracts/core';
import { ContractError, deleteContract, createContract, getContract, itemDefaults, linkProject, setMilestoneStatus, transition, updateContract, type ContractView } from '@/lib/contracts/service';
import { copyDocsToProject, sendDocument } from '@/lib/contracts/documents';
import { createPrjc, prjcPlan } from '@/lib/contracts/softone';
import { TaskError } from '@/lib/project-tasks';
import { SoftoneError } from '@/lib/softone';

const LIST = '/admin/projects/contracts';
const refresh = (id?: string) => { revalidatePath(LIST); if (id) revalidatePath(`${LIST}/${id}`); };

/** Γνωστά σφάλματα → το μήνυμά τους· SoftOne με πρόθεμα· τα υπόλοιπα στο log. */
function caught(e: unknown) {
  if (e instanceof ContractError || e instanceof TaskError || e instanceof DocParseError) return fail(e.message);
  if (e instanceof ZodError) return fail(e.issues[0]?.message ?? 'Μη έγκυρα στοιχεία');
  if (e instanceof SoftoneError) return fail(`SoftOne: ${e.message}`);
  console.error('[contracts action]', e);
  return fail(e instanceof Error ? e.message : 'Κάτι πήγε στραβά — δοκιμάστε ξανά.');
}

/** Νέα (id = null) ή αλλαγή σύμβασης/προσφοράς — ολόκληρη: κεφαλίδα, γραμμές, συνεργεία, μέλη, milestones. */
export async function saveContractAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string; contract: ContractView | null }>> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  const v = parse(contractInput, input);
  if ('error' in v) return v.error;
  try {
    let cid = id;
    if (cid) {
      await updateContract(cid, v.data, a.user.id);
      await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'contract.update', resource: 'contract', resourceId: cid }).catch(() => null);
    } else {
      cid = await createContract(v.data, a.user.id);
      await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'contract.create', resource: 'contract', resourceId: cid, metadata: { title: v.data.title, kind: v.data.kind } }).catch(() => null);
    }
    refresh(cid);
    return done({ id: cid, contract: await getContract(cid) });
  } catch (e) {
    return caught(e);
  }
}

export async function deleteContractAction(id: string): Promise<ActionResult> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  try {
    await deleteContract(id);
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'contract.delete', resource: 'contract', resourceId: id }).catch(() => null);
    refresh();
    return doneEmpty();
  } catch (e) {
    return caught(e);
  }
}

const ACTIONS = ['send', 'accept', 'activate', 'complete', 'cancel', 'reopen'] as const satisfies readonly ContractAction[];

/** Αλλαγή κατάστασης (η ενεργοποίηση δημιουργεί εργασίες/ημερολόγιο από τα milestones). */
export async function contractTransitionAction(id: string, action: ContractAction): Promise<ActionResult> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  if (!(ACTIONS as readonly string[]).includes(action)) return fail('Άγνωστη ενέργεια');
  try {
    await transition(id, action, a.user.id);
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: `contract.${action}`, resource: 'contract', resourceId: id }).catch(() => null);
    refresh(id);
    return doneEmpty();
  } catch (e) {
    return caught(e);
  }
}

/** Σύνδεση με υπάρχον έργο SoftOne (μόνο ανάγνωση από τον καθρέφτη) + αντιγραφή των PDF στα αρχεία του. */
export async function linkProjectAction(id: string, prjc: number): Promise<ActionResult> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  if (!Number.isInteger(prjc) || prjc <= 0) return fail('Άκυρο έργο');
  try {
    await linkProject(id, prjc, a.user.id);
    const copied = await copyDocsToProject(id, { id: a.user.id, name: a.user.name, email: a.user.email });
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'contract.link_project', resource: 'contract', resourceId: id, metadata: { prjc, copied } }).catch(() => null);
    refresh(id);
    return doneEmpty();
  } catch (e) {
    return caught(e);
  }
}

/** Νέο PRJC — βήμα 1: προεπισκόπηση (dry-run), τίποτα δεν γράφεται. */
export async function previewPrjcAction(id: string): Promise<ActionResult<{ code: string; payload: unknown }>> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  try {
    const plan = await prjcPlan(id);
    return done({ code: plan.code, payload: { service: 'setData', ...plan.payload } });
  } catch (e) {
    return caught(e);
  }
}

/** Νέο PRJC — βήμα 2: ΕΓΓΡΑΦΗ στο SoftOne με τον κωδικό που είδε ο χρήστης στην προεπισκόπηση. */
export async function createPrjcAction(id: string, code: string): Promise<ActionResult<{ code: string }>> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  const v = parse(z.string().trim().min(1).max(32), code);
  if ('error' in v) return v.error;
  try {
    const created = await createPrjc(id, v.data, a.user.id);
    const copied = await copyDocsToProject(id, { id: a.user.id, name: a.user.name, email: a.user.email });
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'contract.softone_create_prjc', resource: 'contract', resourceId: id, metadata: { ...created, copied } }).catch(() => null);
    refresh(id);
    return done({ code: created.code });
  } catch (e) {
    return caught(e);
  }
}

const sendInput = z.object({
  to: z.string().trim().email('Μη έγκυρο email παραλήπτη').max(200),
  message: z.string().trim().max(4000).nullish().transform((v) => v || null),
});

/** Αποστολή του PDF με email (σε πελάτη ή οποιοδήποτε συνεργείο). */
export async function sendDocumentAction(id: string, docId: string, input: unknown): Promise<ActionResult<{ result: string }>> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  const v = parse(sendInput, input);
  if ('error' in v) return v.error;
  try {
    const result = await sendDocument(id, docId, v.data, { id: a.user.id, name: a.user.name, email: a.user.email });
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'contract.send', resource: 'contract', resourceId: id, metadata: { doc: docId, to: v.data.to, result } }).catch(() => null);
    if (result === 'failed') return fail('Η αποστολή απέτυχε — δοκιμάστε ξανά');
    refresh(id);
    return done({ result });
  } catch (e) {
    return caught(e);
  }
}

/** Milestone: παραδόθηκε / εξοφλήθηκε (ενημερώνει και το task του έργου). */
export async function setMilestoneAction(id: string, mid: string, status: 'PENDING' | 'DONE' | 'PAID'): Promise<ActionResult> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  if (!['PENDING', 'DONE', 'PAID'].includes(status)) return fail('Άκυρη κατάσταση');
  try {
    await setMilestoneStatus(id, mid, status);
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'contract.milestone', resource: 'contract', resourceId: id, metadata: { milestone: mid, status } }).catch(() => null);
    refresh(id);
    return doneEmpty();
  } catch (e) {
    return caught(e);
  }
}

/** Μονάδα + τιμή ενός είδους για νέα γραμμή. */
export async function itemDefaultsAction(mtrl: number): Promise<Awaited<ReturnType<typeof itemDefaults>> | null> {
  const a = await actor('projects.read');
  if ('error' in a || !Number.isInteger(mtrl) || mtrl <= 0) return null;
  return itemDefaults(mtrl);
}
