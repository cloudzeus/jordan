'use client';

import type { RoomInput, RoomView } from '@/lib/project-rooms-core';

/** Ειδοποίηση ότι άλλαξαν οι χώροι ενός έργου (π.χ. αποθήκευση από τη διαστασιολόγηση κάτοψης). */
export const ROOMS_EVENT = 'project-rooms-changed';
export const emitRoomsChanged = (prjc: number) => window.dispatchEvent(new CustomEvent(ROOMS_EVENT, { detail: { prjc } }));

export const toInput = (r: Omit<RoomView, 'prjc' | 'sortOrder' | 'updatedAt' | 'id'> & { id?: string | null }): RoomInput => ({
  id: r.id ?? null, name: r.name.trim() || 'Χώρος', areaM2: Math.max(0, r.areaM2), perimeterM: r.perimeterM ?? null,
  finish: r.finish, mtrl: r.mtrl, itemCode: r.itemCode, itemName: r.itemName, itemUnit: r.itemUnit,
  wastePct: r.wastePct, skirting: r.skirting, pattern: r.pattern, notes: r.notes, source: r.source === 'floorplan' ? 'floorplan' : 'manual',
});

async function call(prjc: number, method: 'GET' | 'PUT', rooms?: RoomInput[]): Promise<RoomView[]> {
  const res = await fetch(`/api/admin/projects/${prjc}/rooms`, {
    method, cache: 'no-store',
    ...(rooms ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rooms }) } : {}),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.message ?? 'Η αποθήκευση των χώρων απέτυχε.');
  return d.rooms as RoomView[];
}
export const fetchRooms = (prjc: number) => call(prjc, 'GET');
export const putRooms = (prjc: number, rooms: RoomInput[]) => call(prjc, 'PUT', rooms);

/**
 * Συγχώνευση χώρων από άλλη πηγή (διαστασιολόγηση): όσοι έχουν ήδη `dbId` ενημερώνονται, οι νέοι
 * προστίθενται στο τέλος, οι υπόλοιποι χώροι του έργου μένουν ανέγγιχτοι. Επιστρέφει τα νέα id με
 * τη σειρά των `incoming`.
 */
export async function mergeRooms(prjc: number, incoming: Array<RoomInput & { dbId?: string | null }>): Promise<{ rooms: RoomView[]; ids: string[] }> {
  const cur = await fetchRooms(prjc);
  const byDb = new Map(incoming.filter((r) => r.dbId).map((r) => [r.dbId!, r]));
  const kept = cur.map((r) => { const u = byDb.get(r.id); return u ? { ...u, id: r.id } : toInput(r); });
  const known = new Set(cur.map((r) => r.id));
  const fresh = incoming.filter((r) => !r.dbId || !known.has(r.dbId));
  const saved = await putRooms(prjc, [...kept, ...fresh.map((r) => ({ ...r, id: null }))]);
  const tail = saved.slice(saved.length - fresh.length);
  let k = 0;
  const ids = incoming.map((r) => (r.dbId && known.has(r.dbId) ? r.dbId : tail[k++]?.id ?? ''));
  emitRoomsChanged(prjc);
  return { rooms: saved, ids };
}
