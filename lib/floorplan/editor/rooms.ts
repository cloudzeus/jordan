import type { Pt, WallEntity } from './reducers';

export type DerivedRoom = { polygon: Pt[]; areaM2: number };

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

const centroid = (poly: Pt[]): Pt => {
  let x = 0, y = 0;
  for (const p of poly) { x += p.x; y += p.y; }
  return { x: x / poly.length, y: y / poly.length };
};

/** Point-in-polygon (ray casting). */
function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Τομή τμημάτων p1p2 × p3p4 (και T-junctions)· null αν δεν τέμνονται ή είναι παράλληλα. */
function segInt(p1: Pt, p2: Pt, p3: Pt, p4: Pt): Pt | null {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y, d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
  const e = 1e-6;
  if (t < -e || t > 1 + e || u < -e || u > 1 + e) return null;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

/** Κάθετη προβολή: παράμετρος t∈[0,1] (clamp) και απόσταση. */
function foot(p: Pt, a: Pt, b: Pt): { t: number; d: number } {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return { t, d: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) };
}

/**
 * Οι τοίχοι ορίζουν τους χώρους: planar subdivision των τμημάτων τοίχων → bounded faces (δωμάτια).
 * (1) μάζεμα τμημάτων· (2) τομές· (3) κούμπωμα κόμβων (tol)· (4) κόψιμο τμημάτων στους κόμβους·
 * (5) διάσχιση faces (next = πιο δεξιόστροφη στροφή)· (6) εσωτερικά faces (θετικό εμβαδό) = δωμάτια·
 * το εξωτερικό (unbounded) face απορρίπτεται.
 */
export function roomsFromWalls(walls: WallEntity[], opts: { weldTolM?: number } = {}): DerivedRoom[] {
  const tol = opts.weldTolM ?? 0.05;
  const segs = walls.map((w) => ({ a: w.a, b: w.b })).filter((s) => dist(s.a, s.b) > tol);
  if (segs.length < 3) return [];

  // 1+2: όλα τα υποψήφια σημεία (άκρα + τομές).
  const canon = new Map<string, Pt>();
  const key = (p: Pt) => `${Math.round(p.x / tol)},${Math.round(p.y / tol)}`;
  const weld = (p: Pt): Pt => { const k = key(p); let c = canon.get(k); if (!c) { c = { x: p.x, y: p.y }; canon.set(k, c); } return c; };
  for (const s of segs) { weld(s.a); weld(s.b); }
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const p = segInt(segs[i].a, segs[i].b, segs[j].a, segs[j].b);
    if (p) weld(p);
  }

  // 3+4: κόμβοι + κόψιμο κάθε τμήματος στους κουμπωμένους κόμβους πάνω του.
  const nodes: Pt[] = [];
  const nodeId = new Map<Pt, number>();
  const idOf = (p: Pt) => { let id = nodeId.get(p); if (id === undefined) { id = nodes.length; nodes.push(p); nodeId.set(p, id); } return id; };
  const adj = new Map<number, Set<number>>();
  const link = (u: number, v: number) => { if (u === v) return; (adj.get(u) ?? adj.set(u, new Set()).get(u)!).add(v); (adj.get(v) ?? adj.set(v, new Set()).get(v)!).add(u); };
  const canonPts = [...canon.values()];
  for (const s of segs) {
    const on: { id: number; t: number }[] = [];
    for (const c of canonPts) {
      const f = foot(c, s.a, s.b);
      if (f.d <= tol * 1.5) on.push({ id: idOf(c), t: f.t });
    }
    on.sort((x, y) => x.t - y.t);
    for (let i = 1; i < on.length; i++) if (on[i].id !== on[i - 1].id) link(on[i - 1].id, on[i].id);
  }

  // 5: γωνιακά ταξινομημένες ακμές ανά κόμβο· διάσχιση faces.
  const out = new Map<number, { to: number; ang: number }[]>();
  for (const [u, nbrs] of adj) {
    const list = [...nbrs].map((v) => ({ to: v, ang: Math.atan2(nodes[v].y - nodes[u].y, nodes[v].x - nodes[u].x) }));
    list.sort((a, b) => a.ang - b.ang);
    out.set(u, list);
  }
  const visited = new Set<string>();
  const area = (face: number[]) => { let s = 0; for (let i = 0; i < face.length; i++) { const a = nodes[face[i]], b = nodes[face[(i + 1) % face.length]]; s += a.x * b.y - b.x * a.y; } return s / 2; };

  const rooms: DerivedRoom[] = [];
  for (const [u0, list0] of out) for (const e0 of list0) {
    if (visited.has(`${u0}->${e0.to}`)) continue;
    const face: number[] = [];
    let cu = u0, cv = e0.to, guard = 0, ok = true;
    while (guard++ < 200000) {
      visited.add(`${cu}->${cv}`);
      face.push(cu);
      const l = out.get(cv);
      if (!l) { ok = false; break; }
      const idx = l.findIndex((x) => x.to === cu);
      if (idx < 0) { ok = false; break; }
      const next = l[(idx - 1 + l.length) % l.length]; // πιο δεξιόστροφη στροφή
      cu = cv; cv = next.to;
      if (cu === u0 && cv === e0.to) break;
    }
    if (!ok || face.length < 3) continue;
    const ar = area(face);
    // Τα εσωτερικά (bounded) faces βγαίνουν θετικά με αυτόν τον κανόνα· το εξωτερικό (unbounded) αρνητικό (το απορρίπτουμε).
    if (ar > tol * tol) rooms.push({ polygon: face.map((i) => ({ x: nodes[i].x, y: nodes[i].y })), areaM2: ar });
  }

  // Φωλιασμένα ανεξάρτητα περιγράμματα (π.χ. αυλή/χώρισμα χωρίς κοινό τοίχο): κάθε face αφαιρεί το
  // εμβαδό των ΑΜΕΣΩΝ παιδιών του (ο μικρότερος face που το περικλείει) ώστε το δάπεδο να μη
  // διπλομετρά την περιοχή του εσωτερικού χώρου. (Faces της ίδιας συνιστώσας δεν περικλείουν αλλήλους.)
  const net = rooms.map((r) => r.areaM2);
  const cents = rooms.map((r) => centroid(r.polygon));
  for (let j = 0; j < rooms.length; j++) {
    let parent = -1;
    for (let i = 0; i < rooms.length; i++) {
      if (i === j || rooms[i].areaM2 <= rooms[j].areaM2) continue;
      if (!pointInPoly(cents[j], rooms[i].polygon)) continue;
      if (parent < 0 || rooms[i].areaM2 < rooms[parent].areaM2) parent = i; // πιο στενός περικλείων
    }
    if (parent >= 0) net[parent] -= rooms[j].areaM2;
  }
  return rooms.map((r, i) => ({ ...r, areaM2: net[i] }));
}
