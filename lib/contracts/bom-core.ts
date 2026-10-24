// lib/contracts/bom-core.ts — ΚΑΘΑΡΟ. BOM (λίστα υλικών) μιας προσφοράς/σύμβασης: ανάγκες ανά είδος και ανά χώρο
// της κάτοψης, απόθεμα, ποσότητα προς παραγγελία, και οι γραμμές που περνούν στον προϋπολογισμό του έργου.
import { stockNeeds, type StockInfo, type StockNeed } from './stock-core';

export type BomLine = {
  kind: 'MATERIAL' | 'SERVICE'; mtrl: number | null; code: string | null; name: string; unit: string | null;
  qty: number; unitPrice: number; discount?: number | null; roomId?: string | null; partyId?: string | null; crewFee?: number | null;
};
export type BomRoomRef = { id: string; name: string };

export type BomItem = StockNeed & {
  /** Ποσότητα ανά χώρο (roomId → ποσότητα)· «» = εκτός χώρου. */
  perRoom: Record<string, number>;
  /** Αξία πώλησης των γραμμών (με έκπτωση). */
  value: number;
};
export type BomRoom = {
  id: string; name: string;
  lines: { kind: 'MATERIAL' | 'SERVICE'; mtrl: number | null; code: string | null; name: string; unit: string | null; qty: number; value: number }[];
  materials: number; services: number;
};
export type Bom = {
  items: BomItem[];
  rooms: BomRoom[];
  /** Γραμμές υλικών χωρίς είδος μητρώου — δεν μετρούν απόθεμα ούτε περνούν στον προϋπολογισμό. */
  unlinked: { name: string; qty: number; unit: string | null }[];
  totals: { materials: number; services: number; toOrder: number; unknown: number };
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const net = (l: BomLine) => r2(l.qty * l.unitPrice * (1 - (l.discount ?? 0) / 100));
const NO_ROOM = '';

export function buildBom(lines: BomLine[], rooms: BomRoomRef[], stock: Record<number, StockInfo | undefined>): Bom {
  const names = new Map(rooms.map((r) => [r.id, r.name]));
  const roomOf = (l: BomLine) => (l.roomId && names.has(l.roomId) ? l.roomId : NO_ROOM);

  const needs = stockNeeds(lines, stock);
  const items: BomItem[] = needs.map((n) => ({ ...n, perRoom: {}, value: 0 }));
  const byMtrl = new Map(items.map((i) => [i.mtrl, i]));
  for (const l of lines) {
    if (l.kind !== 'MATERIAL' || l.mtrl == null || !(l.qty > 0)) continue;
    const it = byMtrl.get(l.mtrl);
    if (!it) continue;
    const k = roomOf(l);
    it.perRoom[k] = r3((it.perRoom[k] ?? 0) + l.qty);
    it.value = r2(it.value + net(l));
  }

  const roomMap = new Map<string, BomRoom>();
  const order = [...rooms.map((r) => r.id), NO_ROOM];
  for (const id of order) roomMap.set(id, { id, name: id === NO_ROOM ? 'Γενικά (εκτός χώρου)' : names.get(id)!, lines: [], materials: 0, services: 0 });
  for (const l of lines) {
    if (!(l.qty > 0)) continue;
    const r = roomMap.get(roomOf(l))!;
    const v = net(l);
    r.lines.push({ kind: l.kind, mtrl: l.mtrl, code: l.code, name: l.name, unit: l.unit, qty: r3(l.qty), value: v });
    if (l.kind === 'MATERIAL') r.materials = r2(r.materials + v); else r.services = r2(r.services + v);
  }

  const unlinked = lines.filter((l) => l.kind === 'MATERIAL' && l.mtrl == null && l.qty > 0).map((l) => ({ name: l.name, qty: l.qty, unit: l.unit }));
  const valid = lines.filter((l) => l.qty > 0);
  return {
    items: items.sort((a, b) => a.name.localeCompare(b.name, 'el')),
    rooms: order.map((id) => roomMap.get(id)!).filter((r) => r.lines.length > 0),
    unlinked,
    totals: {
      materials: r2(valid.filter((l) => l.kind === 'MATERIAL').reduce((t, l) => t + net(l), 0)),
      services: r2(valid.filter((l) => l.kind === 'SERVICE').reduce((t, l) => t + net(l), 0)),
      toOrder: items.filter((i) => i.short > 0).length,
      unknown: items.filter((i) => i.status === 'unknown').length,
    },
  };
}

const csvCell = (v: string | number | null | undefined) => {
  const s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : v;
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV (;) για Excel: ένα είδος ανά γραμμή, με στήλη ανά χώρο και ανάγκη/απόθεμα/παραγγελία. */
export function bomCsv(bom: Bom, rooms: BomRoomRef[]): string {
  const used = rooms.filter((r) => bom.items.some((i) => i.perRoom[r.id]));
  const extra = bom.items.some((i) => i.perRoom[NO_ROOM]);
  const head = ['Κωδικός', 'Είδος', 'Μονάδα', ...used.map((r) => r.name), ...(extra ? ['Γενικά'] : []), 'Σύνολο', 'Απόθεμα', 'Μονάδα αποθήκης', 'Προς παραγγελία', 'Αξία'];
  const rows = bom.items.map((i) => [
    i.code, i.name, i.unit, ...used.map((r) => i.perRoom[r.id] ?? 0), ...(extra ? [i.perRoom[NO_ROOM] ?? 0] : []),
    i.need, i.stockUnit != null ? i.have : null, i.stockUnit, i.status === 'unknown' ? null : i.short, i.value,
  ]);
  for (const u of bom.unlinked) rows.push([null, `${u.name} (χωρίς είδος μητρώου)`, u.unit, ...used.map(() => null), ...(extra ? [null] : []), u.qty, null, null, null, null]);
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}

export type BudgetDraft = { mtrl: number; code: string; name: string; isService: boolean; unit: string | null; qty: number; unitPrice: number; notes: string };

/**
 * Γραμμές προϋπολογισμού έργου από τις γραμμές της σύμβασης. Ο προϋπολογισμός κρατά ΚΟΣΤΟΣ: υλικά με την
 * τελευταία τιμή αγοράς (αλλιώς την τιμή της προσφοράς), εργασίες συνεργείου με την αμοιβή τους ανά μονάδα.
 * Ίδιο είδος στον ίδιο χώρο ενώνεται. Γραμμές χωρίς είδος μητρώου επιστρέφονται ως `skipped`.
 */
export function budgetDrafts(lines: BomLine[], rooms: BomRoomRef[], lastCost: Map<number, number>, contractLabel: string): { drafts: BudgetDraft[]; skipped: string[] } {
  const names = new Map(rooms.map((r) => [r.id, r.name]));
  const by = new Map<string, BudgetDraft & { cost: number }>();
  const skipped: string[] = [];
  for (const l of lines) {
    if (!(l.qty > 0)) continue;
    if (l.mtrl == null) { skipped.push(l.name); continue; }
    const room = l.roomId ? names.get(l.roomId) ?? null : null;
    const isService = l.kind === 'SERVICE';
    const sale = l.unitPrice * (1 - (l.discount ?? 0) / 100);
    const unitCost = isService
      ? (l.partyId && l.crewFee != null ? l.crewFee / l.qty : sale)
      : lastCost.get(l.mtrl) ?? sale;
    const key = `${l.mtrl}|${room ?? ''}|${l.unit ?? ''}`;
    const cur = by.get(key);
    if (cur) { cur.qty = r3(cur.qty + l.qty); cur.cost = r2(cur.cost + unitCost * l.qty); continue; }
    by.set(key, {
      mtrl: l.mtrl, code: l.code ?? '', name: l.name, isService, unit: l.unit, qty: r3(l.qty), unitPrice: 0, cost: r2(unitCost * l.qty),
      notes: `${contractLabel}${room ? ` · ${room}` : ''}`,
    });
  }
  const drafts = [...by.values()].map(({ cost, ...d }) => ({ ...d, unitPrice: d.qty > 0 ? Math.round((cost / d.qty) * 10000) / 10000 : 0 }));
  return { drafts, skipped };
}
