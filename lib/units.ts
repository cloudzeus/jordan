import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { softoneCall, softoneGetTable, SoftoneError } from '@/lib/softone';

/**
 * Μονάδες μέτρησης — SoftOne `MTRUNIT` (EditMaster: μία εγγραφή ανά μονάδα).
 *
 * Επιβεβαιωμένο ζωντανά (atelier, 2026-10-17, μονάδα-δοκιμή 201 «ΔΟΚΙΜΗ CLAUDE 2», ανενεργή):
 *  - νέα: setData με ΡΗΤΟ `MTRUNIT`· ενημέρωση: μερική· οι υπόλοιπες μονάδες έμειναν ανέπαφες·
 *  - το GetTable ΚΡΥΒΕΙ τις ανενεργές· το MTRUNIT ΔΕΝ έχει στήλη CODE (το GetTable μετατοπίζει
 *    σιωπηλά τις στήλες αν ζητηθεί) — η σύντμηση είναι το `SHORTCUT`·
 *  - οι λίστες `$SODIM` / `$sUnitAADE` δεν δίνονται μέσω Web Services: η διάσταση μένει όπως είναι,
 *    και οι μονάδες myDATA είναι ο επίσημος πίνακας της ΑΑΔΕ (παρακάτω).
 */

/** Μονάδες μέτρησης myDATA (ΑΑΔΕ, «Είδος Ποσότητας»). */
export const MYDATA_UNITS: Record<number, string> = {
  1: 'Τεμάχια',
  2: 'Κιλά',
  3: 'Λίτρα',
  4: 'Μέτρα',
  5: 'Τετραγωνικά μέτρα',
  6: 'Κυβικά μέτρα',
  7: 'Τεμάχια (λοιπές περιπτώσεις)',
};

const FIELDS = ['MTRUNIT', 'SHORTCUT', 'NAME', 'INTERCODE', 'QDECIMALS', 'SODIM', 'SODIV', 'MYDATACODE'];

export class UnitError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

type S1Row = Record<string, unknown>;
const num = (v: unknown, d: number) => (v === '' || v == null || !Number.isFinite(Number(v)) ? d : Number(v));
const intOrNull = (v: unknown) => (v === '' || v == null || !Number.isInteger(Number(v)) ? null : Number(v));
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function fromS1(r: S1Row, isActive: boolean) {
  return {
    shortcut: str(r.SHORTCUT) ?? String(r.MTRUNIT), name: str(r.NAME) ?? str(r.SHORTCUT) ?? String(r.MTRUNIT),
    interCode: str(r.INTERCODE), decimals: num(r.QDECIMALS, 2), sodim: num(r.SODIM, 1), sodiv: num(r.SODIV, 1),
    myDataCode: intOrNull(r.MYDATACODE), isActive,
  };
}

/** Κρατά το μητρώο αναφοράς (SoftoneLookup MTRUNIT) — από εκεί διαβάζουν οι φόρμες ειδών. */
async function syncLookup(code: number, name: string, isActive: boolean) {
  const where = { kind_code: { kind: 'MTRUNIT', code: String(code) } };
  if (isActive) await prisma.softoneLookup.upsert({ where, create: { kind: 'MTRUNIT', code: String(code), name }, update: { name } });
  else await prisma.softoneLookup.deleteMany({ where: { kind: 'MTRUNIT', code: String(code) } });
}

async function readUnit(code: number): Promise<S1Row | null> {
  const res = await softoneCall<{ success?: boolean; error?: string; data?: Record<string, S1Row[]> }>('getData', { OBJECT: 'MTRUNIT', KEY: String(code) });
  if (res.success === false) throw new SoftoneError(res.error ?? `getData MTRUNIT ${code} απέτυχε`);
  const row = res.data?.MTRUNIT?.[0];
  return row && Number(row.MTRUNIT) === code ? row : null;
}

// ── Συγχρονισμός ────────────────────────────────────────────────────────────────────────────

export async function syncUnits() {
  const now = new Date();
  let created = 0;
  let updated = 0;
  const rows = await softoneGetTable('MTRUNIT', FIELDS, '1=1');
  for (const r of rows) {
    const code = Number(r.MTRUNIT);
    if (!Number.isInteger(code)) continue;
    const data = { ...fromS1(r, true), syncedAt: now };
    const prev = await prisma.softoneUnit.findUnique({ where: { code }, select: { id: true } });
    await prisma.softoneUnit.upsert({ where: { code }, create: { code, ...data }, update: data });
    if (prev) updated++; else created++;
  }
  const { count: deactivated } = await prisma.softoneUnit.updateMany({ where: { syncedAt: { lt: now }, isActive: true }, data: { isActive: false } });
  // Κρυφές ανενεργές μετά τη μεγαλύτερη γνωστή: getData στους επόμενους αριθμούς.
  const max = await prisma.softoneUnit.aggregate({ _max: { code: true } });
  for (let code = (max._max.code ?? 0) + 1, n = 0; n < 5; code++, n++) {
    const hidden = await readUnit(code).catch(() => null);
    if (!hidden) break;
    await prisma.softoneUnit.create({ data: { code, ...fromS1(hidden, String(hidden.ISACTIVE) === '1'), syncedAt: now } });
    created++;
  }
  usageCache = null;
  return { created, updated, deactivated };
}

// ── Χρήση σε είδη ──────────────────────────────────────────────────────────────────────────

type Usage = { mtrl: number; code: string; name: string; isService: boolean; roles: ('base' | 'buy' | 'sell')[] };
const USAGE_TTL_MS = 5 * 60_000;
let usageCache: { at: number; byUnit: Map<number, Usage[]> } | null = null;

/** Ενεργά είδη/υπηρεσίες ανά μονάδα (βασική, αγορών, πώλησης) — ζωντανά, κρατιούνται 5 λεπτά. */
export async function unitUsage(fresh = false): Promise<Map<number, Usage[]>> {
  if (!fresh && usageCache && Date.now() - usageCache.at < USAGE_TTL_MS) return usageCache.byUnit;
  const rows = await softoneGetTable('MTRL', ['MTRL', 'CODE', 'NAME', 'SODTYPE', 'MTRUNIT1', 'MTRUNIT3', 'MTRUNIT4'], 'SODTYPE IN (51,52)');
  const byUnit = new Map<number, Usage[]>();
  for (const r of rows) {
    const roles = new Map<number, Usage['roles']>();
    for (const [col, role] of [['MTRUNIT1', 'base'], ['MTRUNIT3', 'buy'], ['MTRUNIT4', 'sell']] as const) {
      const u = intOrNull(r[col]);
      if (u != null) roles.set(u, [...(roles.get(u) ?? []), role]);
    }
    for (const [u, rs] of roles) {
      const list = byUnit.get(u) ?? [];
      list.push({ mtrl: Number(r.MTRL), code: String(r.CODE ?? ''), name: String(r.NAME ?? ''), isService: String(r.SODTYPE) === '52', roles: rs });
      byUnit.set(u, list);
    }
  }
  for (const list of byUnit.values()) list.sort((a, b) => a.code.localeCompare(b.code, 'el'));
  usageCache = { at: Date.now(), byUnit };
  return byUnit;
}

export type UnitRow = {
  code: number; shortcut: string; name: string; interCode: string | null; decimals: number; sodim: number;
  myDataCode: number | null; myDataLabel: string | null; isActive: boolean; itemCount: number | null;
  /** Εικονίδιο της εφαρμογής (βιβλιοθήκη πολυμέσων) — null = η αυτόματη μικρογραφία. */
  iconUrl: string | null;
};

export async function listUnits(): Promise<{ rows: UnitRow[]; usageError: string | null }> {
  const [units, usage] = await Promise.all([
    prisma.softoneUnit.findMany({ orderBy: { code: 'asc' }, include: { iconMedia: { select: { publicUrl: true } } } }),
    unitUsage().then((u) => ({ u, err: null as string | null })).catch((e) => ({ u: null, err: (e as Error).message })),
  ]);
  return {
    rows: units.map((u) => ({
      code: u.code, shortcut: u.shortcut, name: u.name, interCode: u.interCode, decimals: u.decimals, sodim: u.sodim,
      myDataCode: u.myDataCode, myDataLabel: u.myDataCode != null ? MYDATA_UNITS[u.myDataCode] ?? null : null,
      isActive: u.isActive, itemCount: usage.u ? usage.u.get(u.code)?.length ?? 0 : null,
      iconUrl: u.iconMedia?.publicUrl ?? null,
    })),
    usageError: usage.err,
  };
}

// ── Εγγραφή ────────────────────────────────────────────────────────────────────────────────

const myData = z.number().int().refine((v) => v in MYDATA_UNITS, 'Άγνωστη μονάδα myDATA');
export const unitCreateInput = z.object({
  shortcut: z.string().trim().min(1, 'Η σύντμηση είναι υποχρεωτική').max(5, 'Έως 5 χαρακτήρες'),
  name: z.string().trim().min(1, 'Η περιγραφή είναι υποχρεωτική').max(50, 'Έως 50 χαρακτήρες'),
  interCode: z.string().trim().max(5, 'Έως 5 χαρακτήρες').optional().nullable().transform((v) => v || null),
  decimals: z.number().int().min(0).max(6),
  myDataCode: myData,
});
export const unitUpdateInput = z.object({
  shortcut: z.string().trim().min(1, 'Η σύντμηση είναι υποχρεωτική').max(5, 'Έως 5 χαρακτήρες').optional(),
  name: z.string().trim().min(1, 'Η περιγραφή είναι υποχρεωτική').max(50, 'Έως 50 χαρακτήρες').optional(),
  interCode: z.string().trim().max(5, 'Έως 5 χαρακτήρες').nullable().optional(),
  decimals: z.number().int().min(0).max(6).optional(),
  myDataCode: myData.optional(),
  isActive: z.boolean().optional(),
}).refine((v) => Object.values(v).some((x) => x !== undefined), 'Καμία αλλαγή');

const shortcutTaken = async (shortcut: string, exceptCode?: number) =>
  !!(await prisma.softoneUnit.findFirst({
    where: { shortcut: { equals: shortcut, mode: 'insensitive' }, ...(exceptCode != null ? { code: { not: exceptCode } } : {}) },
    select: { id: true },
  }));

/** Νέα μονάδα: αριθμός = μέγιστος γνωστός + 1 (επόμενος αν «υπάρχει ήδη»)· διάσταση/διαιρέτης 1. */
export async function createUnit(input: z.infer<typeof unitCreateInput>) {
  if (await shortcutTaken(input.shortcut)) throw new UnitError(`Η σύντμηση «${input.shortcut}» υπάρχει ήδη`);
  const max = await prisma.softoneUnit.aggregate({ _max: { code: true } });
  let code = (max._max.code ?? 100) + 1;
  for (let attempt = 0; attempt < 5; attempt++, code++) {
    const res = await softoneCall<{ success?: boolean; error?: string }>('setData', {
      OBJECT: 'MTRUNIT', KEY: '',
      data: { MTRUNIT: [{
        MTRUNIT: code, SHORTCUT: input.shortcut, NAME: input.name, ...(input.interCode ? { INTERCODE: input.interCode } : {}),
        QDECIMALS: input.decimals, SODIM: 1, SODIV: 1, MYDATACODE: input.myDataCode, ISACTIVE: 1,
      }] },
    });
    if (res.success === false) {
      if (/υπάρχει ήδη/i.test(res.error ?? '') && attempt < 4) continue;
      throw new UnitError(`SoftOne: ${res.error ?? 'η δημιουργία απέτυχε'}`, 502);
    }
    const saved = await readUnit(code);
    if (!saved || str(saved.NAME) !== input.name || str(saved.SHORTCUT) !== input.shortcut) {
      throw new UnitError('Το SoftOne απάντησε «επιτυχία» αλλά η μονάδα δεν βρέθηκε μετά την εγγραφή', 502);
    }
    const data = fromS1(saved, String(saved.ISACTIVE) === '1');
    const unit = await prisma.softoneUnit.upsert({ where: { code }, create: { code, ...data }, update: { ...data, syncedAt: new Date() } });
    await syncLookup(code, unit.name, unit.isActive);
    usageCache = null;
    return unit;
  }
  throw new UnitError('Δεν βρέθηκε ελεύθερος αριθμός μονάδας', 409);
}

/** Μερική ενημέρωση και επαλήθευση με getData. Μονάδα σε χρήση δεν απενεργοποιείται. */
export async function updateUnit(code: number, input: z.infer<typeof unitUpdateInput>) {
  const current = await prisma.softoneUnit.findUnique({ where: { code } });
  if (!current) throw new UnitError('Η μονάδα δεν υπάρχει', 404);
  if (input.shortcut && await shortcutTaken(input.shortcut, code)) throw new UnitError(`Η σύντμηση «${input.shortcut}» υπάρχει ήδη`);
  if (input.isActive === false) {
    const used = (await unitUsage(true)).get(code)?.length ?? 0;
    if (used > 0) throw new UnitError(`Η μονάδα χρησιμοποιείται σε ${used} ενεργά είδη/υπηρεσίες — δεν απενεργοποιείται`, 409);
  }

  const row: Record<string, unknown> = {};
  if (input.shortcut !== undefined) row.SHORTCUT = input.shortcut;
  if (input.name !== undefined) row.NAME = input.name;
  if (input.interCode !== undefined) row.INTERCODE = input.interCode ?? '';
  if (input.decimals !== undefined) row.QDECIMALS = input.decimals;
  if (input.myDataCode !== undefined) row.MYDATACODE = input.myDataCode;
  if (input.isActive !== undefined) row.ISACTIVE = input.isActive ? 1 : 0;
  const res = await softoneCall<{ success?: boolean; error?: string }>('setData', { OBJECT: 'MTRUNIT', KEY: String(code), data: { MTRUNIT: [row] } });
  if (res.success === false) throw new UnitError(`SoftOne: ${res.error ?? 'η αποθήκευση απέτυχε'}`, 502);

  const saved = await readUnit(code);
  const after = saved ? fromS1(saved, String(saved.ISACTIVE) === '1') : null;
  if (!after
    || (input.shortcut !== undefined && after.shortcut !== input.shortcut)
    || (input.name !== undefined && after.name !== input.name)
    || (input.interCode !== undefined && after.interCode !== (input.interCode || null))
    || (input.decimals !== undefined && after.decimals !== input.decimals)
    || (input.myDataCode !== undefined && after.myDataCode !== input.myDataCode)
    || (input.isActive !== undefined && after.isActive !== input.isActive)) {
    throw new UnitError('Το SoftOne απάντησε «επιτυχία» αλλά η αλλαγή δεν φαίνεται μετά την εγγραφή', 502);
  }
  const unit = await prisma.softoneUnit.update({ where: { code }, data: { ...after, syncedAt: new Date() } });
  await syncLookup(code, unit.name, unit.isActive);
  usageCache = null;
  return unit;
}

export async function unitMembers(code: number) {
  return (await unitUsage()).get(code) ?? [];
}
