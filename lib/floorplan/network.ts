// lib/floorplan/network.ts — καθαρή λογική για ηλεκτρολογικά & δίκτυο στην κάτοψη: συσκευές (πρίζες, κάμερες,
// access points, φωτιστικά, διακόπτες, rack, ηλεκτρικός πίνακας) και καλωδιώσεις. Το δίκτυο είναι «αστέρι»: κάθε
// καλώδιο δικτύου τερματίζει στο rack. Το ρεύμα πάει σε κυκλώματα: αρκεί η συσκευή να φτάνει στον πίνακα μέσω καλωδίων.
import { z } from 'zod';
import type { Pt } from './core';

export const DEVICE_KINDS = ['socket', 'light', 'switch', 'panel', 'data', 'camera', 'ap', 'rack'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];
export const CABLE_KINDS = ['power', 'network'] as const;
export type CableKind = (typeof CABLE_KINDS)[number];

export type DeviceGroup = 'electrical' | 'network';
export const DEVICE_META: Record<DeviceKind, { label: string; short: string; color: string; help: string; group: DeviceGroup; rangeM?: number; fov?: number; needsNetwork: boolean; needsPower: boolean }> = {
  socket: { label: 'Πρίζα ρεύματος', short: 'Πρίζα', color: '#F97316', group: 'electrical', help: 'Σημείο ρεύματος (σούκο/μονοφασική).', needsNetwork: false, needsPower: true },
  light: { label: 'Φωτιστικό', short: 'Φως', color: '#FACC15', group: 'electrical', help: 'Σημείο φωτισμού (οροφής ή τοίχου).', needsNetwork: false, needsPower: true },
  switch: { label: 'Διακόπτης', short: 'Διακ.', color: '#A3E635', group: 'electrical', help: 'Διακόπτης φωτισμού ή ρολών.', needsNetwork: false, needsPower: true },
  panel: { label: 'Ηλεκτρικός πίνακας', short: 'Πίνακας', color: '#F43F5E', group: 'electrical', help: 'Ο πίνακας: εδώ καταλήγουν τα κυκλώματα ρεύματος.', needsNetwork: false, needsPower: false },
  data: { label: 'Πρίζα δικτύου (RJ45)', short: 'RJ45', color: '#22D3EE', group: 'network', needsPower: false, help: 'Σημείο δικτύου· το καλώδιό του καταλήγει στο rack.', needsNetwork: true },
  camera: { label: 'Κάμερα', short: 'Κάμερα', color: '#C084FC', group: 'network', needsPower: false, help: 'Κάμερα IP με γωνία λήψης και εμβέλεια· δεύτερο κλικ = προς τα πού κοιτά.', rangeM: 10, fov: 90, needsNetwork: true },
  ap: { label: 'Access point (Wi-Fi)', short: 'AP', color: '#34D399', group: 'network', needsPower: false, help: 'Σημείο Wi-Fi με κύκλο κάλυψης.', rangeM: 12, needsNetwork: true },
  rack: { label: 'Rack', short: 'Rack', color: '#CBD5E1', group: 'network', needsPower: false, help: 'Καμπίνα δικτύου· εδώ τερματίζουν τα καλώδια δικτύου.', needsNetwork: false },
};
/**
 * Θέση στον χώρο για την προβολή 3D: ύψος τοποθέτησης (m) και μέγεθος (πλάτος × ύψος × βάθος, m).
 * Τυπικά ύψη εγκατάστασης· τα μικρά σημεία σχεδιάζονται μεγαλύτερα από το πραγματικό για να φαίνονται σε όλο το σπίτι.
 */
export const DEVICE_3D: Record<DeviceKind, { mountM: number; size: [number, number, number]; shape: 'box' | 'disc' | 'cyl' }> = {
  socket: { mountM: 0.3, size: [0.24, 0.24, 0.1], shape: 'box' },
  light: { mountM: 2.72, size: [0.5, 0.08, 0.5], shape: 'disc' },
  switch: { mountM: 1.1, size: [0.24, 0.24, 0.1], shape: 'box' },
  panel: { mountM: 1.5, size: [0.45, 0.6, 0.14], shape: 'box' },
  data: { mountM: 0.3, size: [0.24, 0.24, 0.1], shape: 'box' },
  camera: { mountM: 2.6, size: [0.2, 0.2, 0.42], shape: 'cyl' },
  ap: { mountM: 2.72, size: [0.45, 0.08, 0.45], shape: 'disc' },
  rack: { mountM: 0.5, size: [0.6, 1.0, 0.6], shape: 'box' },
};
/** Ύψος όδευσης καλωδίων στην 3D (κοντά στο ταβάνι, όπως σε ψευδοροφή/κανάλι). */
export const CABLE_RUN_M = 2.65;

export const CABLE_META: Record<CableKind, { label: string; color: string; spec: string; help: string }> = {
  power: { label: 'Καλώδιο ρεύματος', color: '#EF4444', spec: 'NYM 3×2,5', help: 'Από τον πίνακα ως τις πρίζες/φωτιστικά (και από συσκευή σε συσκευή)· κλικ στις γωνίες, διπλό κλικ τελειώνει.' },
  network: { label: 'Καλώδιο δικτύου', color: '#3B82F6', spec: 'Cat6 UTP', help: 'Από τη συσκευή ως το rack· κλικ στις γωνίες, διπλό κλικ τελειώνει (κουμπώνει σε συσκευές).' },
};

const pt = z.object({ x: z.number().finite(), y: z.number().finite() });
const txt = (n: number) => z.string().max(n).default('');

export const planDevice = z.object({
  id: z.string().min(1).max(64), kind: z.enum(DEVICE_KINDS), x: z.number().finite(), y: z.number().finite(),
  label: txt(120), brand: txt(80), model: txt(120), ip: txt(64), mac: txt(64), serial: txt(80), notes: txt(1000),
  /** Κάμερα: κατεύθυνση σε μοίρες (0 = δεξιά, 90 = κάτω — άξονες εικόνας) και γωνία λήψης. */
  angle: z.number().finite().default(0), fov: z.number().finite().min(5).max(360).default(90),
  /** Κάμερα / AP: εμβέλεια σε μέτρα. */
  rangeM: z.number().finite().min(0).max(500).default(0),
  /** Rack: θύρες patch panel · Πίνακας: θέσεις ασφαλειών. */
  ports: z.number().int().min(0).max(1000).default(24),
  photoFileIds: z.array(z.string().min(1).max(64)).max(8).default([]),
});
export type PlanDevice = z.infer<typeof planDevice>;

export const planCable = z.object({
  id: z.string().min(1).max(64), kind: z.enum(CABLE_KINDS), pts: z.array(pt).min(2).max(500),
  from: z.string().max(64).nullable().default(null), to: z.string().max(64).nullable().default(null),
  spec: txt(80), notes: txt(500),
});
export type PlanCable = z.infer<typeof planCable>;

export function newDevice(id: string, kind: DeviceKind, p: Pt, n: number): PlanDevice {
  const m = DEVICE_META[kind];
  return planDevice.parse({ id, kind, x: p.x, y: p.y, label: `${m.short} ${n}`, rangeM: m.rangeM ?? 0, fov: m.fov ?? 90, ports: kind === 'panel' ? 12 : 24 });
}

/** Συσκευές που φτάνουν στον πίνακα μέσω καλωδίων ρεύματος (κύκλωμα: πίνακας → πρίζα → πρίζα …). */
export function poweredIds(devices: PlanDevice[], cables: PlanCable[]): Set<string> {
  const adj = new Map<string, string[]>();
  for (const c of cables) {
    if (c.kind !== 'power' || !c.from || !c.to) continue;
    adj.set(c.from, [...(adj.get(c.from) ?? []), c.to]);
    adj.set(c.to, [...(adj.get(c.to) ?? []), c.from]);
  }
  const seen = new Set<string>();
  const queue = devices.filter((d) => d.kind === 'panel').map((d) => d.id);
  while (queue.length) { const id = queue.pop()!; if (seen.has(id)) continue; seen.add(id); queue.push(...(adj.get(id) ?? [])); }
  return seen;
}

/** Η πλησιέστερη συσκευή μέσα στην ανοχή (για «κούμπωμα» των άκρων καλωδίου). */
export function nearestDevice(p: Pt, devices: PlanDevice[], tol: number): PlanDevice | null {
  let best: PlanDevice | null = null, bd = tol;
  for (const d of devices) { const v = Math.hypot(p.x - d.x, p.y - d.y); if (v <= bd) { bd = v; best = d; } }
  return best;
}

export const polyLength = (pts: Pt[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);

/** Κορυφές του «κώνου» λήψης κάμερας (σε px εικόνας) για σχεδίαση. */
export function cameraWedge(d: Pick<PlanDevice, 'x' | 'y' | 'angle' | 'fov'>, rangePx: number, steps = 24): Pt[] {
  const a0 = ((d.angle - d.fov / 2) * Math.PI) / 180, a1 = ((d.angle + d.fov / 2) * Math.PI) / 180;
  const arc = Array.from({ length: steps + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / steps; return { x: d.x + Math.cos(a) * rangePx, y: d.y + Math.sin(a) * rangePx }; });
  return d.fov >= 360 ? arc : [{ x: d.x, y: d.y }, ...arc];
}

export const angleTo = (from: Pt, to: Pt) => Math.round(((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI + 360) % 360);

export type NetworkSummary = {
  counts: Record<DeviceKind, number>;
  powerM: number | null; networkM: number | null;
  racks: Array<{ id: string; label: string; ports: number; used: number }>;
  panels: Array<{ id: string; label: string; ports: number; circuits: number }>;
  warnings: string[];
};

/** Σύνοψη για τον τεχνικό/προσφορά: πλήθη, μέτρα καλωδίων (με 10% περιθώριο), θύρες rack, ελλείψεις. */
export function networkSummary(devices: PlanDevice[], cables: PlanCable[], mPerPx: number | null): NetworkSummary {
  const counts = Object.fromEntries(DEVICE_KINDS.map((k) => [k, devices.filter((d) => d.kind === k).length])) as Record<DeviceKind, number>;
  const byId = new Map(devices.map((d) => [d.id, d]));
  const meters = (k: CableKind) => (mPerPx ? Math.round(cables.filter((c) => c.kind === k).reduce((s, c) => s + polyLength(c.pts), 0) * mPerPx * 1.1 * 10) / 10 : null);
  const isRack = (id: string | null) => !!id && byId.get(id)?.kind === 'rack';
  const net = cables.filter((c) => c.kind === 'network');
  const racks = devices.filter((d) => d.kind === 'rack').map((r) => ({ id: r.id, label: r.label || 'Rack', ports: r.ports, used: net.filter((c) => c.from === r.id || c.to === r.id).length }));
  const warnings: string[] = [];
  if (net.length && !counts.rack) warnings.push('Υπάρχουν καλώδια δικτύου αλλά κανένα rack — πρόσθεσε rack.');
  for (const c of net) if (!isRack(c.from) && !isRack(c.to)) warnings.push(`Καλώδιο δικτύου ${cables.indexOf(c) + 1} δεν τερματίζει σε rack.`);
  for (const d of devices) {
    if (!DEVICE_META[d.kind].needsNetwork) continue;
    const linked = net.some((c) => (c.from === d.id && isRack(c.to)) || (c.to === d.id && isRack(c.from)));
    if (!linked) warnings.push(`${d.label || DEVICE_META[d.kind].short}: χωρίς καλώδιο δικτύου ως το rack.`);
  }
  for (const r of racks) if (r.used > r.ports) warnings.push(`${r.label}: ${r.used} καλώδια σε ${r.ports} θύρες — χρειάζεται μεγαλύτερο patch panel.`);
  // Ρεύμα: κάθε κύκλωμα ξεκινά από τον πίνακα· οι συσκευές αρκεί να φτάνουν εκεί.
  const power = cables.filter((c) => c.kind === 'power');
  const panels = devices.filter((d) => d.kind === 'panel').map((p) => ({ id: p.id, label: p.label || 'Πίνακας', ports: p.ports, circuits: power.filter((c) => c.from === p.id || c.to === p.id).length }));
  const powered = poweredIds(devices, cables);
  if (power.length && !counts.panel) warnings.push('Υπάρχουν καλώδια ρεύματος αλλά κανένας ηλεκτρικός πίνακας — πρόσθεσε πίνακα.');
  for (const d of devices) if (DEVICE_META[d.kind].needsPower && counts.panel && !powered.has(d.id)) warnings.push(`${d.label || DEVICE_META[d.kind].short}: δεν φτάνει στον πίνακα με καλώδιο ρεύματος.`);
  for (const p of panels) if (p.circuits > p.ports) warnings.push(`${p.label}: ${p.circuits} κυκλώματα σε ${p.ports} θέσεις.`);
  return { counts, powerM: meters('power'), networkM: meters('network'), racks, panels, warnings };
}

/** Γραμμή προσφοράς από ηλεκτρολογικά/δίκτυο. Το `key` (σταθερό) μπαίνει ως `roomId` «net:…» ώστε το ξανα-«Εφαρμογή»
 *  να αντικαθιστά τις ίδιες γραμμές κρατώντας τιμές/εκπτώσεις που έβαλε ο χρήστης. */
export type NetworkLine = { key: string; kind: 'MATERIAL' | 'SERVICE'; name: string; unit: string; qty: number; notes: string };

const slug = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
/** Σύντομο σταθερό κλειδί (≤ 64 χαρακτήρες για το `roomId`). */
function keyOf(parts: string[]): string {
  const raw = parts.map(slug).join('|');
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) { h ^= raw.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `net:${parts[0]}:${(h >>> 0).toString(36)}`;
}
export const isNetworkKey = (roomId: string | null | undefined) => !!roomId && roomId.startsWith('net:');

/**
 * Συσκευές ομαδοποιημένες ανά είδος + μάρκα + μοντέλο (τεμάχια), καλώδια ανά είδος + τύπο (μέτρα με 10% περιθώριο,
 * μόνο με κλίμακα) και δύο εργασίες: σύνδεση σημείων ρεύματος και δικτύου. Τιμές δεν μπαίνουν — τις βάζει ο χρήστης.
 */
export function networkLines(devices: PlanDevice[], cables: PlanCable[], mPerPx: number | null): { lines: NetworkLine[]; noScale: boolean } {
  const lines: NetworkLine[] = [];
  const groups = new Map<string, { d: PlanDevice; labels: string[] }>();
  for (const d of devices) {
    const k = keyOf(['dev', d.kind, d.brand, d.model]);
    const g = groups.get(k);
    if (g) g.labels.push(d.label); else groups.set(k, { d, labels: [d.label] });
  }
  for (const k of DEVICE_KINDS) {
    for (const [key, { d, labels }] of groups) {
      if (d.kind !== k) continue;
      const bm = [d.brand, d.model].map((x) => x.trim()).filter(Boolean).join(' ');
      lines.push({ key, kind: 'MATERIAL', name: `${DEVICE_META[k].label}${bm ? ` — ${bm}` : ''}`, unit: 'τεμ.', qty: labels.length, notes: `Κάτοψη: ${labels.filter(Boolean).join(', ')}`.slice(0, 500) });
    }
  }
  const noScale = !mPerPx && cables.length > 0;
  if (mPerPx) {
    const byType = new Map<string, { kind: CableKind; spec: string; px: number; n: number }>();
    for (const c of cables) {
      const spec = c.spec.trim() || CABLE_META[c.kind].spec;
      const key = keyOf(['cable', c.kind, spec]);
      const g = byType.get(key) ?? { kind: c.kind, spec, px: 0, n: 0 };
      g.px += polyLength(c.pts); g.n += 1;
      byType.set(key, g);
    }
    for (const [key, g] of byType) {
      const m = Math.round(g.px * mPerPx * 1.1 * 10) / 10;
      if (m > 0) lines.push({ key, kind: 'MATERIAL', name: `${CABLE_META[g.kind].label} ${g.spec}`, unit: 'm', qty: m, notes: `Κάτοψη: ${g.n} ${g.n === 1 ? 'διαδρομή' : 'διαδρομές'} · +10% περιθώριο` });
    }
  }
  const points = (grp: DeviceGroup, skip: DeviceKind) => devices.filter((d) => DEVICE_META[d.kind].group === grp && d.kind !== skip).length;
  const el = points('electrical', 'panel'), net = points('network', 'rack');
  if (el) lines.push({ key: 'net:svc:electrical', kind: 'SERVICE', name: 'Εγκατάσταση & σύνδεση σημείων ρεύματος', unit: 'σημεία', qty: el, notes: 'Κάτοψη: πρίζες, φωτιστικά, διακόπτες' });
  if (net) lines.push({ key: 'net:svc:network', kind: 'SERVICE', name: 'Όδευση, τερματισμός & έλεγχος σημείων δικτύου', unit: 'σημεία', qty: net, notes: 'Κάτοψη: RJ45, κάμερες, access points ως το rack' });
  return { lines, noScale };
}
