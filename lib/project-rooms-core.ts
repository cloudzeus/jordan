// lib/project-rooms-core.ts — ΚΑΘΑΡΟ (client + server). Χώροι έργου με τελικό δάπεδο: τύποι δαπέδου,
// ποσότητες (φύρα, σοβατεπί) και συγκέντρωση ανά υλικό για προσφορά, προδιαγραφές και εργολάβο.
import { z } from 'zod';

export type FinishKey = 'TILE' | 'STONE' | 'SCREED' | 'OTHER';

export type FinishMeta = {
  key: FinishKey;
  label: string;
  /** Ομάδα ειδών (lib/item-groups.ts) για φιλτράρισμα της αναζήτησης. */
  group: string | null;
  /** Hex (inline style — όχι δυναμικές κλάσεις Tailwind). */
  color: string;
  soft: string;
  /** Προτεινόμενη φύρα %. */
  waste: number;
  /** Υπόδειξη για το πεδίο «Διάταξη / φινίρισμα». */
  patternHint: string;
  /** Σοβατεπί έχει νόημα (στην τσιμεντοκονία συνήθως όχι). */
  skirting: boolean;
};

export const FINISHES: FinishMeta[] = [
  { key: 'TILE', label: 'Πλακάκι', group: 'G_TILES', color: '#0E7490', soft: '#CFFAFE', waste: 10, patternHint: 'π.χ. 60×60, ευθεία, αρμός 2 mm, ανθρακί αρμόστοκος', skirting: true },
  { key: 'STONE', label: 'Πέτρα', group: 'G_STONE', color: '#A16207', soft: '#FEF3C7', waste: 12, patternHint: 'π.χ. travertino 40×60 ρωμαϊκό, πάχος 2 cm, γεμισμένο-λειασμένο', skirting: true },
  { key: 'SCREED', label: 'Τσιμεντοκονία', group: 'G_CEMENT', color: '#475569', soft: '#E2E8F0', waste: 5, patternHint: 'π.χ. πατητή 3 mm, απόχρωση γκρι ανοιχτό, ματ βερνίκι', skirting: false },
  { key: 'OTHER', label: 'Άλλο', group: null, color: '#7C3AED', soft: '#EDE9FE', waste: 10, patternHint: 'π.χ. ξύλινο δάπεδο, μοκέτα…', skirting: true },
];
export const FINISH_BY_KEY = new Map(FINISHES.map((f) => [f.key, f]));
export const finishLabel = (k: string | null | undefined) => (k ? FINISH_BY_KEY.get(k as FinishKey)?.label ?? k : 'Χωρίς υλικό');

export const roomInput = z.object({
  id: z.string().max(40).nullable().optional(),
  name: z.string().trim().min(1, 'Όνομα χώρου').max(120),
  areaM2: z.number().finite().min(0).max(100000),
  perimeterM: z.number().finite().min(0).max(100000).nullable().optional(),
  finish: z.enum(['TILE', 'STONE', 'SCREED', 'OTHER']).nullable().optional(),
  mtrl: z.number().int().positive().nullable().optional(),
  itemCode: z.string().trim().max(60).nullable().optional(),
  itemName: z.string().trim().max(300).nullable().optional(),
  itemUnit: z.string().trim().max(30).nullable().optional(),
  wastePct: z.number().finite().min(0).max(100).default(10),
  skirting: z.boolean().default(false),
  pattern: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  source: z.enum(['floorplan', 'manual']).default('manual'),
});
export type RoomInput = z.infer<typeof roomInput>;

export type RoomView = {
  id: string; prjc: number; name: string; areaM2: number; perimeterM: number | null;
  finish: FinishKey | null; mtrl: number | null; itemCode: string | null; itemName: string | null; itemUnit: string | null;
  wastePct: number; skirting: boolean; pattern: string | null; notes: string | null; source: string; sortOrder: number;
  /** Μικρογραφία του είδους (ItemMedia), αν υπάρχει. */
  thumbUrl?: string | null;
  updatedAt: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Ποσότητα παραγγελίας δαπέδου (m²) = καθαρό εμβαδό × (1 + φύρα). */
export const orderArea = (r: Pick<RoomView, 'areaM2' | 'wastePct'>) => r2(r.areaM2 * (1 + (r.wastePct || 0) / 100));
/** Σοβατεπί (m) = περίμετρος, αν ζητήθηκε. */
export const skirtingLength = (r: Pick<RoomView, 'perimeterM' | 'skirting'>) => (r.skirting && r.perimeterM ? r2(r.perimeterM) : 0);

export type MaterialNeed = {
  key: string;
  finish: FinishKey | null;
  mtrl: number | null;
  code: string | null;
  name: string;
  unit: string | null;
  /** Καθαρό εμβαδό όλων των χώρων με αυτό το υλικό. */
  netM2: number;
  /** Με τη φύρα κάθε χώρου. */
  orderM2: number;
  skirtingM: number;
  rooms: string[];
};

/** Συγκέντρωση ανά υλικό (ίδιο MTRL, αλλιώς ίδιος τύπος + όνομα). Χώροι χωρίς υλικό μένουν έξω. */
export function materialNeeds(rooms: RoomView[]): MaterialNeed[] {
  const out = new Map<string, MaterialNeed>();
  for (const r of rooms) {
    if (!r.finish && !r.mtrl) continue;
    const key = r.mtrl ? `m:${r.mtrl}` : `f:${r.finish}:${(r.itemName ?? '').toLowerCase()}`;
    const name = r.itemName || `${finishLabel(r.finish)} δαπέδου`;
    const n = out.get(key) ?? { key, finish: r.finish, mtrl: r.mtrl, code: r.itemCode, name, unit: r.itemUnit, netM2: 0, orderM2: 0, skirtingM: 0, rooms: [] };
    n.netM2 = r2(n.netM2 + r.areaM2);
    n.orderM2 = r2(n.orderM2 + orderArea(r));
    n.skirtingM = r2(n.skirtingM + skirtingLength(r));
    n.rooms.push(r.name);
    out.set(key, n);
  }
  return [...out.values()];
}

const nf = (v: number) => v.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number) => v.toLocaleString('el-GR', { maximumFractionDigits: 1 });

/** Μία γραμμή περιγραφής χώρου (prompt AI, προδιαγραφές). */
export function roomLine(r: RoomView): string {
  const item = r.itemName ? `${r.itemCode ? `${r.itemCode} · ` : ''}${r.itemName}` : null;
  return [
    `${r.name} — ${nf(r.areaM2)} m²`,
    `${finishLabel(r.finish)}${item ? `: ${item}` : ''}`,
    r.pattern,
    r.finish ? `φύρα ${pct(r.wastePct)}% → ${nf(orderArea(r))} m²` : null,
    skirtingLength(r) ? `σοβατεπί ${nf(skirtingLength(r))} m` : null,
    r.notes,
  ].filter(Boolean).join(' · ');
}

/** Γραμμές υλικών για προσφορά/σύμβαση: δάπεδο (m² με φύρα) + σοβατεπί (m), ανά υλικό. */
export function contractLinesFromRooms(rooms: RoomView[]): Array<{ kind: 'MATERIAL'; mtrl: number | null; code: string | null; name: string; unit: string; qty: number; notes: string }> {
  const lines: Array<{ kind: 'MATERIAL'; mtrl: number | null; code: string | null; name: string; unit: string; qty: number; notes: string }> = [];
  for (const n of materialNeeds(rooms)) {
    const unitNote = n.unit && !/m²|m2|τ\.?μ/i.test(n.unit) ? ` · μονάδα είδους: ${n.unit} — έλεγξε τη μετατροπή` : '';
    lines.push({ kind: 'MATERIAL', mtrl: n.mtrl, code: n.code, name: n.name, unit: 'm²', qty: n.orderM2, notes: `Χώροι: ${n.rooms.join(', ')} · καθαρά ${nf(n.netM2)} m² + φύρα${unitNote}` });
    if (n.skirtingM) lines.push({ kind: 'MATERIAL', mtrl: n.mtrl, code: n.code, name: `Σοβατεπί — ${n.name}`, unit: 'm', qty: n.skirtingM, notes: `Περίμετρος χώρων: ${n.rooms.join(', ')}` });
  }
  return lines;
}
