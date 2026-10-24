import 'server-only';
import { prisma } from '@/lib/db';
import { bunnyDownload } from '@/lib/bunny';
import { deleteEntityFile, getEntityFile, uploadEntityFile } from '@/lib/entity-files/service';
import { EntityFileError } from '@/lib/entity-files/core';
import { planData, roomSheet, type PlanData, type RoomSheetRow } from './saved';

// Αποθηκευμένες χαρτογραφήσεις κάτοψης (`FloorPlan`). Ανήκουν σε έργο ή — όταν η προσφορά γίνεται από
// το μενού του πελάτη, πριν υπάρξει έργο — σε πελάτη. Οι εικόνες ανεβαίνουν στα αρχεία του έργου ή του
// πελάτη, υποφάκελος «Κατόψεις»· σε ενημέρωση τα παλιά αρχεία της ίδιας χαρτογράφησης σβήνονται.

export class FloorPlanError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const SUBFOLDER = 'Κατόψεις';
const MAX_PNG = 15 * 1024 * 1024;
type User = { id: string; name: string | null; email: string };

/** Σε ποιον ανήκει η χαρτογράφηση: έργο SoftOne ή πελάτης (προσφορά πριν από το έργο). */
export type PlanOwner = { kind: 'project'; prjc: number } | { kind: 'customer'; trdr: number };
const ownerWhere = (o: PlanOwner) => (o.kind === 'project' ? { prjc: o.prjc } : { trdr: o.trdr });
const ownerFiles = (o: PlanOwner) => (o.kind === 'project' ? { type: 'PROJECT' as const, id: o.prjc } : { type: 'TRADER' as const, id: o.trdr });

export type FloorPlanListRow = {
  id: string; title: string; source: string | null; floorM2: number; wallsM2: number; roomCount: number;
  annotatedFileId: string | null; updatedAt: string; contracts: { id: string; number: number; title: string }[];
};

export async function listFloorPlans(owner: PlanOwner): Promise<FloorPlanListRow[]> {
  const rows = await prisma.floorPlan.findMany({
    where: ownerWhere(owner), orderBy: { updatedAt: 'desc' }, take: 50,
    select: { id: true, title: true, source: true, floorM2: true, wallsM2: true, roomCount: true, annotatedFileId: true, updatedAt: true, contracts: { select: { id: true, number: true, title: true } } },
  });
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

export async function getFloorPlan(id: string) {
  const r = await prisma.floorPlan.findUnique({ where: { id } });
  if (!r) return null;
  const d = planData.safeParse(r.data);
  if (!d.success) throw new FloorPlanError('Η αποθηκευμένη χαρτογράφηση δεν διαβάζεται', 500);
  return { id: r.id, prjc: r.prjc, trdr: r.trdr, title: r.title, source: r.source, imageFileId: r.imageFileId, annotatedFileId: r.annotatedFileId, sourceFileId: r.sourceFileId, updatedAt: r.updatedAt.toISOString(), data: d.data };
}

function pngBuffer(f: File | null, what: string): Promise<Buffer> | null {
  if (!f) return null;
  if (f.type !== 'image/png') throw new FloorPlanError(`Η ${what} πρέπει να είναι PNG`);
  if (f.size > MAX_PNG) throw new FloorPlanError(`Η ${what} είναι πολύ μεγάλη`);
  return f.arrayBuffer().then((b) => Buffer.from(b));
}

/**
 * Νέα (χωρίς `id`) ή ενημέρωση χαρτογράφησης. `image` = σχέδιο χωρίς σημειώσεις (απαιτείται στη νέα),
 * `annotated` = με χώρους και υπόμνημα. Επιστρέφει το id.
 */
export async function saveFloorPlan(o: {
  owner: PlanOwner; id?: string | null; title: string; source: string | null; data: unknown;
  image: File | null; annotated: File | null;
  /** Το πρωτότυπο αρχείο του χρήστη (φωτογραφία σχεδίου ή PDF) — στέλνεται όταν φορτώθηκε νέο σχέδιο. */
  original?: File | null;
  /** Εικόνα της προβολής 3D — κρατιέται στα αρχεία ώστε να μη χάνεται το render. */
  render3d?: File | null;
  user: User;
}): Promise<{ id: string; created: boolean }> {
  const parsed = planData.safeParse(o.data);
  if (!parsed.success) throw new FloorPlanError(`Μη έγκυρα δεδομένα χαρτογράφησης: ${parsed.error.issues[0]?.message ?? ''}`);
  const d: PlanData = parsed.data;
  const cur = o.id ? await prisma.floorPlan.findUnique({ where: { id: o.id } }) : null;
  if (o.id && !cur) throw new FloorPlanError('Η χαρτογράφηση δεν βρέθηκε', 404);
  if (cur && (o.owner.kind === 'project' ? cur.prjc !== o.owner.prjc : cur.trdr !== o.owner.trdr)) {
    throw new FloorPlanError(o.owner.kind === 'project' ? 'Η χαρτογράφηση ανήκει σε άλλο έργο' : 'Η χαρτογράφηση ανήκει σε άλλον πελάτη', 409);
  }
  const files = ownerFiles(o.owner);
  if (!cur && !o.image) throw new FloorPlanError('Λείπει η εικόνα της κάτοψης');

  const stamp = new Date().toISOString().slice(0, 10);
  const safe = o.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'katopsi';
  const upload = async (f: File | null, suffix: string, notes: string) => {
    const buf = await pngBuffer(f, suffix === 'sxedio' ? 'εικόνα κάτοψης' : suffix === '3d' ? 'εικόνα 3D' : 'εικόνα με τους χώρους');
    if (!buf) return null;
    const file = await uploadEntityFile({ ...files, buffer: buf, name: `${safe}-${suffix}-${stamp}.png`, subfolder: SUBFOLDER, notes, user: o.user });
    return file.id;
  };
  // Το πρωτότυπο ανεβαίνει με το δικό του όνομα· τύπος/υπογραφή ελέγχονται από τα αρχεία έργων.
  const uploadOriginal = async (f: File | null | undefined) => {
    if (!f) return null;
    try {
      const file = await uploadEntityFile({ ...files, buffer: Buffer.from(await f.arrayBuffer()), name: f.name, subfolder: SUBFOLDER, notes: `Χαρτογράφηση «${o.title}» — πρωτότυπο σχέδιο`, user: o.user });
      return file.id;
    } catch (e) {
      if (e instanceof EntityFileError) throw new FloorPlanError(`Το πρωτότυπο σχέδιο δεν αποθηκεύτηκε: ${e.message}`, 415);
      throw e;
    }
  };
  const sheet = roomSheet(d);
  const [imageFileId, annotatedFileId, sourceFileId, render3dFileId] = await Promise.all([
    upload(o.image, 'sxedio', `Χαρτογράφηση «${o.title}» — σχέδιο`),
    upload(o.annotated, 'xoroi', `Χαρτογράφηση «${o.title}» — ${d.rooms.length} χώροι`),
    uploadOriginal(o.original),
    upload(o.render3d ?? null, '3d', `Χαρτογράφηση «${o.title}» — προβολή 3D`),
  ]);
  // Χωρίς νέο render κρατιέται το προηγούμενο (ο client δεν το ξέρει πάντα).
  const prevRender = cur ? planData.safeParse(cur.data).data?.render3dFileId ?? null : null;
  d.render3dFileId = render3dFileId ?? prevRender;
  const fields = {
    title: o.title, source: o.source, data: d as unknown as object,
    floorM2: sheet.floorM2, wallsM2: sheet.wallsM2, roomCount: d.rooms.length,
    ...(imageFileId ? { imageFileId } : {}), ...(annotatedFileId ? { annotatedFileId } : {}), ...(sourceFileId ? { sourceFileId } : {}),
  };
  if (cur) {
    await prisma.floorPlan.update({ where: { id: cur.id }, data: fields });
    // Οι αντικατεστημένες εικόνες σβήνονται από τα αρχεία του έργου.
    for (const [old, now] of [[cur.imageFileId, imageFileId], [cur.annotatedFileId, annotatedFileId], [cur.sourceFileId, sourceFileId]] as const) {
      if (old && now && old !== now) await deleteEntityFile(old).catch((e) => console.error('[floorplan] delete old file', e));
    }
    if (prevRender && render3dFileId && prevRender !== render3dFileId) await deleteEntityFile(prevRender).catch((e) => console.error('[floorplan] delete old 3d', e));
    return { id: cur.id, created: false };
  }
  // Χαρτογράφηση έργου: κρατάμε και τον πελάτη του έργου (εμφανίζεται και στο μενού του πελάτη).
  const owner = o.owner.kind === 'project'
    ? { prjc: o.owner.prjc, trdr: (await prisma.softoneProject.findUnique({ where: { prjc: o.owner.prjc }, select: { trdr: true } }))?.trdr ?? null }
    : { prjc: null, trdr: o.owner.trdr };
  const row = await prisma.floorPlan.create({ data: { ...owner, createdById: o.user.id, ...fields } });
  return { id: row.id, created: true };
}

/** Κάτοψη & χώροι για τα PDF προσφοράς/συνεργείων: η εικόνα με τους χώρους (bytes) και ο πίνακας. */
export async function floorPlanForDocument(floorPlanId: string | null): Promise<{ title: string; png: Uint8Array | null; rows: RoomSheetRow[]; floorM2: number; wallsM2: number } | null> {
  if (!floorPlanId) return null;
  const p = await getFloorPlan(floorPlanId).catch(() => null);
  if (!p) return null;
  let png: Uint8Array | null = null;
  if (p.annotatedFileId) {
    const f = await getEntityFile(p.annotatedFileId);
    if (f) png = await bunnyDownload(f.storageKey).catch((e) => { console.error('[floorplan] download', e); return null; });
  }
  const sheet = roomSheet(p.data);
  return { title: p.title, png, ...sheet };
}

/** Το έργο που δημιουργήθηκε/συνδέθηκε για μια προσφορά πελάτη: η χαρτογράφησή της αποκτά και έργο. */
export async function attachFloorPlanToProject(floorPlanId: string | null, prjc: number) {
  if (!floorPlanId) return;
  await prisma.floorPlan.updateMany({ where: { id: floorPlanId, prjc: null }, data: { prjc } });
}
