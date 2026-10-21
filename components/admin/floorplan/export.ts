'use client';

import { labelPoint, type Pt } from '@/lib/floorplan/core';

export type ExportRoom = {
  name: string; color: string; polygon: Pt[]; areaM2: number | null; perimeterM: number | null;
  /** Πλακάκι και στους τοίχους: καθαρά m², ύψος πλακιδίων και m² ανοιγμάτων (null = όχι). */
  walls?: { m2: number; heightM: number; openingsM2: number } | null;
};

const wallsTotal = (rooms: ExportRoom[]) => rooms.reduce((s, r) => s + (r.walls?.m2 ?? 0), 0);

const nf2 = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtM2 = (v: number) => `${nf2.format(v)} m²`;
export const fmtM = (v: number) => `${nf2.format(v)} m`;

/** CSV με «;» και BOM — ανοίγει σωστά με ελληνικά στο Excel. */
/** wallLenM: συνολικό μήκος τοίχων που σχεδίασε ο χρήστης (αξονικό), αν υπάρχουν. */
export function roomsCsv(rooms: ExportRoom[], wallLenM: number | null = null): Blob {
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = [['Χώρος', 'Εμβαδό δαπέδου (m²)', 'Περίμετρος (m)', 'Ύψος πλακιδίων τοίχων (m)', 'Ανοίγματα (m²)', 'Τοίχοι (m²)']];
  for (const r of rooms) {
    rows.push([
      r.name, r.areaM2 == null ? '' : nf2.format(r.areaM2), r.perimeterM == null ? '' : nf2.format(r.perimeterM),
      r.walls ? nf2.format(r.walls.heightM) : '', r.walls ? nf2.format(r.walls.openingsM2) : '', r.walls ? nf2.format(r.walls.m2) : '',
    ]);
  }
  const total = rooms.reduce((s, r) => s + (r.areaM2 ?? 0), 0);
  const walls = wallsTotal(rooms);
  rows.push(['Σύνολο', nf2.format(total), '', '', '', walls ? nf2.format(walls) : '']);
  if (walls) rows.push(['Δάπεδο + τοίχοι (m²)', nf2.format(total + walls), '', '', '', '']);
  if (wallLenM != null) rows.push(['Μήκος σχεδιασμένων τοίχων (m)', '', nf2.format(wallLenM), '', '', '']);
  return new Blob(['﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

export function roomsText(rooms: ExportRoom[], title: string, wallLenM: number | null = null): string {
  const total = rooms.reduce((s, r) => s + (r.areaM2 ?? 0), 0);
  const walls = wallsTotal(rooms);
  return [
    title,
    ...rooms.map((r) => `• ${r.name}: ${r.areaM2 == null ? '—' : fmtM2(r.areaM2)}${r.walls ? ` · τοίχοι ${fmtM2(r.walls.m2)} (ύψος ${fmtM(r.walls.heightM)})` : ''}`),
    `Σύνολο δαπέδου: ${fmtM2(total)}`,
    ...(walls ? [`Σύνολο τοίχων: ${fmtM2(walls)}`, `Δάπεδο + τοίχοι: ${fmtM2(total + walls)}`] : []),
    ...(wallLenM != null ? [`Μήκος τοίχων: ${fmtM(wallLenM)}`] : []),
  ].join('\n');
}

/**
 * Κάτοψη με σημειωμένους χώρους σε PNG (ανάλυση της εικόνας προβολής), με υπόμνημα στο κάτω μέρος.
 * Σχεδιάζεται απευθείας σε canvas 2D — ανεξάρτητα από τη θέση της κάμερας του three.js.
 */
export async function annotatedPng(o: {
  image: HTMLCanvasElement; w: number; h: number; rooms: ExportRoom[]; dividers: Array<[Pt, Pt]>; title: string; scaleNote: string;
  /** Τοίχοι που σχεδίασε ο χρήστης (πάχος t σε px ανάλυσης). */
  walls?: Array<{ a: Pt; b: Pt; t: number }>;
}): Promise<Blob> {
  const k = o.image.width / o.w;
  const lf = Math.max(14, Math.round(o.image.width / 80));
  const legendH = Math.round(lf * (4 + o.rooms.length * 1.3));
  const c = document.createElement('canvas');
  c.width = o.image.width; c.height = o.image.height + legendH;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(o.image, 0, 0);
  const fs = Math.max(14, Math.round(c.width / 90));
  g.strokeStyle = '#1E293B'; g.lineCap = 'square';
  for (const wl of o.walls ?? []) { g.lineWidth = wl.t * k; g.beginPath(); g.moveTo(wl.a.x * k, wl.a.y * k); g.lineTo(wl.b.x * k, wl.b.y * k); g.stroke(); }
  g.lineCap = 'butt';
  for (const r of o.rooms) {
    if (r.polygon.length < 3) continue;
    g.beginPath();
    r.polygon.forEach((p, i) => (i ? g.lineTo(p.x * k, p.y * k) : g.moveTo(p.x * k, p.y * k)));
    g.closePath();
    g.globalAlpha = 0.28; g.fillStyle = r.color; g.fill();
    g.globalAlpha = 1; g.lineWidth = Math.max(2, fs / 6); g.strokeStyle = r.color; g.stroke();
  }
  g.strokeStyle = '#F43F5E'; g.lineWidth = Math.max(2, fs / 6);
  for (const [a, b] of o.dividers) { g.beginPath(); g.moveTo(a.x * k, a.y * k); g.lineTo(b.x * k, b.y * k); g.stroke(); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const r of o.rooms) {
    if (r.polygon.length < 3) continue;
    const p = labelPoint(r.polygon);
    const l1 = r.name, l2 = r.areaM2 == null ? '' : fmtM2(r.areaM2);
    g.font = `600 ${fs}px ui-sans-serif, system-ui, sans-serif`;
    const tw = Math.max(g.measureText(l1).width, g.measureText(l2).width) + fs;
    const th = fs * (l2 ? 2.6 : 1.6);
    g.fillStyle = 'rgba(11,18,32,0.85)';
    g.beginPath(); g.roundRect(p.x * k - tw / 2, p.y * k - th / 2, tw, th, fs / 3); g.fill();
    g.fillStyle = '#fff';
    g.fillText(l1, p.x * k, p.y * k - (l2 ? fs * 0.55 : 0));
    if (l2) { g.font = `700 ${fs}px ui-monospace, monospace`; g.fillText(l2, p.x * k, p.y * k + fs * 0.65); }
  }
  // Υπόμνημα
  const y0 = o.image.height;
  g.fillStyle = '#0B1220'; g.fillRect(0, y0, c.width, legendH);
  g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillStyle = '#fff'; g.font = `700 ${lf}px ui-sans-serif, system-ui, sans-serif`;
  const total = o.rooms.reduce((s, r) => s + (r.areaM2 ?? 0), 0);
  const wallsM2 = wallsTotal(o.rooms);
  g.fillText(`${o.title} — Δάπεδο ${fmtM2(total)}${wallsM2 ? `  ·  Τοίχοι ${fmtM2(wallsM2)}` : ''}`, lf, y0 + lf * 0.6);
  g.font = `400 ${lf * 0.8}px ui-sans-serif, system-ui, sans-serif`;
  g.fillStyle = '#94A3B8';
  g.fillText(o.scaleNote, lf, y0 + lf * 2);
  o.rooms.forEach((r, i) => {
    const y = y0 + lf * (3.4 + i * 1.3);
    g.fillStyle = r.color; g.fillRect(lf, y, lf * 0.8, lf * 0.8);
    g.fillStyle = '#E2E8F0'; g.font = `500 ${lf * 0.85}px ui-sans-serif, system-ui, sans-serif`;
    g.fillText(`${r.name}  ·  ${r.areaM2 == null ? '—' : fmtM2(r.areaM2)}${r.perimeterM == null ? '' : `  ·  περίμετρος ${fmtM(r.perimeterM)}`}${r.walls ? `  ·  τοίχοι ${fmtM2(r.walls.m2)} (ύψος ${fmtM(r.walls.heightM)})` : ''}`, lf * 2.2, y);
  });
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG export failed'))), 'image/png'));
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
