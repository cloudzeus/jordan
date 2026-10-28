// Μετατροπή κάτοψης v1 → v2 στο διάβασμα. Καθαρή λογική (χωρίς DOM/βάση), ώστε να ελέγχεται με vitest.
// Αρχή: διατηρούμε τα m² (οι τοίχοι κάθε χώρου μένουν αυτούσιοι, άρα η επιμέτρηση βγαίνει ίδια)·
// η γεωμετρία περνά σε μέτρα· οι σχεδιασμένοι τοίχοι γίνονται οντότητες με τύπο· τα ανοίγματα που
// έχουν θέση (`at`) προβάλλονται παραμετρικά (t0…t1) στον πλησιέστερο τοίχο.
import { planData, planDataV2, mPerPxOf, type PlanDataV2 } from './saved';
import { nearestWallTypeByThickness } from './wall-types';
import { labelPoint } from './core';

type P = { x: number; y: number };
type WallEntity = PlanDataV2['walls'][number];
type WallType = { id: string; thicknessM: number; active: boolean };

const uid = () => Math.random().toString(36).slice(2, 10);

/** Προβολή σημείου p στο τμήμα a–b: παράμετρος t∈[0,1] και απόσταση. */
function project(p: P, a: P, b: P): { t: number; d: number } {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  const qx = a.x + t * dx, qy = a.y + t * dy;
  return { t, d: Math.hypot(p.x - qx, p.y - qy) };
}

/** Ο πλησιέστερος τοίχος σε σημείο (μέτρα), εντός ανοχής· αλλιώς null. */
function nearestWall(walls: WallEntity[], p: P, tolM: number): { wall: WallEntity; t: number } | null {
  let best: { wall: WallEntity; t: number; d: number } | null = null;
  for (const w of walls) {
    const { t, d } = project(p, w.a, w.b);
    if (d <= tolM && (!best || d < best.d)) best = { wall: w, t, d };
  }
  return best ? { wall: best.wall, t: best.t } : null;
}

/**
 * v1 (ή v2) → v2. Ένα v2 περνά αυτούσιο (passthrough). `opts.wallTypes`: ο κατάλογος τύπων, για να
 * προτείνεται τύπος στους σχεδιασμένους τοίχους από το μετρημένο πάχος.
 */
export function upgradePlanData(raw: unknown, opts: { wallTypes?: WallType[] } = {}): PlanDataV2 {
  if ((raw as { v?: number })?.v === 2) return planDataV2.parse(raw);
  const v1 = planData.parse(raw);
  // Κλίμακα ΜΟΝΟ από το calib — όπως ακριβώς το v1 `roomSheet`/`mPerPxOf`. Κάτοψη με μόνο `pxPerM`
  // (κενός κάναβος) δίνει 0 m² στο v1, άρα μένει «χωρίς κλίμακα» κι εδώ, για πιστή διατήρηση m².
  const mpp = mPerPxOf(v1);
  const m = (p: P): P => (mpp ? { x: p.x * mpp, y: p.y * mpp } : { x: p.x, y: p.y });
  const types = opts.wallTypes ?? [];

  const walls: WallEntity[] = v1.drawnWalls.map((w) => ({
    id: uid(),
    a: m(w.a), b: m(w.b),
    typeId: mpp ? nearestWallTypeByThickness(types, w.t * mpp) : null,
    source: 'drawn',
  }));

  // Ανοχή προβολής ανοιγμάτων: μισό πάχος του χοντρότερου τύπου, τουλάχιστον 0,15 m.
  const tolM = Math.max(0.15, ...types.map((t) => t.thicknessM / 2), 0.15);
  const openings: PlanDataV2['openings'] = [];
  for (const r of v1.rooms) {
    for (const o of r.walls?.openings ?? []) {
      if (!o.at) continue;
      const a = m(o.at[0]), b = m(o.at[1]);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const hit = nearestWall(walls, mid, tolM);
      if (!hit) continue; // μακριά από κάθε τοίχο → μένει μόνο ως καταμέτρηση χώρου
      const t0raw = project(a, hit.wall.a, hit.wall.b).t;
      const t1raw = project(b, hit.wall.a, hit.wall.b).t;
      openings.push({
        id: o.id || uid(), wallId: hit.wall.id,
        t0: Math.min(t0raw, t1raw), t1: Math.max(t0raw, t1raw),
        modelId: null, kind: o.kind, sillM: Math.max(0, o.sill ?? 0), heightM: Math.max(0, o.h), swing: null,
      });
    }
  }

  const rooms: PlanDataV2['rooms'] = v1.rooms.map((r) => {
    const polygon = r.polygon.map(m);
    return {
      id: r.id, name: r.name, color: r.color,
      seed: polygon.length >= 3 ? labelPoint(polygon) : null,
      polygon, manual: r.manual, walls: r.walls,
      material: r.material, materialB: r.materialB,
      floorM2: mpp ? r.areaPx * mpp * mpp : 0,
      perimeterM: mpp ? r.perimeterPx * mpp : 0,
    };
  });

  return planDataV2.parse({
    v: 2,
    floor: { ceilingM: 2.8, slabM: 0 },
    underlay: {
      page: v1.page, wPx: v1.w, hPx: v1.h, mPerPx: mpp, rotation: 0, offset: { x: 0, y: 0 },
      calib: v1.calib ? { a: m(v1.calib.a), b: m(v1.calib.b), meters: v1.calib.meters } : null, opacity: 1,
    },
    walls, openings,
    dividers: v1.dividers.map(([a, b]) => [m(a), m(b)] as [P, P]),
    dims: v1.dims.map((d) => ({ ...d, a: m(d.a), b: m(d.b) })),
    pins: v1.pins.map((p) => ({ ...p, ...m(p) })),
    devices: v1.devices.map((d) => ({ ...d, ...m(d) })),
    cables: v1.cables.map((c) => ({ ...c, pts: c.pts.map(m) })),
    render3dFileId: v1.render3dFileId,
    rooms,
  });
}
