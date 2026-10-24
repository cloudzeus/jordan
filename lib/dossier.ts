// lib/dossier.ts — SERVER. Τεχνικός φάκελος σύμβασης για τον πελάτη: ταυτότητα έργου, χώροι & επιφάνειες,
// υλικά ανά χώρο (με κωδικούς), εργασίες που έγιναν, παραδόσεις με φωτογραφίες, οδηγίες φροντίδας, έγγραφα.
// Μόνο για αποδεκτές συμβάσεις του ίδιου πελάτη· ποτέ τιμές συνεργείων ή ποιο συνεργείο έκανε τι.
import 'server-only';
import { prisma } from '@/lib/db';
import { contractRef, docTitle } from '@/lib/contracts/core';
import { getFloorPlan } from '@/lib/floorplan/plans';
import { planRooms } from '@/lib/floorplan/saved';
import { customerProjectTasks } from '@/lib/project-tasks';
import { careGuides, materialsByRoom } from '@/lib/dossier-core';
import { CABLE_META, DEVICE_KINDS, DEVICE_META, networkSummary } from '@/lib/floorplan/network';

const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : null);

export async function customerDossier(trdr: number, id: string) {
  const c = await prisma.contract.findFirst({
    where: { id, trdr, status: { in: ['ACCEPTED', 'ACTIVE', 'COMPLETED'] } },
    include: {
      lines: { orderBy: { sortOrder: 'asc' }, select: { kind: true, code: true, name: true, qty: true, unit: true, roomId: true } },
      milestones: { where: { partyId: null }, orderBy: [{ sortOrder: 'asc' }], select: { id: true, title: true, status: true, doneAt: true, deliveryNote: true, proofFileIds: true } },
      documents: { where: { audience: 'CUSTOMER' }, orderBy: { createdAt: 'desc' }, select: { id: true, stage: true, version: true, fileId: true } },
      tasks: { select: { projectTaskId: true } },
    },
  });
  if (!c) return null;
  const [plan, project, work] = await Promise.all([
    c.floorPlanId ? getFloorPlan(c.floorPlanId).catch(() => null) : null,
    c.prjc ? prisma.softoneProject.findFirst({ where: { prjc: c.prjc, trdr }, select: { code: true, name: true } }) : null,
    c.prjc ? customerProjectTasks(trdr, c.prjc).catch(() => null) : null,
  ]);
  const rooms = plan ? planRooms(plan.data) : [];
  const mine = new Set(c.tasks.map((t) => t.projectTaskId).filter((x): x is string => !!x));
  const roomById = new Map(rooms.map((r) => [r.id, r.name]));
  // Ηλεκτρολογικά & δίκτυο της κάτοψης: κάθε συσκευή με τα στοιχεία της (για συντήρηση/αντικατάσταση) και τα καλώδια.
  const devices = plan?.data.devices ?? [], cables = plan?.data.cables ?? [];
  const calib = plan?.data.calib;
  const mPerPx = calib ? calib.meters / Math.hypot(calib.b.x - calib.a.x, calib.b.y - calib.a.y) : plan?.data.pxPerM ? 1 / plan.data.pxPerM : null;
  const netSum = devices.length || cables.length ? networkSummary(devices, cables, mPerPx) : null;
  const network = netSum ? {
    groups: (['electrical', 'network'] as const).map((g) => ({
      title: g === 'electrical' ? 'Ηλεκτρολογικά' : 'Δίκτυο & ασφάλεια',
      devices: DEVICE_KINDS.filter((k) => DEVICE_META[k].group === g).flatMap((k) => devices.filter((x) => x.kind === k)).map((x) => ({
        id: x.id, kind: DEVICE_META[x.kind].label, label: x.label, brand: x.brand || null, model: x.model || null, ip: x.ip || null, mac: x.mac || null, serial: x.serial || null,
        notes: x.notes || null, photos: x.photoFileIds, range: x.kind === 'camera' || x.kind === 'ap' ? x.rangeM || null : null,
      })),
    })).filter((g) => g.devices.length),
    cables: [...new Set(cables.map((k) => `${k.kind}|${k.spec || CABLE_META[k.kind].spec}`))].map((key) => {
      const [kind, spec] = key.split('|') as ['power' | 'network', string];
      return { label: `${CABLE_META[kind].label} ${spec}`, runs: cables.filter((k) => k.kind === kind && (k.spec || CABLE_META[kind].spec) === spec).length };
    }),
    powerM: netSum.powerM, networkM: netSum.networkM, racks: netSum.racks, panels: netSum.panels,
  } : null;
  const materials = c.lines.filter((l) => l.kind === 'MATERIAL' && l.qty > 0).map((l) => ({ code: l.code, name: l.name, qty: l.qty, unit: l.unit, room: l.roomId ? roomById.get(l.roomId) ?? null : null }));
  return {
    id: c.id, ref: contractRef(c.number), title: c.title, status: c.status, summary: c.customerText?.trim() || null, // ποτέ η εσωτερική περίληψη
    site: c.siteFormatted || [c.siteAddress, c.siteCity].filter(Boolean).join(', ') || null,
    project, startDate: d(c.startDate), endDate: d(c.endDate), acceptedAt: d(c.acceptedAt), completedAt: d(c.completedAt),
    rooms: rooms.map((r) => ({ name: r.name, floorM2: r.floorM2, wallsM2: r.wallsM2, material: r.material?.label ?? null })),
    materials: materialsByRoom(materials, rooms.map((r) => r.name)),
    services: [...new Set(c.lines.filter((l) => l.kind === 'SERVICE').map((l) => l.name))],
    // Μόνο εργασίες αυτής της σύμβασης (το έργο μπορεί να έχει κι άλλες)· αλλιώς οι εργασίες από τις γραμμές της.
    tasks: (work?.tasks ?? []).filter((t) => t.progress >= 100 && mine.has(t.id)).map((t) => ({ name: t.name, start: t.start, end: t.end })),
    // Παραδόσεις = ορόσημα με περιγραφή ή φωτογραφίες· μια σκέτη πληρωμή (π.χ. προκαταβολή) δεν είναι παράδοση.
    deliveries: c.milestones.filter((m) => m.status !== 'PENDING' && (m.deliveryNote || m.proofFileIds.length)).map((m) => ({ title: m.title, doneAt: d(m.doneAt), note: m.deliveryNote, photos: m.proofFileIds })),
    documents: c.documents.filter((x) => x.fileId).map((x) => ({ id: x.id, title: docTitle(x.stage, 'CUSTOMER'), version: x.version })),
    care: careGuides(materials.map((m) => m.name)),
    network,
  };
}
export type CustomerDossier = NonNullable<Awaited<ReturnType<typeof customerDossier>>>;
