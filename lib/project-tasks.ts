import 'server-only';
import { after } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { emailBrand } from '@/lib/email/brand';
import { taskInviteEmail } from '@/lib/email/templates';
import { sendLeadMail } from '@/lib/lead-mail';
import { buildIcs } from '@/lib/ics';
import { formatSlotEl, zonedParts } from '@/lib/appointments-core';
import { uploadEntityFile } from '@/lib/entity-files/service';
import { typeOfExt } from '@/lib/entity-files/core';
import {
  applyTemplateItems, buildTemplateItems, calendarSegments, calendarWindow, dateOnly, durationLabel, moveOnBoard, PHASE_KEYS, phaseOf, projectProgress,
  schedule, snapProgress, wouldCreateCycle, type PartyKindKey, type PhaseKey, type SchedRow,
} from '@/lib/project-tasks-core';

/**
 * Εργασίες έργου (Tasks) — δικά μας δεδομένα στη βάση, ΚΑΜΙΑ εγγραφή στο SoftOne.
 * Ημερολόγιο: όσα έχουν «στο ημερολόγιο» εμφανίζονται στο ημερολόγιο ραντεβού (χωρίς να κλείνουν
 * θέσεις) και οι υπάλληλοι-εμπλεκόμενοι παίρνουν .ics (ίδιο UID, αυξανόμενο SEQUENCE).
 */

export class TaskError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const TASK_SUBFOLDER = 'Εργασίες';
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Μη έγκυρη ημερομηνία');

const partyInput = z.object({
  kind: z.enum(['EMPLOYEE', 'PARTNER', 'SUPPLIER', 'CUSTOMER']),
  ref: z.string().min(1).max(64), // userId · partnerId · TRDR
});
export type PartyInput = z.infer<typeof partyInput>;

export const taskInput = z.object({
  name: z.string().trim().min(1, 'Δώστε όνομα').max(200),
  description: z.string().trim().max(5000).nullish().transform((v) => v || null),
  startDate: dateStr.nullish().transform((v) => v ?? null),
  durationValue: z.coerce.number().positive('Ο χρόνος πρέπει να είναι θετικός').max(10_000),
  durationUnit: z.enum(['DAYS', 'HOURS']),
  progress: z.coerce.number().min(0).max(100).transform(snapProgress).default(0),
  customerVisible: z.boolean().default(false),
  inCalendar: z.boolean().default(false),
  dependsOn: z.array(z.string().min(1)).max(50).default([]),
  parties: z.array(partyInput).max(50).default([]),
});
export type TaskInput = z.infer<typeof taskInput>;
export const taskPatch = taskInput.partial();

export type TaskParty = { kind: PartyKindKey; ref: string; label: string; sub: string | null };
export type TaskFileView = { id: string; name: string; ext: string; size: number; family: string };
export type TaskView = {
  id: string; prjc: number; name: string; description: string | null; startDate: string | null;
  durationValue: number; durationUnit: 'DAYS' | 'HOURS'; progress: number; phase: PhaseKey; sortOrder: number;
  customerVisible: boolean; inCalendar: boolean; dependsOn: string[]; parties: TaskParty[]; files: TaskFileView[];
  completedAt: string | null; createdAt: string;
  /** Υπολογισμένο πρόγραμμα (εργάσιμες, εξαρτήσεις). */
  sched: SchedRow;
};

const todayAthens = () => zonedParts(new Date()).date;

/** Βάση του χρονοπρογραμματισμού: η έναρξη του έργου στο SoftOne, αλλιώς σήμερα. */
async function projectStart(prjc: number): Promise<string> {
  const p = await prisma.softoneProject.findUnique({ where: { prjc }, select: { fromDate: true } });
  return dateOnly(p?.fromDate) ?? todayAthens();
}

const taskInclude = {
  parties: true,
  dependsOn: { select: { dependsOnId: true } },
  files: { include: { file: { select: { id: true, name: true, ext: true, size: true } } } },
} as const;
type TaskRow = Awaited<ReturnType<typeof loadRows>>[number];
const loadRows = (where: { prjc?: number; id?: { in: string[] } }) =>
  prisma.projectTask.findMany({ where, include: taskInclude, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });

/** Ετικέτες εμπλεκομένων — ένα query ανά είδος, όχι ένα ανά γραμμή. */
async function partyLabels(rows: { kind: string; userId: string | null; partnerId: string | null; trdr: number | null }[]) {
  const users = [...new Set(rows.map((r) => r.userId).filter((v): v is string => !!v))];
  const partners = [...new Set(rows.map((r) => r.partnerId).filter((v): v is string => !!v))];
  const trdrs = [...new Set(rows.map((r) => r.trdr).filter((v): v is number => v != null))];
  const [u, p, t] = await Promise.all([
    users.length ? prisma.user.findMany({ where: { id: { in: users } }, select: { id: true, name: true, email: true } }) : [],
    partners.length ? prisma.partner.findMany({ where: { id: { in: partners } }, select: { id: true, name: true, specialty: true } }) : [],
    trdrs.length ? prisma.softoneTrader.findMany({ where: { trdr: { in: trdrs } }, select: { trdr: true, name: true, code: true } }) : [],
  ]);
  const um = new Map(u.map((x) => [x.id, x]));
  const pm = new Map(p.map((x) => [x.id, x]));
  const tm = new Map(t.map((x) => [x.trdr, x]));
  return (r: (typeof rows)[number]): TaskParty => {
    if (r.kind === 'EMPLOYEE') { const x = um.get(r.userId!); return { kind: 'EMPLOYEE', ref: r.userId!, label: x?.name || x?.email || '—', sub: x?.email ?? null }; }
    if (r.kind === 'PARTNER') { const x = pm.get(r.partnerId!); return { kind: 'PARTNER', ref: r.partnerId!, label: x?.name ?? '—', sub: x?.specialty ?? null }; }
    const x = tm.get(r.trdr!);
    return { kind: r.kind as PartyKindKey, ref: String(r.trdr), label: x?.name ?? `TRDR ${r.trdr}`, sub: x?.code ?? null };
  };
}

type LabelFn = Awaited<ReturnType<typeof partyLabels>>;

async function toViews(rows: TaskRow[], start: string, scheduleOver?: TaskRow[], labels?: LabelFn): Promise<TaskView[]> {
  const label = labels ?? await partyLabels(rows.flatMap((r) => r.parties));
  const basis = scheduleOver ?? rows;
  const sched = schedule(basis.map((r) => ({ id: r.id, startDate: dateOnly(r.startDate), durationValue: r.durationValue, durationUnit: r.durationUnit, dependsOn: r.dependsOn.map((d) => d.dependsOnId) })), start);
  return rows.map((r) => ({
    id: r.id, prjc: r.prjc, name: r.name, description: r.description, startDate: dateOnly(r.startDate),
    durationValue: r.durationValue, durationUnit: r.durationUnit === 'HOURS' ? 'HOURS' : 'DAYS', progress: snapProgress(r.progress), phase: phaseOf(r.progress),
    sortOrder: r.sortOrder, customerVisible: r.customerVisible, inCalendar: r.inCalendar, dependsOn: r.dependsOn.map((d) => d.dependsOnId),
    parties: r.parties.map(label),
    files: r.files.map((f) => ({ id: f.file.id, name: f.file.name, ext: f.file.ext, size: f.file.size, family: typeOfExt(f.file.ext)?.family ?? 'pdf' })),
    completedAt: r.completedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(),
    sched: sched.rows.get(r.id)!,
  }));
}

export async function listTasks(prjc: number) {
  const [rows, start] = await Promise.all([loadRows({ prjc }), projectStart(prjc)]);
  const tasks = await toViews(rows, start);
  return { tasks, projectStart: start, progress: projectProgress(tasks) };
}

export type AllTaskView = TaskView & { projectCode: string; projectName: string; projectActive: boolean; start: string; end: string; conflict: boolean };

/**
 * Όλες οι εργασίες όλων των έργων (σελίδα Operations → Εργασίες). Μόνο η βάση της εφαρμογής —
 * κανένα ζωντανό SoftOne· ένα query για εργασίες, ένα για έργα, ένα ανά είδος εμπλεκομένου.
 */
export async function listAllTasks(): Promise<AllTaskView[]> {
  const rows = await loadRows({});
  if (!rows.length) return [];
  const prjcs = [...new Set(rows.map((r) => r.prjc))];
  const [projects, label] = await Promise.all([
    prisma.softoneProject.findMany({ where: { prjc: { in: prjcs } }, select: { prjc: true, code: true, name: true, fromDate: true, isActive: true } }),
    partyLabels(rows.flatMap((r) => r.parties)),
  ]);
  const pm = new Map(projects.map((p) => [p.prjc, p]));
  const today = todayAthens();
  const out: AllTaskView[] = [];
  for (const prjc of prjcs) {
    const group = rows.filter((r) => r.prjc === prjc);
    const p = pm.get(prjc);
    const views = await toViews(group, dateOnly(p?.fromDate) ?? today, undefined, label);
    for (const v of views) {
      out.push({ ...v, projectCode: p?.code ?? String(prjc), projectName: p?.name ?? `Έργο ${prjc}`, projectActive: p?.isActive ?? false, start: v.sched.start, end: v.sched.end, conflict: v.sched.conflict });
    }
  }
  return out;
}

async function getTaskRow(prjc: number, id: string) {
  const r = await prisma.projectTask.findFirst({ where: { id, prjc }, include: taskInclude });
  if (!r) throw new TaskError('Η εργασία δεν βρέθηκε', 404);
  return r;
}

/** Οι εξαρτήσεις πρέπει να είναι tasks του ΙΔΙΟΥ έργου και να μη δημιουργούν κύκλο. */
async function checkDeps(prjc: number, taskId: string | null, deps: string[]) {
  const wanted = [...new Set(deps)];
  if (!wanted.length) return wanted;
  if (taskId && wanted.includes(taskId)) throw new TaskError('Μια εργασία δεν μπορεί να εξαρτάται από τον εαυτό της');
  const same = await prisma.projectTask.count({ where: { prjc, id: { in: wanted } } });
  if (same !== wanted.length) throw new TaskError('Η εξάρτηση πρέπει να είναι εργασία του ίδιου έργου');
  if (taskId) {
    const edges = await prisma.projectTaskDependency.findMany({ where: { task: { prjc } }, select: { taskId: true, dependsOnId: true } });
    if (wouldCreateCycle(edges, taskId, wanted)) throw new TaskError('Η εξάρτηση δημιουργεί κύκλο (η μία περιμένει την άλλη)');
  }
  return wanted;
}

function partyData(p: PartyInput) {
  if (p.kind === 'EMPLOYEE') return { kind: p.kind, userId: p.ref };
  if (p.kind === 'PARTNER') return { kind: p.kind, partnerId: p.ref };
  const trdr = Number(p.ref);
  if (!Number.isInteger(trdr) || trdr <= 0) throw new TaskError('Μη έγκυρος συναλλασσόμενος');
  return { kind: p.kind, trdr };
}

const uniqParties = (ps: PartyInput[]) => [...new Map(ps.map((p) => [`${p.kind}:${p.ref}`, p])).values()];
const toDate = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);

export async function createTask(prjc: number, input: TaskInput, userId: string): Promise<TaskView> {
  if (!(await prisma.softoneProject.findUnique({ where: { prjc }, select: { prjc: true } }))) throw new TaskError('Το έργο δεν βρέθηκε', 404);
  const deps = await checkDeps(prjc, null, input.dependsOn);
  const phase = phaseOf(input.progress);
  const last = await prisma.projectTask.findMany({ where: { prjc }, select: { progress: true, sortOrder: true } });
  const sortOrder = Math.max(-1, ...last.filter((t) => phaseOf(t.progress) === phase).map((t) => t.sortOrder)) + 1;
  const row = await prisma.projectTask.create({
    data: {
      prjc, name: input.name, description: input.description, startDate: toDate(input.startDate),
      durationValue: input.durationValue, durationUnit: input.durationUnit, progress: input.progress, sortOrder,
      customerVisible: input.customerVisible, inCalendar: input.inCalendar, completedAt: input.progress === 100 ? new Date() : null,
      createdById: userId,
      parties: { create: uniqParties(input.parties).map(partyData) },
      dependsOn: { create: deps.map((d) => ({ dependsOnId: d })) },
    },
  });
  if (row.inCalendar) after(() => sendTaskInvites(row.id, 'created').catch((e) => console.error('[tasks] ics', e)));
  return (await listTasks(prjc)).tasks.find((t) => t.id === row.id)!;
}

export async function updateTask(prjc: number, id: string, patch: z.infer<typeof taskPatch>): Promise<TaskView> {
  const cur = await getTaskRow(prjc, id);
  const deps = patch.dependsOn ? await checkDeps(prjc, id, patch.dependsOn) : null;
  const progress = patch.progress ?? cur.progress;
  const wasDone = cur.progress === 100;
  const timing = (patch.startDate !== undefined && patch.startDate !== dateOnly(cur.startDate))
    || (patch.durationValue !== undefined && patch.durationValue !== cur.durationValue)
    || (patch.durationUnit !== undefined && patch.durationUnit !== cur.durationUnit)
    || (patch.name !== undefined && patch.name !== cur.name)
    || deps !== null;
  const inCalendar = patch.inCalendar ?? cur.inCalendar;
  const calendarKind: 'created' | 'updated' | 'cancelled' | null =
    inCalendar && !cur.inCalendar ? 'created' : !inCalendar && cur.inCalendar ? 'cancelled' : inCalendar && timing ? 'updated' : null;

  await prisma.$transaction(async (tx) => {
    await tx.projectTask.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.startDate !== undefined ? { startDate: toDate(patch.startDate) } : {}),
        ...(patch.durationValue !== undefined ? { durationValue: patch.durationValue } : {}),
        ...(patch.durationUnit !== undefined ? { durationUnit: patch.durationUnit } : {}),
        ...(patch.customerVisible !== undefined ? { customerVisible: patch.customerVisible } : {}),
        progress, inCalendar,
        ...(progress === 100 && !wasDone ? { completedAt: new Date() } : progress < 100 && wasDone ? { completedAt: null } : {}),
        ...(calendarKind && calendarKind !== 'created' ? { icsSequence: { increment: 1 } } : {}),
      },
    });
    if (deps) {
      await tx.projectTaskDependency.deleteMany({ where: { taskId: id } });
      if (deps.length) await tx.projectTaskDependency.createMany({ data: deps.map((d) => ({ taskId: id, dependsOnId: d })) });
    }
    if (patch.parties) {
      await tx.projectTaskParty.deleteMany({ where: { taskId: id } });
      const ps = uniqParties(patch.parties).map(partyData);
      if (ps.length) await tx.projectTaskParty.createMany({ data: ps.map((p) => ({ ...p, taskId: id })) });
    }
  });
  if (calendarKind) after(() => sendTaskInvites(id, calendarKind).catch((e) => console.error('[tasks] ics', e)));
  return (await listTasks(prjc)).tasks.find((t) => t.id === id)!;
}

export async function deleteTask(prjc: number, id: string) {
  const cur = await getTaskRow(prjc, id);
  // Η ακύρωση στα ημερολόγια στέλνεται ΠΡΙΝ σβηστεί η εγγραφή (χρειάζεται τα στοιχεία της).
  if (cur.inCalendar) {
    await prisma.projectTask.update({ where: { id }, data: { icsSequence: { increment: 1 } } });
    await sendTaskInvites(id, 'cancelled').catch((e) => console.error('[tasks] ics', e));
  }
  await prisma.projectTask.delete({ where: { id } });
}

/** Kanban: μεταφορά σε στήλη/θέση· γράφει μόνο όσα άλλαξαν. */
export async function moveTask(prjc: number, id: string, to: PhaseKey, beforeId: string | null) {
  if (!PHASE_KEYS.includes(to)) throw new TaskError('Άγνωστη στήλη');
  const rows = await prisma.projectTask.findMany({ where: { prjc }, select: { id: true, progress: true, sortOrder: true, completedAt: true } });
  if (!rows.some((r) => r.id === id)) throw new TaskError('Η εργασία δεν βρέθηκε', 404);
  const changes = moveOnBoard(rows, id, to, beforeId);
  const prev = new Map(rows.map((r) => [r.id, r]));
  await prisma.$transaction(changes.map((c) => {
    const was = prev.get(c.id)!;
    return prisma.projectTask.update({
      where: { id: c.id },
      data: {
        progress: c.progress, sortOrder: c.sortOrder,
        ...(c.progress === 100 && was.progress !== 100 ? { completedAt: new Date() } : c.progress < 100 && was.progress === 100 ? { completedAt: null } : {}),
      },
    });
  }));
  return changes;
}

// ── Αρχεία ──────────────────────────────────────────────────────────────────────────────────────
export async function uploadTaskFile(prjc: number, taskId: string, file: { buffer: Buffer; name: string }, user: { id: string; name: string | null; email: string }) {
  await getTaskRow(prjc, taskId);
  const saved = await uploadEntityFile({ type: 'PROJECT', id: prjc, buffer: file.buffer, name: file.name, subfolder: TASK_SUBFOLDER, user });
  await prisma.projectTaskFile.create({ data: { taskId, fileId: saved.id } });
  return saved;
}

/** Σύνδεση υπαρχόντων αρχείων του φακέλου του ΙΔΙΟΥ έργου. */
export async function linkTaskFiles(prjc: number, taskId: string, fileIds: string[]) {
  await getTaskRow(prjc, taskId);
  const ok = await prisma.entityFile.findMany({ where: { id: { in: fileIds }, folder: { entityType: 'PROJECT', entityId: prjc } }, select: { id: true } });
  if (ok.length !== new Set(fileIds).size) throw new TaskError('Μπορείτε να συνδέσετε μόνο αρχεία του φακέλου του έργου');
  await prisma.projectTaskFile.createMany({ data: ok.map((f) => ({ taskId, fileId: f.id })), skipDuplicates: true });
}

export async function unlinkTaskFile(prjc: number, taskId: string, fileId: string) {
  await getTaskRow(prjc, taskId);
  await prisma.projectTaskFile.deleteMany({ where: { taskId, fileId } });
}

export async function projectFileChoices(prjc: number) {
  const rows = await prisma.entityFile.findMany({ where: { folder: { entityType: 'PROJECT', entityId: prjc } }, orderBy: [{ subfolder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, ext: true, subfolder: true } });
  return rows;
}

// ── Επιλογές εμπλεκομένων ──────────────────────────────────────────────────────────────────────
export type PartyOption = { kind: PartyKindKey; ref: string; label: string; sub: string | null };

/** Υπάλληλοι (προσωπικό) και συνεργάτες — λίγοι, φορτώνονται όλοι· ο πελάτης/προμηθευτής του έργου πρώτοι. */
export async function partyOptions(prjc: number): Promise<PartyOption[]> {
  const [staff, partners, project] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true, role: { OR: [{ key: null }, { key: { in: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'] } }] } }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } }),
    prisma.partner.findMany({ where: { isActive: true }, select: { id: true, name: true, specialty: true }, orderBy: { name: 'asc' } }),
    prisma.softoneProject.findUnique({ where: { prjc }, select: { trdr: true, trdrSu: true } }),
  ]);
  const own = await prisma.softoneTrader.findMany({ where: { trdr: { in: [project?.trdr, project?.trdrSu].filter((v): v is number => v != null) } }, select: { trdr: true, name: true, code: true } });
  return [
    ...staff.map((u) => ({ kind: 'EMPLOYEE' as const, ref: u.id, label: u.name || u.email, sub: u.email })),
    ...partners.map((p) => ({ kind: 'PARTNER' as const, ref: p.id, label: p.name, sub: p.specialty })),
    ...own.map((t) => ({ kind: (t.trdr === project?.trdr ? 'CUSTOMER' : 'SUPPLIER') as PartyKindKey, ref: String(t.trdr), label: t.name, sub: t.code })),
  ];
}

/** Αναζήτηση πελατών (SODTYPE 13) ή προμηθευτών (12) στον καθρέφτη του SoftOne. */
export async function searchTraders(kind: 'CUSTOMER' | 'SUPPLIER', q: string): Promise<PartyOption[]> {
  const s = q.trim();
  if (s.length < 2) return [];
  const rows = await prisma.softoneTrader.findMany({
    where: { sodtype: kind === 'CUSTOMER' ? 13 : 12, isActive: true, OR: [{ name: { contains: s, mode: 'insensitive' } }, { code: { contains: s } }, { afm: { contains: s } }] },
    select: { trdr: true, name: true, code: true }, orderBy: { name: 'asc' }, take: 12,
  });
  return rows.map((t) => ({ kind, ref: String(t.trdr), label: t.name, sub: t.code }));
}

// ── Templates ───────────────────────────────────────────────────────────────────────────────────
export const templateCreateInput = z.object({
  name: z.string().trim().min(1, 'Δώστε όνομα').max(120),
  description: z.string().trim().max(1000).nullish().transform((v) => v || null),
  prjc: z.coerce.number().int().positive(),
  taskIds: z.array(z.string().min(1)).min(1, 'Επιλέξτε τουλάχιστον μία εργασία').max(500),
});

export async function listTemplates() {
  const rows = await prisma.taskTemplate.findMany({ orderBy: { name: 'asc' }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
  return rows.map((t) => ({
    id: t.id, name: t.name, description: t.description, updatedAt: t.updatedAt.toISOString(),
    items: t.items.map((i) => ({
      key: i.key, name: i.name, description: i.description, offsetDays: i.offsetDays, durationValue: i.durationValue, durationUnit: i.durationUnit,
      duration: durationLabel(i.durationValue, i.durationUnit), dependsOn: i.dependsOn, customerVisible: i.customerVisible, inCalendar: i.inCalendar,
    })),
  }));
}
export type TemplateView = Awaited<ReturnType<typeof listTemplates>>[number];

export async function createTemplate(input: z.infer<typeof templateCreateInput>, userId: string) {
  if (await prisma.taskTemplate.findUnique({ where: { name: input.name } })) throw new TaskError('Υπάρχει ήδη template με αυτό το όνομα', 409);
  const [rows, start] = await Promise.all([loadRows({ prjc: input.prjc }), projectStart(input.prjc)]);
  const items = buildTemplateItems(rows.map((r) => ({
    id: r.id, name: r.name, description: r.description, startDate: dateOnly(r.startDate), durationValue: r.durationValue, durationUnit: r.durationUnit,
    dependsOn: r.dependsOn.map((d) => d.dependsOnId), customerVisible: r.customerVisible, inCalendar: r.inCalendar,
  })), input.taskIds, start);
  if (!items.length) throw new TaskError('Δεν βρέθηκαν οι εργασίες στο έργο');
  return prisma.taskTemplate.create({ data: { name: input.name, description: input.description, createdById: userId, items: { create: items } } });
}

export async function updateTemplate(id: string, patch: { name?: string; description?: string | null }) {
  if (patch.name) {
    const clash = await prisma.taskTemplate.findFirst({ where: { name: patch.name, id: { not: id } } });
    if (clash) throw new TaskError('Υπάρχει ήδη template με αυτό το όνομα', 409);
  }
  return prisma.taskTemplate.update({ where: { id }, data: patch });
}

export const deleteTemplate = (id: string) => prisma.taskTemplate.delete({ where: { id } });

/** Προσθέτει τα tasks του template στο έργο (στη στήλη «Να γίνει»), με εξαρτήσεις μεταξύ τους. */
export async function applyTemplate(templateId: string, prjc: number, start: string, userId: string) {
  const [t, project] = await Promise.all([
    prisma.taskTemplate.findUnique({ where: { id: templateId }, include: { items: { orderBy: { sortOrder: 'asc' } } } }),
    prisma.softoneProject.findUnique({ where: { prjc }, select: { prjc: true } }),
  ]);
  if (!t) throw new TaskError('Το template δεν βρέθηκε', 404);
  if (!project) throw new TaskError('Το έργο δεν βρέθηκε', 404);
  const planned = applyTemplateItems(t.items, start);
  const created = await prisma.$transaction(async (tx) => {
    const existing = await tx.projectTask.findMany({ where: { prjc }, select: { progress: true, sortOrder: true } });
    let order = Math.max(-1, ...existing.filter((e) => phaseOf(e.progress) === 'TODO').map((e) => e.sortOrder)) + 1;
    const idOf = new Map<string, string>();
    for (const p of planned) {
      const row = await tx.projectTask.create({
        data: {
          prjc, name: p.name, description: p.description, startDate: p.followsDeps ? null : toDate(p.startDate), durationValue: p.durationValue, durationUnit: p.durationUnit,
          customerVisible: p.customerVisible, inCalendar: p.inCalendar, sortOrder: order++, createdById: userId,
        },
      });
      idOf.set(p.key, row.id);
    }
    const edges = planned.flatMap((p) => p.dependsOnKeys.map((k) => ({ taskId: idOf.get(p.key)!, dependsOnId: idOf.get(k)! })));
    if (edges.length) await tx.projectTaskDependency.createMany({ data: edges });
    return [...idOf.values()];
  }, { timeout: 30_000 });
  // Χωρίς εμπλεκόμενους ακόμη: οι προσκλήσεις .ics φεύγουν όταν προστεθούν υπάλληλοι (ενημέρωση task).
  return created.length;
}

// ── Ημερολόγιο ──────────────────────────────────────────────────────────────────────────────────
export type CalendarTask = { id: string; taskId: string; prjc: number; projectCode: string; projectName: string; name: string; start: string; end: string; progress: number };

/** Tasks «στο ημερολόγιο» που τέμνουν το διάστημα — ένα τμήμα ανά εργάσιμη, από το υπολογισμένο πρόγραμμα. */
export async function calendarTasks(from: Date, to: Date): Promise<CalendarTask[]> {
  const prjcs = (await prisma.projectTask.findMany({ where: { inCalendar: true }, select: { prjc: true }, distinct: ['prjc'] })).map((r) => r.prjc);
  if (!prjcs.length) return [];
  const projects = await prisma.softoneProject.findMany({ where: { prjc: { in: prjcs } }, select: { prjc: true, code: true, name: true } });
  const out: CalendarTask[] = [];
  for (const p of projects) {
    const { tasks } = await listTasks(p.prjc);
    for (const t of tasks) {
      if (!t.inCalendar) continue;
      for (const s of calendarSegments(t.sched.start, t.durationValue, t.durationUnit)) {
        if (s.start < to && s.end > from) out.push({ id: `${t.id}:${s.date}`, taskId: t.id, prjc: p.prjc, projectCode: p.code, projectName: p.name, name: t.name, start: s.start.toISOString(), end: s.end.toISOString(), progress: t.progress });
      }
    }
  }
  return out;
}

type InviteKind = 'created' | 'updated' | 'cancelled';

/** .ics στους υπαλλήλους-εμπλεκόμενους (και σε όποιον τη δημιούργησε). Δεν πετάει ποτέ. */
export async function sendTaskInvites(id: string, kind: InviteKind) {
  const t = await prisma.projectTask.findUnique({ where: { id }, include: { parties: true } });
  if (!t) return [];
  const ids = [...new Set([t.createdById, ...t.parties.filter((p) => p.kind === 'EMPLOYEE').map((p) => p.userId)].filter((x): x is string => !!x))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { name: true, email: true } }) : [];
  if (!users.length) return [];
  const [project, { tasks }] = await Promise.all([
    prisma.softoneProject.findUnique({ where: { prjc: t.prjc }, select: { code: true, name: true } }),
    listTasks(t.prjc),
  ]);
  const view = tasks.find((x) => x.id === id);
  const w = calendarWindow(view?.sched.start ?? dateOnly(t.startDate) ?? todayAthens(), t.durationValue, t.durationUnit);
  const brand = await emailBrand();
  const projectLabel = project ? `${project.code} · ${project.name}` : `Έργο ${t.prjc}`;
  const ics = buildIcs({
    uid: `task-${t.id}@atelierdamask.gr`, start: w.start, end: w.end, summary: `${t.name} · ${projectLabel}`,
    description: [projectLabel, durationLabel(t.durationValue, t.durationUnit), t.description].filter(Boolean).join('\n'),
    sequence: t.icsSequence, cancelled: kind === 'cancelled',
  });
  const m = taskInviteEmail(brand, kind, {
    name: t.name, project: projectLabel, when: formatSlotEl(w.start.toISOString(), w.end.toISOString()),
    duration: durationLabel(t.durationValue, t.durationUnit), description: t.description,
  });
  const out: { email: string; result: string }[] = [];
  for (const u of users) {
    out.push({
      email: u.email,
      result: await sendLeadMail(u.email, m.subject, m.html, {
        text: m.text,
        attachments: [{ filename: kind === 'cancelled' ? 'akyrosi-ergasias.ics' : 'ergasia.ics', content: ics, contentType: `text/calendar; charset=utf-8; method=${kind === 'cancelled' ? 'CANCEL' : 'PUBLISH'}` }],
      }),
    });
  }
  return out;
}

// ── Portal πελάτη ───────────────────────────────────────────────────────────────────────────────
export type CustomerTask = { id: string; name: string; description: string | null; start: string; end: string; progress: number; phase: PhaseKey; files: TaskFileView[] };

/** ΜΟΝΟ οι εργασίες «ορατές στον πελάτη» ενός έργου ΤΟΥ πελάτη· ημερομηνίες από το πλήρες πρόγραμμα. */
export async function customerProjectTasks(trdr: number, prjc: number): Promise<{ tasks: CustomerTask[]; progress: number } | null> {
  const p = await prisma.softoneProject.findFirst({ where: { prjc, trdr }, select: { prjc: true } });
  if (!p) return null;
  const [all, start] = await Promise.all([loadRows({ prjc }), projectStart(prjc)]);
  const visible = all.filter((r) => r.customerVisible);
  if (!visible.length) return { tasks: [], progress: 0 };
  const views = await toViews(visible, start, all);
  const tasks = views
    .map((t) => ({ id: t.id, name: t.name, description: t.description, start: t.sched.start, end: t.sched.end, progress: t.progress, phase: t.phase, files: t.files }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name, 'el'));
  return { tasks, progress: projectProgress(views) };
}

/** Αρχείο για λήψη από τον πελάτη: μόνο αν ανήκει σε ορατή εργασία έργου ΤΟΥ πελάτη. */
export async function customerTaskFile(trdr: number, fileId: string) {
  const link = await prisma.projectTaskFile.findFirst({
    where: { fileId, task: { customerVisible: true } },
    include: { task: { select: { prjc: true } }, file: true },
  });
  if (!link) return null;
  const owns = await prisma.softoneProject.findFirst({ where: { prjc: link.task.prjc, trdr }, select: { prjc: true } });
  return owns ? link.file : null;
}
