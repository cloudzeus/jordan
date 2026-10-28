// Αποθηκευμένη χαρτογράφηση κάτοψης (`FloorPlan.data`) — καθαρή λογική, κοινή για client και server.
// Οι συντεταγμένες είναι σε pixels της εικόνας ανάλυσης (`w`×`h`)· όταν ξανανοίγει, η εικόνα μπορεί
// να βγει σε λίγο διαφορετική ανάλυση, οπότε όλα κλιμακώνονται με `scalePlanData`.
import { z } from 'zod';
import { wallArea, type RoomWalls } from './walls';
import { pointInPolygon } from './core';
import { planCable, planDevice } from './network';

const pt = z.object({ x: z.number().finite(), y: z.number().finite() });
const opening = z.object({
  id: z.string().max(64), kind: z.enum(['door', 'window', 'other']),
  w: z.number().finite().min(0).max(100), h: z.number().finite().min(0).max(100), count: z.number().int().min(0).max(1000),
  sill: z.number().finite().min(0).max(100).optional(),
  at: z.tuple([pt, pt]).optional(),
});
export const roomMaterial = z.discriminatedUnion('type', [
  z.object({ type: z.literal('recipe'), recipeId: z.string().min(1).max(64), label: z.string().max(300) }),
  z.object({ type: z.literal('item'), mtrl: z.number().int().positive(), code: z.string().max(64), label: z.string().max(300) }),
]);

/** Τοίχοι ενός χώρου (v1): ενεργό πλακάκι, ύψος και ανοίγματα — κοινό για v1 και τα v2 rooms. */
export const roomWalls = z.object({ on: z.boolean(), heightM: z.number().finite().min(0).max(20), openings: z.array(opening).max(100) });

export const savedRoom = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().max(120),
  color: z.string().max(32),
  polygon: z.array(pt).min(3).max(20_000),
  areaPx: z.number().finite().min(0),
  perimeterPx: z.number().finite().min(0),
  manual: z.boolean().default(false),
  walls: roomWalls.nullish().transform((v) => v ?? undefined),
  material: roomMaterial.nullish().transform((v) => v ?? null),
  /** Εναλλακτικό υλικό (Β) για τον χώρο — ο πελάτης διαλέγει A ή Β στην προσφορά. */
  materialB: roomMaterial.nullish().transform((v) => v ?? null),
});
export type SavedRoom = z.infer<typeof savedRoom>;

export const planData = z.object({
  v: z.literal(1),
  w: z.number().int().positive().max(20_000),
  h: z.number().int().positive().max(20_000),
  /** Κενός κάναβος: pixels ανάλυσης ανά μέτρο. */
  pxPerM: z.number().finite().positive().nullish().transform((v) => v ?? null),
  page: z.number().int().positive().default(1),
  calib: z.object({ a: pt, b: pt, meters: z.number().finite().positive() }).nullable(),
  autoWalls: z.boolean().default(true),
  thr: z.number().finite().nullable().default(null),
  thick: z.number().finite().nullable().default(null),
  wallCm: z.number().finite().min(1).max(200).default(15),
  doorCm: z.number().finite().min(0).max(1000).default(100),
  dividers: z.array(z.tuple([pt, pt])).max(2000).default([]),
  drawnWalls: z.array(z.object({ a: pt, b: pt, t: z.number().finite().min(0) })).max(5000).default([]),
  /** Διαστάσεις «από–έως» που τοποθέτησε ο χρήστης (μόνο ένδειξη — δεν επηρεάζουν εμβαδά). */
  dims: z.array(z.object({ id: z.string().min(1).max(64), a: pt, b: pt })).max(500).default([]),
  /** Σημειώσεις-«πινέζες» πάνω στο σχέδιο (κείμενο + φωτογραφίες) — γίνονται εργασίες στην προσφορά. */
  pins: z.array(z.object({
    id: z.string().min(1).max(64), x: z.number().finite(), y: z.number().finite(),
    text: z.string().max(2000).default(''), photoFileIds: z.array(z.string().min(1).max(64)).max(8).default([]),
  })).max(300).default([]),
  /** Ηλεκτρολογικά & δίκτυο: πρίζες, κάμερες, access points, rack (με στοιχεία και φωτογραφίες) και καλωδιώσεις. */
  devices: z.array(planDevice).max(1000).default([]),
  cables: z.array(planCable).max(2000).default([]),
  /** Η τελευταία εικόνα της προβολής 3D (EntityFile, φάκελος «Κατόψεις»). */
  render3dFileId: z.string().max(64).nullish().transform((v) => v ?? null),
  rooms: z.array(savedRoom).max(300),
});
export type PlanData = z.infer<typeof planData>;

// ── planData v2: διανυσματικό μοντέλο σε ΜΕΤΡΑ (οι τοίχοι γίνονται οντότητες) ──────────────────
const calibM = z.object({ a: pt, b: pt, meters: z.number().finite().positive() });

/** Τοίχος v2: ευθύγραμμο τμήμα a–b σε μέτρα, με αναφορά σε τύπο κατασκευής. */
export const wallEntity = z.object({
  id: z.string().min(1).max(64),
  a: pt, b: pt,
  typeId: z.string().max(64).nullable(),
  source: z.enum(['auto', 'cad', 'drawn']),
  locked: z.boolean().optional(),
});

/** Άνοιγμα v2: παραμετρική θέση t0…t1 (0..1) πάνω σε έναν τοίχο. */
export const openingEntity = z.object({
  id: z.string().min(1).max(64),
  wallId: z.string().min(1).max(64),
  t0: z.number().finite().min(0).max(1),
  t1: z.number().finite().min(0).max(1),
  modelId: z.string().max(64).nullish().transform((v) => v ?? null),
  kind: z.enum(['door', 'window', 'other']),
  sillM: z.number().finite().min(0).max(100),
  heightM: z.number().finite().min(0).max(100),
  swing: z.enum(['left', 'right']).nullish().transform((v) => v ?? null),
});

export const savedRoomV2 = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().max(120),
  color: z.string().max(32),
  /** Σπόρος (σημείο μέσα στον χώρο) — για επανυπολογισμό περιγράμματος· null = χειροκίνητος. */
  seed: pt.nullable(),
  /** Περίγραμμα σε μέτρα (παράγωγο· κενό όταν θα ξαναϋπολογιστεί από τους τοίχους). */
  polygon: z.array(pt).max(20_000).default([]),
  manual: z.boolean().default(false),
  walls: roomWalls.nullish().transform((v) => v ?? undefined),
  material: roomMaterial.nullish().transform((v) => v ?? null),
  materialB: roomMaterial.nullish().transform((v) => v ?? null),
  floorM2: z.number().finite().min(0),
  perimeterM: z.number().finite().min(0),
});
export type SavedRoomV2 = z.infer<typeof savedRoomV2>;

export const planDataV2 = z.object({
  v: z.literal(2),
  floor: z.object({ ceilingM: z.number().finite().positive().default(2.8), slabM: z.number().finite().default(0) }).default({ ceilingM: 2.8, slabM: 0 }),
  underlay: z.object({
    fileId: z.string().max(64).nullish().transform((v) => v ?? null),
    page: z.number().int().positive().default(1),
    wPx: z.number().int().positive().max(20_000),
    hPx: z.number().int().positive().max(20_000),
    /** Μέτρα ανά pixel· null = κάτοψη χωρίς κλίμακα (μονάδες εικόνας). */
    mPerPx: z.number().finite().positive().nullable(),
    rotation: z.number().finite().default(0),
    offset: pt.default({ x: 0, y: 0 }),
    calib: calibM.nullable(),
    opacity: z.number().finite().min(0).max(1).default(1),
  }).nullable(),
  walls: z.array(wallEntity).max(20_000).default([]),
  openings: z.array(openingEntity).max(5_000).default([]),
  dividers: z.array(z.tuple([pt, pt])).max(2_000).default([]),
  dims: z.array(z.object({ id: z.string().min(1).max(64), a: pt, b: pt })).max(500).default([]),
  pins: z.array(z.object({
    id: z.string().min(1).max(64), x: z.number().finite(), y: z.number().finite(),
    text: z.string().max(2000).default(''), photoFileIds: z.array(z.string().min(1).max(64)).max(8).default([]),
  })).max(300).default([]),
  devices: z.array(planDevice).max(1000).default([]),
  cables: z.array(planCable).max(2000).default([]),
  render3dFileId: z.string().max(64).nullish().transform((v) => v ?? null),
  rooms: z.array(savedRoomV2).max(300),
});
export type PlanDataV2 = z.infer<typeof planDataV2>;

/** Οποιαδήποτε έκδοση δεδομένων κάτοψης — διακρίνεται από το `v`. */
export const planDataAny = z.discriminatedUnion('v', [planData, planDataV2]);
export type PlanDataAny = z.infer<typeof planDataAny>;

/** Επιμέτρηση m² ενός v2: καθαρό εμβαδό δαπέδου και όψεων τοίχων — ισοδύναμη με το v1 `roomSheet`. */
export function roomTakeoffV2(d: Pick<PlanDataV2, 'rooms'>): { floorM2: number; wallsM2: number } {
  let floorM2 = 0, wallsM2 = 0;
  for (const r of d.rooms) {
    floorM2 += r.floorM2;
    const wl = r.walls as RoomWalls | undefined;
    if (wl?.on) wallsM2 += wallArea(r.perimeterM, wl).net;
  }
  return { floorM2, wallsM2 };
}

export const mPerPxOf = (d: Pick<PlanData, 'calib'>) =>
  d.calib ? d.calib.meters / Math.hypot(d.calib.b.x - d.calib.a.x, d.calib.b.y - d.calib.a.y) : null;

/** Κλιμάκωση όλων των συντεταγμένων στη νέα ανάλυση (`w`×`h`) της εικόνας που ξαναφορτώθηκε. */
export function scalePlanData(d: PlanData, w: number, h: number): PlanData {
  const k = w / d.w;
  if (!Number.isFinite(k) || k <= 0 || Math.abs(k - 1) < 1e-9) return { ...d, w, h };
  const p = (q: { x: number; y: number }) => ({ x: q.x * k, y: q.y * k });
  return {
    ...d, w, h,
    pxPerM: d.pxPerM == null ? null : d.pxPerM * k,
    calib: d.calib ? { a: p(d.calib.a), b: p(d.calib.b), meters: d.calib.meters } : null,
    thick: d.thick == null ? null : Math.max(2, Math.round(d.thick * k)),
    dividers: d.dividers.map(([a, b]) => [p(a), p(b)] as [{ x: number; y: number }, { x: number; y: number }]),
    drawnWalls: d.drawnWalls.map((x) => ({ a: p(x.a), b: p(x.b), t: x.t * k })),
    dims: d.dims.map((x) => ({ ...x, a: p(x.a), b: p(x.b) })),
    pins: d.pins.map((x) => ({ ...x, ...p(x) })),
    devices: d.devices.map((x) => ({ ...x, ...p(x) })),
    cables: d.cables.map((x) => ({ ...x, pts: x.pts.map(p) })),
    rooms: d.rooms.map((r) => ({
      ...r, polygon: r.polygon.map(p), areaPx: r.areaPx * k * k, perimeterPx: r.perimeterPx * k,
      walls: r.walls ? { ...r.walls, openings: r.walls.openings.map((o) => (o.at ? { ...o, at: [p(o.at[0]), p(o.at[1])] as [{ x: number; y: number }, { x: number; y: number }] } : o)) } : r.walls,
    })),
  };
}

const OPENING_LABEL = { door: 'πόρτα', window: 'παράθυρο', other: 'άνοιγμα' } as const;
const nf2 = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Ένας χώρος σε μέτρα — για προσφορά, PDF και προβολή. */
export type RoomSheetRow = {
  name: string; color: string; floorM2: number; perimeterM: number;
  walls: { heightM: number; netM2: number; openingsM2: number; openings: string } | null;
  material: string | null; materialType: 'recipe' | 'item' | null;
};

export function roomSheet(d: Pick<PlanData, 'calib' | 'rooms'>): { rows: RoomSheetRow[]; floorM2: number; wallsM2: number } {
  const mpp = mPerPxOf(d);
  if (!mpp) return { rows: [], floorM2: 0, wallsM2: 0 };
  const rows = d.rooms.map((r): RoomSheetRow => {
    const perimeterM = r.perimeterPx * mpp;
    const wl = r.walls as RoomWalls | undefined;
    const wc = wl?.on ? wallArea(perimeterM, wl) : null;
    return {
      name: r.name.trim() || 'Χώρος', color: r.color, floorM2: r.areaPx * mpp * mpp, perimeterM,
      walls: wc && wl ? {
        heightM: wl.heightM, netM2: wc.net, openingsM2: wc.openings,
        openings: wl.openings.filter((o) => o.count > 0).map((o) => `${o.count}× ${OPENING_LABEL[o.kind]} ${nf2.format(o.w)}×${nf2.format(o.h)}`).join(', '),
      } : null,
      material: r.material?.label ?? null, materialType: r.material?.type ?? null,
    };
  });
  return { rows, floorM2: rows.reduce((s, r) => s + r.floorM2, 0), wallsM2: rows.reduce((s, r) => s + (r.walls?.netM2 ?? 0), 0) };
}

/** Χώρος της χαρτογράφησης σε μέτρα, με το id του — για τον πίνακα χώρων της προσφοράς. */
export type PlanRoom = {
  id: string; name: string; color: string; floorM2: number; wallsM2: number; perimeterM: number;
  material: SavedRoom['material'];
  materialB: SavedRoom['materialB'];
};

export function planRooms(d: Pick<PlanData, 'calib' | 'rooms'>): PlanRoom[] {
  const mpp = mPerPxOf(d);
  if (!mpp) return [];
  return d.rooms.map((r) => {
    const perimeterM = r.perimeterPx * mpp;
    const wl = r.walls as RoomWalls | undefined;
    return {
      id: r.id, name: r.name.trim() || 'Χώρος', color: r.color, floorM2: r.areaPx * mpp * mpp, perimeterM,
      wallsM2: wl?.on ? wallArea(perimeterM, wl).net : 0, material: r.material, materialB: r.materialB,
    };
  });
}

/** Νέα υλικά ανά χώρο (από τη φόρμα της προσφοράς) πάνω στα αποθηκευμένα δεδομένα. */
export function withRoomMaterials(d: PlanData, materials: { roomId: string; material: SavedRoom['material']; materialB?: SavedRoom['materialB'] }[]): PlanData {
  const by = new Map(materials.map((m) => [m.roomId, m]));
  return { ...d, rooms: d.rooms.map((r) => { const m = by.get(r.id); return m ? { ...r, material: m.material ?? null, materialB: m.material ? m.materialB ?? null : null } : r; }) };
}

/** Οι σημειώσεις του σχεδίου με τον χώρο μέσα στον οποίο βρίσκεται η καθεμία (για εργασίες ανά χώρο). */
export type PlanPin = { id: string; text: string; photoFileIds: string[]; roomId: string | null; roomName: string | null };
export function planPins(d: Pick<PlanData, 'pins' | 'rooms'>): PlanPin[] {
  return d.pins.map((p, i) => {
    const r = d.rooms.find((x) => pointInPolygon(p, x.polygon));
    return { id: p.id, text: p.text.trim() || `Σημείωση ${i + 1}`, photoFileIds: p.photoFileIds, roomId: r?.id ?? null, roomName: r ? r.name.trim() || 'Χώρος' : null };
  });
}
