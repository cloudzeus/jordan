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
import { composeCustomerText } from '@/lib/contracts/ai';
import { stockSummary, type StockSummary } from '@/lib/item-stock';
import { createPrjc, prjcPlan } from '@/lib/contracts/softone';
import { TaskError } from '@/lib/project-tasks';
import { SoftoneError } from '@/lib/softone';
import { awardRecipient, createRfp, recipientEvents, renewLink, RfpError, setRfpStatus } from '@/lib/rfp/service';

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

/** Απόθεμα (σύνολο αποθηκών, καθρέφτης SoftOne) για τα είδη της φόρμας — ενδείξεις «επαρκεί / λείπουν». */
export async function stockAction(mtrls: number[]): Promise<Record<number, StockSummary>> {
  const a = await actor('projects.read');
  if ('error' in a || !Array.isArray(mtrls)) return {};
  return stockSummary(mtrls.map(Number));
}

const customerTextInput = z.object({
  contractId: z.string().max(64).nullish(),
  title: z.string().max(200).default(''),
  kindLabel: z.string().max(100).default(''),
  customerName: z.string().max(200).nullish().transform((v) => v ?? null),
  site: z.string().max(300).nullish().transform((v) => v ?? null),
  startDate: z.string().max(10).nullish().transform((v) => v ?? null),
  endDate: z.string().max(10).nullish().transform((v) => v ?? null),
  summary: z.string().max(20_000).default(''),
  rooms: z.array(z.object({ name: z.string().max(120), floorM2: z.number().finite(), wallsM2: z.number().finite(), material: z.string().max(300).nullable() })).max(300).default([]),
  lines: z.array(z.object({ kind: z.enum(['MATERIAL', 'SERVICE']), name: z.string().max(300), qty: z.number().finite(), unit: z.string().max(32).nullable(), room: z.string().max(120).nullable() })).max(500).default([]),
  milestones: z.array(z.string().max(200)).max(100).default([]),
});

/** «Κείμενο για τον πελάτη» με AI από περίληψη + χώρους κάτοψης + γραμμές (δεν αποθηκεύεται εδώ). */
export async function customerTextAction(input: unknown): Promise<ActionResult<{ text: string }>> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  const v = parse(customerTextInput, input);
  if ('error' in v) return v.error;
  if (!v.data.summary.trim() && !v.data.rooms.length && !v.data.lines.length) return fail('Γράψτε πρώτα μια περίληψη ή προσθέστε χώρους/γραμμές.');
  try {
    const text = await composeCustomerText(v.data, { userId: a.user.id, contractId: v.data.contractId ?? null });
    return done({ text });
  } catch (e) {
    return caught(e);
  }
}

/* ───────────── Αιτήματα προσφοράς (RFP) προς συνεργεία ───────────── */
// Οι δημόσιες σελίδες του συνεργείου (σύνδεσμος με token, χωρίς σύνδεση) μένουν REST — εκεί δεν υπάρχει συνεδρία.

/** Ίδιο με το REST (`rfpFail`): γνωστά → μήνυμα, άγνωστα → log + γενικό μήνυμα (όχι τεχνικές λεπτομέρειες). */
function rfpCaught(e: unknown) {
  if (e instanceof RfpError) return fail(e.message);
  if (e instanceof ZodError) return fail(e.issues[0]?.message ?? 'Μη έγκυρα στοιχεία');
  console.error('[rfp action]', e);
  return fail('Κάτι πήγε στραβά — δοκιμάστε ξανά.');
}
const rfpUser = (u: { id: string; name: string | null; email: string }) => ({ id: u.id, name: u.name ?? null, email: u.email });

/** Νέο αίτημα: PDF specs, μοναδικοί σύνδεσμοι, email. Οι σύνδεσμοι επιστρέφονται μόνο τώρα (στη βάση μένει hash). */
export async function createRfpAction(contractId: string, input: unknown): Promise<ActionResult<Awaited<ReturnType<typeof createRfp>>>> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  try {
    const out = await createRfp(contractId, input, rfpUser(a.user));
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'rfp.create', resource: 'rfp', resourceId: out.id, metadata: { contractId, ref: out.ref, recipients: out.recipients.map((r) => ({ name: r.name, email: r.email_result })) } }).catch(() => null);
    refresh(contractId);
    return done(out);
  } catch (e) {
    return rfpCaught(e);
  }
}

/** Ανάθεση: το συνεργείο μπαίνει στη σύμβαση με αμοιβή = το ποσό του. */
export async function awardRfpAction(rfpId: string, recipientId: string): Promise<ActionResult> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  try {
    const out = await awardRecipient(rfpId, recipientId, rfpUser(a.user));
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'rfp.award', resource: 'rfp', resourceId: rfpId, metadata: { recipientId, ...out } }).catch(() => null);
    revalidatePath(LIST, 'layout');
    return doneEmpty();
  } catch (e) {
    return rfpCaught(e);
  }
}

/** Νέος μοναδικός σύνδεσμος (ο παλιός παύει να ισχύει), προαιρετικά ξανά email. */
export async function renewRfpLinkAction(recipientId: string, sendEmail: boolean): Promise<ActionResult<Awaited<ReturnType<typeof renewLink>>>> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  try {
    const out = await renewLink(recipientId, rfpUser(a.user), { sendEmail: sendEmail === true });
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'rfp.link_renew', resource: 'rfp_recipient', resourceId: recipientId, metadata: { email: out.email_result } }).catch(() => null);
    revalidatePath(LIST, 'layout');
    return done(out);
  } catch (e) {
    return rfpCaught(e);
  }
}

/** Ημερολόγιο συνεδρίας (απόδειξη) με έλεγχο της αλυσίδας hash. Η λήψη CSV μένει στο REST route. */
export async function rfpEventsAction(recipientId: string): Promise<ActionResult<Awaited<ReturnType<typeof recipientEvents>>>> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  return done(await recipientEvents(recipientId));
}

/** Κλείσιμο / ακύρωση / ξανά άνοιγμα αιτήματος (όχι μετά την ανάθεση). */
export async function setRfpStatusAction(rfpId: string, status: 'CLOSED' | 'CANCELLED' | 'OPEN'): Promise<ActionResult> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  if (!['CLOSED', 'CANCELLED', 'OPEN'].includes(status)) return fail('Άκυρη κατάσταση');
  try {
    await setRfpStatus(rfpId, status);
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: `rfp.${status.toLowerCase()}`, resource: 'rfp', resourceId: rfpId }).catch(() => null);
    revalidatePath(LIST, 'layout');
    return doneEmpty();
  } catch (e) {
    return rfpCaught(e);
  }
}
