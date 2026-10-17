import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { softoneCall, softoneGetTable, SoftoneError } from '@/lib/softone';

/**
 * Εμπορικές κατηγορίες & ομάδες ειδών/υπηρεσιών (SoftOne MTRCATEGORY / MTRGROUP).
 *
 * Επιβεβαιωμένο ζωντανά (atelier, 2026-10-17):
 *  - αρίθμηση ΑΝΑ SODTYPE (51 είδη, 52 υπηρεσίες)· μία εταιρία (1000)·
 *  - ΚΑΤΗΓΟΡΙΑ: `ITECATEGORY` / `SRVCATEGORY`, setData ανά εγγραφή με μερική ενημέρωση. Η νέα θέλει
 *    ΡΗΤΟ αριθμό (`MTRCATEGORY`), αλλιώς «Δεν έχετε συμπληρώσει το πεδίο Κωδ.»· η απενεργοποίηση
 *    (`ISACTIVE:0`) κρύβει τη γραμμή από το GetTable — η ανάγνωση γίνεται με getData·
 *  - ΟΜΑΔΑ: `ITEGROUP` / `SRVGROUP` είναι αντικείμενο-ΛΙΣΤΑ. Το setData έσβησε τη γραμμή του KEY
 *    ακόμη κι όταν την ξαναστείλαμε, και το getData έμεινε με μπαγιάτικη μνήμη. ΔΕΝ γράφουμε ομάδες.
 */

export type ClassKind = 'CATEGORY' | 'GROUP';
export const SODTYPES = { item: 51, service: 52 } as const;
const KIND_TABLE: Record<ClassKind, 'MTRCATEGORY' | 'MTRGROUP'> = { CATEGORY: 'MTRCATEGORY', GROUP: 'MTRGROUP' };
const CATEGORY_OBJECT: Record<number, 'ITECATEGORY' | 'SRVCATEGORY'> = { 51: 'ITECATEGORY', 52: 'SRVCATEGORY' };

export class ClassificationError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

// ── Συγχρονισμός ────────────────────────────────────────────────────────────────────────────

/** Διαβάζει κατηγορίες και ομάδες ειδών/υπηρεσιών· όσες λείπουν σημειώνονται ανενεργές. */
export async function syncClassifications() {
  const now = new Date();
  let created = 0;
  let updated = 0;
  for (const kind of ['CATEGORY', 'GROUP'] as const) {
    const table = KIND_TABLE[kind];
    const rows = await softoneGetTable(table, [table, 'SODTYPE', 'CODE', 'NAME'], 'SODTYPE IN (51,52)');
    for (const r of rows) {
      const code = Number(r[table]);
      const sodtype = Number(r.SODTYPE);
      if (!Number.isInteger(code) || !(sodtype in CATEGORY_OBJECT)) continue;
      const data = { shortCode: r.CODE || null, name: String(r.NAME || r.CODE || code).trim(), isActive: true, syncedAt: now };
      const prev = await prisma.softoneClassification.findUnique({ where: { kind_sodtype_code: { kind, sodtype, code } }, select: { id: true } });
      await prisma.softoneClassification.upsert({ where: { kind_sodtype_code: { kind, sodtype, code } }, create: { kind, sodtype, code, ...data }, update: data });
      if (prev) updated++; else created++;
    }
  }
  // Ό,τι δεν επέστρεψε το GetTable είναι ανενεργό στο SoftOne (το GetTable κρύβει τις ανενεργές).
  const { count: deactivated } = await prisma.softoneClassification.updateMany({
    where: { syncedAt: { lt: now }, isActive: true }, data: { isActive: false },
  });
  // Ανενεργές κατηγορίες ΜΕΤΑ τη μεγαλύτερη γνωστή δεν φαίνονται πουθενά αλλού: getData στους
  // επόμενους αριθμούς μέχρι τον πρώτο που δεν υπάρχει.
  for (const sodtype of [51, 52]) {
    const max = await prisma.softoneClassification.aggregate({ where: { kind: 'CATEGORY', sodtype }, _max: { code: true } });
    for (let code = (max._max.code ?? 0) + 1, n = 0; n < 5; code++, n++) {
      const hidden = await readCategory(sodtype, code).catch(() => null);
      if (!hidden || hidden.sodtype !== sodtype) break;
      await prisma.softoneClassification.create({
        data: { kind: 'CATEGORY', sodtype, code, shortCode: hidden.shortCode, name: hidden.name, isActive: hidden.isActive, syncedAt: now },
      });
      created++;
    }
  }
  memberCache = null;
  return { created, updated, deactivated };
}

// ── Μέλη (είδη ανά κατηγορία/ομάδα) ──────────────────────────────────────────────────────────

type Member = { mtrl: number; code: string; name: string; sodtype: number; category: number | null; group: number | null };
const MEMBERS_TTL_MS = 5 * 60_000;
let memberCache: { at: number; rows: Member[] } | null = null;

const intOrNull = (v: unknown) => {
  const n = Number(v);
  return v === '' || v == null || !Number.isInteger(n) ? null : n;
};

/** Ενεργά είδη/υπηρεσίες με την κατηγορία και την ομάδα τους — ζωντανά, κρατιούνται 5 λεπτά. */
export async function classificationMembers(fresh = false): Promise<Member[]> {
  if (!fresh && memberCache && Date.now() - memberCache.at < MEMBERS_TTL_MS) return memberCache.rows;
  const rows = await softoneGetTable('MTRL', ['MTRL', 'CODE', 'NAME', 'SODTYPE', 'MTRCATEGORY', 'MTRGROUP'], 'SODTYPE IN (51,52)');
  const out = rows.map((r) => ({
    mtrl: Number(r.MTRL), code: String(r.CODE ?? ''), name: String(r.NAME ?? ''), sodtype: Number(r.SODTYPE),
    category: intOrNull(r.MTRCATEGORY), group: intOrNull(r.MTRGROUP),
  })).filter((m) => Number.isInteger(m.mtrl));
  memberCache = { at: Date.now(), rows: out };
  return out;
}

export type ClassificationRow = {
  id: number; kind: ClassKind; sodtype: number; code: number; shortCode: string | null; name: string;
  isActive: boolean; itemCount: number | null;
};

export async function listClassifications(): Promise<{ rows: ClassificationRow[]; membersError: string | null }> {
  const [rows, members] = await Promise.all([
    prisma.softoneClassification.findMany({ orderBy: [{ kind: 'asc' }, { sodtype: 'asc' }, { code: 'asc' }] }),
    classificationMembers().then((m) => ({ m, err: null as string | null })).catch((e) => ({ m: null, err: (e as Error).message })),
  ]);
  const counts = new Map<string, number>();
  for (const x of members.m ?? []) {
    if (x.category != null) counts.set(`CATEGORY:${x.sodtype}:${x.category}`, (counts.get(`CATEGORY:${x.sodtype}:${x.category}`) ?? 0) + 1);
    if (x.group != null) counts.set(`GROUP:${x.sodtype}:${x.group}`, (counts.get(`GROUP:${x.sodtype}:${x.group}`) ?? 0) + 1);
  }
  return {
    rows: rows.map((r) => ({
      id: r.id, kind: r.kind as ClassKind, sodtype: r.sodtype, code: r.code, shortCode: r.shortCode, name: r.name, isActive: r.isActive,
      itemCount: members.m ? counts.get(`${r.kind}:${r.sodtype}:${r.code}`) ?? 0 : null,
    })),
    membersError: members.err,
  };
}

export async function membersOf(kind: ClassKind, sodtype: number, code: number) {
  const all = await classificationMembers();
  return all
    .filter((m) => m.sodtype === sodtype && (kind === 'CATEGORY' ? m.category === code : m.group === code))
    .map(({ mtrl, code: c, name }) => ({ mtrl, code: c, name }))
    .sort((a, b) => a.code.localeCompare(b.code, 'el'));
}

// ── Εγγραφή κατηγοριών ─────────────────────────────────────────────────────────────────────

export const categoryCreateInput = z.object({
  sodtype: z.union([z.literal(51), z.literal(52)]),
  shortCode: z.string().trim().min(1, 'Η σύντμηση είναι υποχρεωτική').max(10, 'Έως 10 χαρακτήρες'),
  name: z.string().trim().min(1, 'Η ονομασία είναι υποχρεωτική').max(100),
});
export const categoryUpdateInput = z.object({
  shortCode: z.string().trim().min(1, 'Η σύντμηση είναι υποχρεωτική').max(10, 'Έως 10 χαρακτήρες').optional(),
  name: z.string().trim().min(1, 'Η ονομασία είναι υποχρεωτική').max(100).optional(),
  isActive: z.boolean().optional(),
}).refine((v) => v.shortCode !== undefined || v.name !== undefined || v.isActive !== undefined, 'Καμία αλλαγή');

type S1Result = { success?: boolean; error?: string; errorcode?: number; id?: string; data?: Record<string, Record<string, unknown>[]> };

async function readCategory(sodtype: number, code: number) {
  const object = CATEGORY_OBJECT[sodtype];
  const res = await softoneCall<S1Result>('getData', { OBJECT: object, KEY: String(code) });
  if (res.success === false) throw new SoftoneError(res.error ?? `getData ${object} ${code} απέτυχε`);
  const row = res.data?.[object]?.[0];
  if (!row || Number(row.MTRCATEGORY) !== code) return null;
  return { shortCode: (row.CODE as string) || null, name: String(row.NAME ?? ''), isActive: String(row.ISACTIVE) === '1', sodtype: Number(row.SODTYPE) };
}

const shortCodeTaken = async (sodtype: number, shortCode: string, exceptCode?: number) =>
  !!(await prisma.softoneClassification.findFirst({
    where: { kind: 'CATEGORY', sodtype, shortCode: { equals: shortCode, mode: 'insensitive' }, ...(exceptCode != null ? { code: { not: exceptCode } } : {}) },
    select: { id: true },
  }));

/**
 * Νέα κατηγορία στο SoftOne. Ο αριθμός = μέγιστος γνωστός + 1· αν υπάρχει ήδη (π.χ. ανενεργή που
 * δεν είδαμε ποτέ), το SoftOne απαντά «υπάρχει ήδη» και δοκιμάζουμε τον επόμενο. Επαλήθευση με getData.
 */
export async function createCategory(input: z.infer<typeof categoryCreateInput>) {
  const { sodtype, shortCode, name } = input;
  if (await shortCodeTaken(sodtype, shortCode)) throw new ClassificationError(`Η σύντμηση «${shortCode}» υπάρχει ήδη`);
  const max = await prisma.softoneClassification.aggregate({ where: { kind: 'CATEGORY', sodtype }, _max: { code: true } });
  let code = (max._max.code ?? 0) + 1;
  for (let attempt = 0; attempt < 5; attempt++, code++) {
    const res = await softoneCall<S1Result>('setData', {
      OBJECT: CATEGORY_OBJECT[sodtype], KEY: '', data: { [CATEGORY_OBJECT[sodtype]]: [{ MTRCATEGORY: code, CODE: shortCode, NAME: name }] },
    });
    if (res.success === false) {
      if (/υπάρχει ήδη/i.test(res.error ?? '') && attempt < 4) continue;
      throw new ClassificationError(`SoftOne: ${res.error ?? 'η δημιουργία απέτυχε'}`, 502);
    }
    const saved = await readCategory(sodtype, code);
    if (!saved || saved.name !== name || saved.sodtype !== sodtype) {
      throw new ClassificationError('Το SoftOne απάντησε «επιτυχία» αλλά η κατηγορία δεν βρέθηκε μετά την εγγραφή', 502);
    }
    memberCache = null;
    return prisma.softoneClassification.upsert({
      where: { kind_sodtype_code: { kind: 'CATEGORY', sodtype, code } },
      create: { kind: 'CATEGORY', sodtype, code, shortCode: saved.shortCode, name: saved.name, isActive: true },
      update: { shortCode: saved.shortCode, name: saved.name, isActive: true, syncedAt: new Date() },
    });
  }
  throw new ClassificationError('Δεν βρέθηκε ελεύθερος αριθμός κατηγορίας', 409);
}

/** Μετονομασία / σύντμηση / (απ)ενεργοποίηση — μερική ενημέρωση και επαλήθευση με getData. */
export async function updateCategory(sodtype: number, code: number, input: z.infer<typeof categoryUpdateInput>) {
  if (!(sodtype in CATEGORY_OBJECT)) throw new ClassificationError('Άγνωστο μητρώο');
  const current = await prisma.softoneClassification.findUnique({ where: { kind_sodtype_code: { kind: 'CATEGORY', sodtype, code } } });
  if (!current) throw new ClassificationError('Η κατηγορία δεν υπάρχει', 404);
  if (input.shortCode && await shortCodeTaken(sodtype, input.shortCode, code)) throw new ClassificationError(`Η σύντμηση «${input.shortCode}» υπάρχει ήδη`);
  if (input.isActive === false) {
    const used = (await membersOf('CATEGORY', sodtype, code)).length;
    if (used > 0) throw new ClassificationError(`Η κατηγορία έχει ${used} ενεργά είδη — άλλαξέ τους πρώτα κατηγορία`, 409);
  }

  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.NAME = input.name;
  if (input.shortCode !== undefined) row.CODE = input.shortCode;
  if (input.isActive !== undefined) row.ISACTIVE = input.isActive ? 1 : 0;
  const object = CATEGORY_OBJECT[sodtype];
  const res = await softoneCall<S1Result>('setData', { OBJECT: object, KEY: String(code), data: { [object]: [row] } });
  if (res.success === false) throw new ClassificationError(`SoftOne: ${res.error ?? 'η αποθήκευση απέτυχε'}`, 502);

  const saved = await readCategory(sodtype, code);
  if (!saved
    || (input.name !== undefined && saved.name !== input.name)
    || (input.shortCode !== undefined && saved.shortCode !== input.shortCode)
    || (input.isActive !== undefined && saved.isActive !== input.isActive)) {
    throw new ClassificationError('Το SoftOne απάντησε «επιτυχία» αλλά η αλλαγή δεν φαίνεται μετά την εγγραφή', 502);
  }
  memberCache = null;
  return prisma.softoneClassification.update({
    where: { id: current.id },
    data: { shortCode: saved.shortCode, name: saved.name, isActive: saved.isActive, syncedAt: new Date() },
  });
}

/** Επιλογές για τη φόρμα είδους: μόνο οι ενεργές του ίδιου μητρώου (είδη ή υπηρεσίες). */
export async function classificationOptions(sodtype: number) {
  const rows = await prisma.softoneClassification.findMany({
    where: { sodtype, isActive: true }, orderBy: { code: 'asc' }, select: { kind: true, code: true, name: true },
  });
  const pick = (kind: ClassKind) => rows.filter((r) => r.kind === kind).map((r) => ({ id: String(r.code), name: r.name }));
  return { categories: pick('CATEGORY'), groups: pick('GROUP') };
}
