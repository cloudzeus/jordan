// lib/contracts/options-core.ts — ΚΑΘΑΡΟ (client + server). Εναλλακτικές επιλογές υλικών στην προσφορά:
// ανά χώρο της κάτοψης («room:<roomId>», π.χ. μάρμαρο ή γρανίτης) ή ανά εργασία/γραμμή («line:<key>»),
// δύο επιλογές A/B. Ο πελάτης διαλέγει μία ανά ομάδα στην πύλη (ή το προσωπικό στη φόρμα)· στα σύνολα,
// στο PDF, στον προϋπολογισμό και στο έργο μετράει ΜΟΝΟ η επιλεγμένη. Χωρίς επιλογή ισχύει η A.
import { z } from 'zod';
import { lineNet } from './core';

export const OPTION_KEYS = ['A', 'B'] as const;
export type OptionKey = (typeof OPTION_KEYS)[number];
export type OptionChoices = Record<string, OptionKey>;

export const optionKey = z.enum(OPTION_KEYS);
export const optionChoices = z.record(z.string().min(1).max(80), optionKey).catch({});

export const roomGroup = (roomId: string) => `room:${roomId}`;
export const lineGroup = (key: string) => `line:${key}`;
export const isRoomGroup = (g: string) => g.startsWith('room:');
export const groupRoomId = (g: string) => (isRoomGroup(g) ? g.slice(5) : null);

type OptLine = { optionGroup?: string | null; option?: string | null };

/** Η επιλογή της ομάδας (λείπει ή άκυρη ⇒ A). */
export const chosenOf = (choices: OptionChoices | null | undefined, group: string): OptionKey => (choices?.[group] === 'B' ? 'B' : 'A');

/** Μετράει η γραμμή; Χωρίς ομάδα πάντα· σε ομάδα μόνο αν είναι η επιλεγμένη. */
export function isActive(l: OptLine, choices: OptionChoices | null | undefined): boolean {
  if (!l.optionGroup || !l.option) return true;
  return chosenOf(choices, l.optionGroup) === l.option;
}

/** Όνομα ομάδας γραμμής (όχι χώρου): τι είναι και πόσο — οι δύο επιλογές φαίνονται χωριστά. */
export function lineGroupLabel(l: { kind: string; qty: number; unit: string | null } | undefined): string {
  if (!l) return 'Εργασία';
  return `${l.kind === 'SERVICE' ? 'Εργασία' : 'Υλικό'} · ${l.qty.toLocaleString('el-GR', { maximumFractionDigits: 2 })}${l.unit ? ` ${l.unit}` : ''}`;
}

export const activeLines = <T extends OptLine>(lines: T[], choices: OptionChoices | null | undefined): T[] => lines.filter((l) => isActive(l, choices));

/** Ομάδα με και τις δύο επιλογές· μια «μισή» ομάδα (μόνο A) δεν είναι πραγματική επιλογή. */
export type OptionGroup<T> = { key: string; chosen: OptionKey; a: T[]; b: T[]; netA: number; netB: number };

export function optionGroups<T extends OptLine & { qty: number; unitPrice: number; discount?: number | null }>(lines: T[], choices: OptionChoices | null | undefined): OptionGroup<T>[] {
  const by = new Map<string, { a: T[]; b: T[] }>();
  for (const l of lines) {
    if (!l.optionGroup || (l.option !== 'A' && l.option !== 'B')) continue;
    const g = by.get(l.optionGroup) ?? { a: [], b: [] };
    (l.option === 'A' ? g.a : g.b).push(l);
    by.set(l.optionGroup, g);
  }
  const net = (xs: T[]) => Math.round(xs.reduce((s, l) => s + lineNet(l), 0) * 100) / 100;
  return [...by].filter(([, g]) => g.a.length && g.b.length)
    .map(([key, g]) => ({ key, chosen: chosenOf(choices, key), a: g.a, b: g.b, netA: net(g.a), netB: net(g.b) }));
}

/**
 * Καθάρισμα πριν την αποθήκευση: (1) γραμμές «μισής» ομάδας γίνονται απλές (χωρίς επιλογή), (2) οι
 * επιλογές κρατούνται μόνο για ομάδες που υπάρχουν. Επιστρέφει γραμμές + επιλογές + `inactive` ανά γραμμή.
 */
export function normalizeOptions<T extends OptLine>(lines: T[], choices: OptionChoices | null | undefined): { lines: (T & { inactive: boolean })[]; choices: OptionChoices } {
  const has = new Map<string, Set<string>>();
  for (const l of lines) if (l.optionGroup && l.option) has.set(l.optionGroup, (has.get(l.optionGroup) ?? new Set()).add(l.option));
  const real = new Set([...has].filter(([, s]) => s.has('A') && s.has('B')).map(([g]) => g));
  const kept: OptionChoices = {};
  for (const g of real) if (choices?.[g] === 'B') kept[g] = 'B';
  return {
    choices: kept,
    lines: lines.map((l) => {
      const grouped = !!l.optionGroup && real.has(l.optionGroup);
      const x = grouped ? l : { ...l, optionGroup: null, option: null };
      return { ...x, inactive: !isActive(x, kept) };
    }),
  };
}
