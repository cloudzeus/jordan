import 'server-only';
import { prisma } from '@/lib/db';
import type { FinishKey, RoomInput, RoomView } from '@/lib/project-rooms-core';
import type { RoomsDocInput, RoomsDocKind } from '@/lib/project-rooms-doc';
import { getProject } from '@/lib/projects';
import { getProjectSite } from '@/lib/project-site';
import { siteLine } from '@/lib/project-site-core';
import { emailBrand } from '@/lib/email/brand';
import { itemGuides } from '@/lib/install-guide/item-guides';

/**
 * Χώροι έργου (πίνακας `ProjectRoom`) — όνομα, εμβαδό και τελικό δάπεδο. Μόνο η εφαρμογή γράφει εδώ.
 * Τροφοδοτούν την προσφορά/σύμβαση, τις προδιαγραφές και τις οδηγίες προς τον εργολάβο.
 */
export class RoomsError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

type Row = Awaited<ReturnType<typeof prisma.projectRoom.findMany>>[number];
const view = (r: Row, thumb: Map<number, string>): RoomView => ({
  id: r.id, prjc: r.prjc, name: r.name, areaM2: r.areaM2, perimeterM: r.perimeterM, finish: (r.finish as FinishKey | null) ?? null,
  mtrl: r.mtrl, itemCode: r.itemCode, itemName: r.itemName, itemUnit: r.itemUnit, wastePct: r.wastePct, skirting: r.skirting,
  pattern: r.pattern, notes: r.notes, source: r.source, sortOrder: r.sortOrder, thumbUrl: r.mtrl ? thumb.get(r.mtrl) ?? null : null,
  updatedAt: r.updatedAt.toISOString(),
});

/** Κύρια εικόνα ανά είδος (για τη μικρογραφία δίπλα στο υλικό). Ποτέ δείγμα εγκατάστασης. */
async function thumbs(mtrls: number[]): Promise<Map<number, string>> {
  if (!mtrls.length) return new Map();
  const media = await prisma.itemMedia.findMany({
    where: { mtrl: { in: mtrls }, kind: 'IMAGE', isInstallSample: false },
    orderBy: [{ isPrimary: 'desc' }, { order: 'asc' }], select: { mtrl: true, thumbUrl: true, publicUrl: true },
  });
  const m = new Map<number, string>();
  for (const x of media) if (!m.has(x.mtrl)) m.set(x.mtrl, x.thumbUrl ?? x.publicUrl);
  return m;
}

export async function listRooms(prjc: number): Promise<RoomView[]> {
  const rows = await prisma.projectRoom.findMany({ where: { prjc }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  const t = await thumbs([...new Set(rows.map((r) => r.mtrl).filter((x): x is number => x != null))]);
  return rows.map((r) => view(r, t));
}

const data = (r: RoomInput, userId: string | null) => ({
  name: r.name, areaM2: r.areaM2, perimeterM: r.perimeterM ?? null, finish: r.finish ?? null,
  mtrl: r.mtrl ?? null, itemCode: r.mtrl || r.itemName ? r.itemCode ?? null : null, itemName: r.itemName ?? null, itemUnit: r.itemUnit ?? null,
  wastePct: r.wastePct, skirting: r.skirting, pattern: r.pattern || null, notes: r.notes || null, source: r.source, updatedById: userId,
});

async function assertProject(prjc: number) {
  const p = await prisma.softoneProject.findUnique({ where: { prjc }, select: { prjc: true } });
  if (!p) throw new RoomsError('Το έργο δεν υπάρχει.', 404);
}

/** Αντικατάσταση της λίστας: υπάρχοντα id ενημερώνονται, νέα δημιουργούνται, όσα λείπουν σβήνονται. */
export async function replaceRooms(prjc: number, input: RoomInput[], userId: string | null): Promise<RoomView[]> {
  await assertProject(prjc);
  const existing = new Set((await prisma.projectRoom.findMany({ where: { prjc }, select: { id: true } })).map((r) => r.id));
  const keep = new Set(input.map((r) => r.id).filter((id): id is string => !!id && existing.has(id)));
  await prisma.$transaction([
    prisma.projectRoom.deleteMany({ where: { prjc, id: { notIn: [...keep] } } }),
    ...input.map((r, i) => (r.id && keep.has(r.id)
      ? prisma.projectRoom.update({ where: { id: r.id }, data: { ...data(r, userId), sortOrder: i } })
      : prisma.projectRoom.create({ data: { prjc, ...data(r, userId), sortOrder: i } }))),
  ]);
  return listRooms(prjc);
}

/** Προσθήκη στο τέλος (π.χ. από τη διαστασιολόγηση κάτοψης). */
export async function appendRooms(prjc: number, input: RoomInput[], userId: string | null): Promise<RoomView[]> {
  await assertProject(prjc);
  const last = await prisma.projectRoom.aggregate({ where: { prjc }, _max: { sortOrder: true } });
  const base = (last._max.sortOrder ?? -1) + 1;
  await prisma.projectRoom.createMany({ data: input.map((r, i) => ({ prjc, ...data(r, userId), sortOrder: base + i })) });
  return listRooms(prjc);
}

// ── Έγγραφα Word (προδιαγραφές / εργολάβος) ───────────────────────────────────────────────────
export async function roomsDocInput(prjc: number, kind: RoomsDocKind): Promise<RoomsDocInput> {
  const [project, rooms, site, brand] = await Promise.all([getProject(prjc), listRooms(prjc), getProjectSite(prjc), emailBrand()]);
  if (!project) throw new RoomsError('Το έργο δεν υπάρχει.', 404);
  if (!rooms.length) throw new RoomsError('Δεν υπάρχουν χώροι στο έργο — πρόσθεσέ τους από τη διαστασιολόγηση κάτοψης ή χειροκίνητα.', 409);
  const mtrls = [...new Set(rooms.map((r) => r.mtrl).filter((x): x is number => x != null))];
  const [attrs, guides] = await Promise.all([
    mtrls.length ? prisma.itemAttribute.findMany({ where: { mtrl: { in: mtrls } }, orderBy: { order: 'asc' } }) : [],
    kind === 'contractor' ? itemGuides(mtrls) : [],
  ]);
  const attributes: RoomsDocInput['attributes'] = {};
  for (const a of attrs) (attributes[a.mtrl] ??= []).push({ name: a.name, value: a.value, unit: a.unit });
  const g: RoomsDocInput['guides'] = {};
  for (const x of guides) g[x.mtrl] = {
    summary: x.guide.summary, tools: x.guide.tools, preparation: x.guide.preparation,
    steps: x.guide.steps.map((s) => ({ title: s.title, detail: s.detail, warning: s.warning })),
    qualityChecks: x.guide.qualityChecks, commonMistakes: x.guide.commonMistakes, aftercare: x.guide.aftercare,
  };
  return {
    kind, companyName: brand.legalName || brand.name,
    project: { code: project.code, name: project.name, customer: project.customer?.name ?? null, site: site ? siteLine(site) : null },
    rooms, attributes, guides: g, date: new Date(),
  };
}
