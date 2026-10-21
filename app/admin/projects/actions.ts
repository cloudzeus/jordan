'use server';

// Server Actions των έργων — τα καλεί απευθείας το UI (χωρίς fetch σε /api).
// Τα REST routes στο /api/admin/projects μένουν για εξωτερικούς πελάτες (mobile app). Οι ζωντανές
// αναγνώσεις από το SoftOne (κινήσεις, τελευταία τιμή αγοράς) και η αναζήτηση-καθώς-γράφεις μένουν GET:
// τα actions εκτελούνται ένα-ένα και δεν ακυρώνονται, οπότε μια αργή ανάγνωση θα κρατούσε τις αποθηκεύσεις.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { actor, caught as caughtBase, done, doneEmpty, fail, parse, posInt, type ActionResult } from '@/lib/server-actions';
import { addBudgetLine, budgetLineInput, BudgetError, deleteBudgetLine, listBudget, type BudgetLine } from '@/lib/project-budget';
import { deleteProjectSite, getProjectSite, reverseSite, saveProjectSite, searchSiteAddress, siteInput, SiteError, type ProjectSiteView } from '@/lib/project-site';
import type { SiteCandidate } from '@/lib/project-site-core';
import { createOverheadRate, deleteOverheadRate, listOverheadRates, overheadRateInput, updateOverheadRate, type OverheadRateRow } from '@/lib/overheads';
import { refreshProjectFinancials } from '@/lib/project-profit';
import {
  applyTemplate, createTask, createTemplate, deleteTask, deleteTemplate, linkTaskFiles, moveTask, projectFileChoices,
  taskInput, taskPatch, TaskError, templateCreateInput, unlinkTaskFile, updateTask, updateTemplate, type TaskView,
} from '@/lib/project-tasks';
import { PHASE_KEYS, type PhaseKey } from '@/lib/project-tasks-core';
import { EntityFileError } from '@/lib/entity-files/core';
import { syncFailureResponse, syncProjects, withResyncLock } from '@/lib/softone-sync/resync';

const caught = (e: unknown) => caughtBase(e, 'projects', [BudgetError, SiteError, TaskError, EntityFileError]);
const badPrjc = fail('Άκυρο έργο');

/* ───────────── Προϋπολογισμός ───────────── */

export async function listBudgetAction(prjc: number): Promise<ActionResult<BudgetLine[]>> {
  const a = await actor('projects.read');
  if ('error' in a) return a.error;
  const p = posInt(prjc);
  return p ? done(await listBudget(p)) : badPrjc;
}

/** Νέα γραμμή προϋπολογισμού: { mtrl, qty, unitPrice?, notes? }. */
export async function addBudgetLineAction(prjc: number, input: unknown): Promise<ActionResult<{ id: string }>> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  const p = posInt(prjc);
  if (!p) return badPrjc;
  const v = parse(budgetLineInput, input);
  if ('error' in v) return v.error;
  try {
    const line = await addBudgetLine(p, v.data, a.user.id);
    await logAudit({
      userId: a.user.id, userEmail: a.user.email, action: 'project.budget.add', resource: 'project', resourceId: String(p),
      metadata: { lineId: line.id, mtrl: line.mtrl, qty: line.qty, unitPrice: line.unitPrice },
    }).catch(() => null);
    return done({ id: line.id });
  } catch (e) {
    return caught(e);
  }
}

export async function deleteBudgetLineAction(prjc: number, id: string): Promise<ActionResult> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  const p = posInt(prjc);
  if (!p) return badPrjc;
  try {
    const line = await deleteBudgetLine(p, id);
    await logAudit({
      userId: a.user.id, userEmail: a.user.email, action: 'project.budget.delete', resource: 'project', resourceId: String(p),
      metadata: { lineId: line.id, mtrl: line.mtrl, name: line.name, qty: line.qty, unitPrice: line.unitPrice },
    }).catch(() => null);
    return doneEmpty();
  } catch (e) {
    return caught(e);
  }
}

/* ───────────── Τοποθεσία έργου ───────────── */

export async function getSiteAction(prjc: number): Promise<ActionResult<ProjectSiteView | null>> {
  const a = await actor('projects.read');
  if ('error' in a) return a.error;
  const p = posInt(prjc);
  return p ? done(await getProjectSite(p)) : badPrjc;
}

export async function saveSiteAction(prjc: number, input: unknown): Promise<ActionResult> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  const p = posInt(prjc);
  if (!p) return badPrjc;
  const v = parse(siteInput, input);
  if ('error' in v) return v.error;
  try {
    const site = await saveProjectSite(p, v.data, a.user.id);
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'project.site.save', resource: 'project', resourceId: String(p), metadata: site }).catch(() => null);
    revalidatePath('/admin/projects', 'layout');
    return doneEmpty();
  } catch (e) {
    return caught(e);
  }
}

export async function deleteSiteAction(prjc: number): Promise<ActionResult> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  const p = posInt(prjc);
  if (!p) return badPrjc;
  if (await deleteProjectSite(p)) {
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'project.site.delete', resource: 'project', resourceId: String(p) }).catch(() => null);
  }
  revalidatePath('/admin/projects', 'layout');
  return doneEmpty();
}

const geocodeQ = z.string().trim().min(3, 'Γράψε τουλάχιστον 3 χαρακτήρες').max(200);

/** Υποψήφιες θέσεις για μια διεύθυνση (έως 5, οι ακριβέστερες πρώτα). */
export async function geocodeSiteAction(q: string): Promise<ActionResult<SiteCandidate[]>> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  const v = parse(geocodeQ, q);
  if ('error' in v) return v.error;
  try {
    return done(await searchSiteAddress(v.data));
  } catch (e) {
    return caught(e);
  }
}

/** Η διεύθυνση στο σημείο της πινέζας (αντίστροφη γεωκωδικοποίηση). */
export async function reverseSiteAction(lat: number, lng: number): Promise<ActionResult<SiteCandidate | null>> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fail('Άκυρο σημείο');
  try {
    return done(await reverseSite(lat, lng));
  } catch (e) {
    return caught(e);
  }
}

/* ───────────── Οικονομικά & γενικά έξοδα ───────────── */

/** Ξαναϋπολογίζει την κερδοφορία ΟΛΩΝ των έργων από το SoftOne (μόνο ανάγνωση). */
export async function refreshFinancialsAction(): Promise<ActionResult<{ projects: number; issues: number }>> {
  const a = await actor('projects.financials');
  if ('error' in a) return a.error;
  try {
    const r = await refreshProjectFinancials();
    revalidatePath('/admin/projects', 'layout');
    return done({ projects: r.projects, issues: r.issues });
  } catch (e) {
    return fail((e as Error).message || 'Αποτυχία υπολογισμού');
  }
}

export async function listOverheadsAction(): Promise<ActionResult<OverheadRateRow[]>> {
  const a = await actor('projects.financials');
  if ('error' in a) return a.error;
  return done(await listOverheadRates());
}

/** Νέο (id = null) ή αλλαγή ποσοστού γενικών εξόδων· τα έργα ξαναϋπολογίζονται. */
export async function saveOverheadAction(id: string | null, input: unknown): Promise<ActionResult> {
  const a = await actor('projects.financials', 'projects.manage');
  if ('error' in a) return a.error;
  const v = parse(overheadRateInput, input);
  if ('error' in v) return v.error;
  const rate = id ? await updateOverheadRate(id, v.data).catch(() => null) : await createOverheadRate(v.data, a.user.id);
  if (!rate) return fail('Το ποσοστό δεν βρέθηκε');
  await logAudit({ userId: a.user.id, userEmail: a.user.email, action: id ? 'overhead.rate.update' : 'overhead.rate.create', resource: 'overhead_rate', resourceId: rate.id, metadata: rate }).catch(() => null);
  await refreshProjectFinancials().catch(() => null);
  revalidatePath('/admin/projects', 'layout');
  return doneEmpty();
}

export async function deleteOverheadAction(id: string): Promise<ActionResult> {
  const a = await actor('projects.financials', 'projects.manage');
  if ('error' in a) return a.error;
  const rate = await deleteOverheadRate(id).catch(() => null);
  if (!rate) return fail('Το ποσοστό δεν βρέθηκε');
  await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'overhead.rate.delete', resource: 'overhead_rate', resourceId: id, metadata: rate }).catch(() => null);
  await refreshProjectFinancials().catch(() => null);
  revalidatePath('/admin/projects', 'layout');
  return doneEmpty();
}

/** Έργα (PRJC) από το SoftOne → `SoftoneProject` (μόνο ανάγνωση· ίδια κλειδαριά με το «Συγχρονισμός όλων»). */
export async function syncProjectsAction(): Promise<ActionResult<{ total: number; created: number; updated: number; deactivated: number }>> {
  const a = await actor('metadata.manage');
  if ('error' in a) return a.error;
  try {
    const r = await withResyncLock(a.user, ['projects'], () => syncProjects(a.user));
    revalidatePath('/admin/projects');
    const deactivated = Number((r.detail as { deactivated?: number } | undefined)?.deactivated ?? 0);
    return done({ total: r.total, created: r.created, updated: r.updated, deactivated });
  } catch (e) {
    const { body } = syncFailureResponse(e);
    const msg = String(body.message ?? 'Αποτυχία συγχρονισμού');
    return fail(body.error === 'softone_error' ? `Σφάλμα SoftOne: ${msg}` : msg);
  }
}

/* ───────────── Εργασίες ───────────── */

const tasksPath = (prjc: number) => revalidatePath(`/admin/projects/${prjc}/tasks`);

/** Νέα εργασία (id = null) ή αλλαγή πεδίων (όσα σταλούν· dependsOn / parties αντικαθιστούν τη λίστα). */
export async function saveTaskAction(prjc: number, id: string | null, input: unknown): Promise<ActionResult<TaskView>> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  const p = posInt(prjc);
  if (!p) return badPrjc;
  try {
    let task: TaskView;
    if (id) {
      const v = parse(taskPatch, input);
      if ('error' in v) return v.error;
      task = await updateTask(p, id, v.data);
      await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'project.task.update', resource: 'project', resourceId: String(p), metadata: { taskId: id, fields: Object.keys(v.data) } }).catch(() => null);
    } else {
      const v = parse(taskInput, input);
      if ('error' in v) return v.error;
      task = await createTask(p, v.data, a.user.id);
      await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'project.task.create', resource: 'project', resourceId: String(p), metadata: { taskId: task.id, name: task.name } }).catch(() => null);
    }
    tasksPath(p);
    return done(task);
  } catch (e) {
    return caught(e);
  }
}

export async function deleteTaskAction(prjc: number, id: string): Promise<ActionResult> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  const p = posInt(prjc);
  if (!p) return badPrjc;
  try {
    await deleteTask(p, id);
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'project.task.delete', resource: 'project', resourceId: String(p), metadata: { taskId: id } }).catch(() => null);
    tasksPath(p);
    return doneEmpty();
  } catch (e) {
    return caught(e);
  }
}

const moveInput = z.object({
  to: z.string().refine((v): v is PhaseKey => (PHASE_KEYS as string[]).includes(v), 'Άγνωστη στήλη'),
  beforeId: z.string().min(1).nullable().default(null),
});

/** Kanban: στήλη (ορίζει το ποσοστό) και θέση μέσα της. */
export async function moveTaskAction(prjc: number, id: string, input: unknown): Promise<ActionResult> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  const p = posInt(prjc);
  if (!p) return badPrjc;
  const v = parse(moveInput, input);
  if ('error' in v) return v.error;
  try {
    await moveTask(p, id, v.data.to as PhaseKey, v.data.beforeId);
    tasksPath(p);
    return doneEmpty();
  } catch (e) {
    return caught(e);
  }
}

/** Αρχεία του φακέλου του έργου, για σύνδεση σε εργασία. */
export async function projectFileChoicesAction(prjc: number): Promise<ActionResult<Awaited<ReturnType<typeof projectFileChoices>>>> {
  const a = await actor('projects.read', 'files.read');
  if ('error' in a) return a.error;
  const p = posInt(prjc);
  return p ? done(await projectFileChoices(p)) : badPrjc;
}

/** Σύνδεση υπαρχόντων αρχείων του έργου σε εργασία (το ανέβασμα νέων μένει στο REST route — multipart). */
export async function linkTaskFilesAction(prjc: number, taskId: string, fileIds: string[]): Promise<ActionResult> {
  const a = await actor('projects.manage', 'files.manage');
  if ('error' in a) return a.error;
  const p = posInt(prjc);
  if (!p) return badPrjc;
  const ids = (Array.isArray(fileIds) ? fileIds : []).filter((x): x is string => typeof x === 'string').slice(0, 100);
  if (!ids.length) return fail('Επιλέξτε αρχείο');
  try {
    await linkTaskFiles(p, taskId, ids);
    tasksPath(p);
    return doneEmpty();
  } catch (e) {
    return caught(e);
  }
}

/** Αφαιρεί τη σύνδεση (το αρχείο μένει στον φάκελο του έργου). */
export async function unlinkTaskFileAction(prjc: number, taskId: string, fileId: string): Promise<ActionResult> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  const p = posInt(prjc);
  if (!p) return badPrjc;
  if (!fileId) return fail('Λείπει το αρχείο');
  try {
    await unlinkTaskFile(p, taskId, fileId);
    tasksPath(p);
    return doneEmpty();
  } catch (e) {
    return caught(e);
  }
}

/* ───────────── Templates εργασιών ───────────── */

/** Αποθήκευση όλων ή μέρους των εργασιών ενός έργου ως template: { name, description?, prjc, taskIds }. */
export async function createTemplateAction(input: unknown): Promise<ActionResult<{ id: string; name: string }>> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  const v = parse(templateCreateInput, input);
  if ('error' in v) return v.error;
  try {
    const t = await createTemplate(v.data, a.user.id);
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'task_template.create', resource: 'task_template', resourceId: t.id, metadata: { name: t.name, prjc: v.data.prjc, tasks: v.data.taskIds.length } }).catch(() => null);
    revalidatePath('/admin/projects/task-templates');
    return done({ id: t.id, name: t.name });
  } catch (e) {
    return caught(e);
  }
}

const templatePatch = z.object({
  name: z.string().trim().min(1, 'Δώστε όνομα').max(120).optional(),
  description: z.string().trim().max(1000).nullish().transform((v) => (v === undefined ? undefined : v || null)),
});

export async function updateTemplateAction(id: string, input: unknown): Promise<ActionResult> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  const v = parse(templatePatch, input);
  if ('error' in v) return v.error;
  try {
    await updateTemplate(id, v.data);
    revalidatePath('/admin/projects/task-templates');
    return doneEmpty();
  } catch (e) {
    return caught(e);
  }
}

export async function deleteTemplateAction(id: string): Promise<ActionResult> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  try {
    await deleteTemplate(id);
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'task_template.delete', resource: 'task_template', resourceId: id }).catch(() => null);
    revalidatePath('/admin/projects/task-templates');
    return doneEmpty();
  } catch (e) {
    return caught(e);
  }
}

const applyInput = z.object({
  prjc: z.coerce.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Μη έγκυρη ημερομηνία'),
});

/** Προσθέτει τις εργασίες του template στο έργο από την ημερομηνία. */
export async function applyTemplateAction(id: string, input: unknown): Promise<ActionResult<{ count: number }>> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  const v = parse(applyInput, input);
  if ('error' in v) return v.error;
  try {
    const count = await applyTemplate(id, v.data.prjc, v.data.startDate, a.user.id);
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'task_template.apply', resource: 'project', resourceId: String(v.data.prjc), metadata: { templateId: id, count } }).catch(() => null);
    tasksPath(v.data.prjc);
    return done({ count });
  } catch (e) {
    return caught(e);
  }
}
