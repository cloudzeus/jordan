// lib/contracts/options.ts — SERVER. Εναλλακτικές επιλογές υλικών (A/B) ανά χώρο ή εργασία: προβολή για
// την πύλη και η επιλογή του πελάτη. Λογική/κανόνες στο `options-core.ts` (καθαρό).
import 'server-only';
import { prisma } from '@/lib/db';
import { eur, lineNet } from './core';
import { ContractError, optionChoicesOf } from './service';
import { logContractEvent } from './history';
import { getFloorPlan } from '@/lib/floorplan/plans';
import { groupRoomId, lineGroupLabel, optionGroups, type OptionChoices, type OptionKey } from './options-core';

type OptLine = { id: string; kind: string; name: string; qty: number; unit: string | null; unitPrice: number; discount: number; optionGroup: string | null; option: string | null };
export type OptionSide = { title: string; net: number; lines: { id: string; name: string; qty: number; unit: string | null; net: number }[] };
export type OptionView = { key: string; label: string; chosen: OptionKey; a: OptionSide; b: OptionSide };

/** Οι ομάδες εναλλακτικών με όνομα (χώρος της κάτοψης ή η εργασία) και τις δύο πλευρές τους. */
export async function optionsView(c: { floorPlanId: string | null; optionChoices: unknown }, lines: OptLine[]): Promise<OptionView[]> {
  const groups = optionGroups(lines, optionChoicesOf(c.optionChoices));
  if (!groups.length) return [];
  const plan = c.floorPlanId && groups.some((g) => groupRoomId(g.key)) ? await getFloorPlan(c.floorPlanId).catch(() => null) : null;
  const roomName = new Map((plan?.data.rooms ?? []).map((r) => [r.id, r.name.trim() || 'Χώρος']));
  const side = (ls: OptLine[], net: number): OptionSide => ({
    // Τίτλος = το υλικό της επιλογής (όχι η εργασία τοποθέτησης), αλλιώς η πρώτη γραμμή.
    title: (ls.find((l) => l.kind === 'MATERIAL') ?? ls[0])?.name ?? '',
    net, lines: ls.map((l) => ({ id: l.id, name: l.name, qty: l.qty, unit: l.unit, net: lineNet(l) })),
  });
  return groups.map((g) => {
    const rid = groupRoomId(g.key);
    return { key: g.key, label: rid ? roomName.get(rid) ?? 'Χώρος' : lineGroupLabel(g.a[0]), chosen: g.chosen, a: side(g.a, g.netA), b: side(g.b, g.netB) };
  });
}

/**
 * Ορίζει την επιλογή μιας ομάδας: αλλάζει `Contract.optionChoices` και ποιες γραμμές μετράνε (`inactive`).
 * Καταγράφεται στο ιστορικό (ορατό και στον πελάτη).
 */
export async function setOptionChoice(contractId: string, group: string, option: OptionKey, actor: { kind: 'STAFF' | 'CUSTOMER'; id: string; name: string | null }) {
  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { optionChoices: true, floorPlanId: true, lines: { where: { optionGroup: group }, select: { id: true, kind: true, name: true, qty: true, unit: true, unitPrice: true, discount: true, optionGroup: true, option: true } } },
  });
  if (!c) throw new ContractError('Η προσφορά δεν βρέθηκε', 404);
  const [view] = await optionsView(c, c.lines);
  if (!view) throw new ContractError('Η επιλογή δεν υπάρχει πλέον σε αυτή την προσφορά — ανανεώστε τη σελίδα', 409);
  const choices: OptionChoices = { ...optionChoicesOf(c.optionChoices), [group]: option };
  if (option === 'A') delete choices[group];
  await prisma.$transaction([
    prisma.contract.update({ where: { id: contractId }, data: { optionChoices: choices } }),
    prisma.contractLine.updateMany({ where: { contractId, optionGroup: group, option }, data: { inactive: false } }),
    prisma.contractLine.updateMany({ where: { contractId, optionGroup: group, option: option === 'A' ? 'B' : 'A' }, data: { inactive: true } }),
  ]);
  if (view.chosen !== option) {
    const picked = option === 'A' ? view.a : view.b;
    const diff = view.b.net - view.a.net;
    await logContractEvent(contractId, {
      type: 'OPTION_CHOSEN', actor, customer: true,
      summary: `${view.label}: επιλογή ${option === 'A' ? 'Α' : 'Β'} — ${picked.title}${diff ? ` (η Β ${diff > 0 ? '+' : '−'}${eur(Math.abs(diff))} καθαρά)` : ''}`,
    });
  }
}
