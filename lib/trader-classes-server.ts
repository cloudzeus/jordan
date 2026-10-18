// SERVER: εμπορικές κατηγορίες συναλλασσομένων από τη βάση (`TraderClass` / `TraderClassAssignment`).
// Ορισμός δέντρου και κανόνες ΚΑΔ: lib/trader-classes.ts · συσχετιζόμενες επιλογές: lib/trader-class-select.ts.
// Μόνο βάση της εφαρμογής — τίποτα εδώ δεν γράφει στο SoftOne.
import 'server-only';
import { prisma } from '@/lib/db';
import { classifyTrader, craftSpecialty } from '@/lib/trader-classes';
import { parseAfm2Info } from '@/lib/aade-parse';
import { isValidAfm } from '@/lib/ocr/validate';
import type { ClassRow } from '@/lib/trader-class-select';

/** Οι ενεργοί κόμβοι μιας πλευράς (12 προμηθευτές · 13 πελάτες), σε σειρά ιεραρχίας. */
export async function loadClassRows(sodtype: number): Promise<ClassRow[]> {
  return prisma.traderClass.findMany({
    where: { sodtype, isActive: true },
    orderBy: [{ level: 'asc' }, { order: 'asc' }],
    select: { id: true, key: true, level: true, code: true, name: true, parentId: true, softoneId: true, sohCode: true },
  });
}

export interface TraderClassState {
  /** Ό,τι έχει ορίσει (εγκρίνει) χρήστης — ή η αυτόματη πρόταση αν δεν έχει οριστεί τίποτα. */
  leafId: number | null;
  status: 'PROPOSED' | 'APPROVED' | 'APPLIED' | null;
  /** Η αυτόματη πρόταση από ΚΑΔ/αγορές, με την αιτιολογία της. */
  proposal: {
    leafId: number | null; basis: string; rule: string | null; needsReview: boolean;
    primaryKad: string | null; primaryKadDescr: string | null; specialty: string | null;
  } | null;
}

export async function loadTraderClass(trdr: number): Promise<TraderClassState> {
  const a = await prisma.traderClassAssignment.findUnique({ where: { trdr }, include: { leaf: { select: { key: true } } } });
  if (!a) return { leafId: null, status: null, proposal: null };
  const works = a.leaf?.key === 'S_CREW' || a.leaf?.key === 'S_CRAFT';
  return {
    leafId: a.leafId,
    status: a.status as TraderClassState['status'],
    proposal: a.status === 'PROPOSED' ? {
      leafId: a.leafId, basis: a.basis, rule: a.rule, needsReview: a.needsReview,
      primaryKad: a.primaryKad, primaryKadDescr: a.primaryKadDescr, specialty: works ? craftSpecialty(a.primaryKad) : null,
    } : null,
  };
}

/**
 * Αποθηκεύει την επιλογή του χρήστη (φύλλο του δέντρου) ως ΕΓΚΕΚΡΙΜΕΝΗ. `applied` = γράφτηκε ήδη και στην
 * καρτέλα του SoftOne. Ο συναλλασσόμενος μπορεί να μην έχει ακόμα γραμμή (νέος) — δημιουργείται.
 */
export async function saveTraderClass(input: {
  trdr: number; sodtype: number; code: string; name: string; afm?: string | null; leafId: number | null; applied: boolean;
}): Promise<void> {
  const rows = await loadClassRows(input.sodtype);
  const leaf = input.leafId != null ? rows.find((r) => r.id === input.leafId) : undefined;
  if (input.leafId != null && (!leaf || rows.some((r) => r.parentId === leaf.id))) {
    throw new Error('Διάλεξε την πιο ειδική κατηγορία (φύλλο) για αυτόν τον τύπο συναλλασσομένου.');
  }
  const pathKeys: string[] = [];
  for (let n = leaf; n; n = rows.find((r) => r.id === n!.parentId)) pathKeys.unshift(n.key);
  const data = {
    leafId: leaf?.id ?? null, pathKeys,
    status: input.applied ? 'APPLIED' : 'APPROVED',
    appliedAt: input.applied ? new Date() : null,
  };
  await prisma.traderClassAssignment.upsert({
    where: { trdr: input.trdr },
    update: data,
    create: {
      trdr: input.trdr, sodtype: input.sodtype, code: input.code, name: input.name, afm: input.afm ?? null,
      afmKind: input.afm ? 'greek' : 'none', basis: 'manual', ...data,
    },
  });
}

/**
 * Αυτόματη ΠΡΟΤΑΣΗ για νέο συναλλασσόμενο από τον κύριο ΚΑΔ της ΑΑΔΕ (ίδιοι κανόνες με την κατηγοριοποίηση).
 * Αποθηκεύεται μόνο στη βάση μας ως PROPOSED — ΔΕΝ γράφει στο SoftOne και δεν αλλάζει εγκεκριμένη ανάθεση.
 * Για κλήση χωρίς αναμονή (`void proposeTraderClass(...)`) μετά από δημιουργία: σφάλματα ΑΑΔΕ καταπίνονται.
 */
export async function proposeTraderClass(input: { trdr: number; sodtype: number; code: string; name: string; afm: string | null }): Promise<void> {
  const side = input.sodtype === 13 ? 'customer' : input.sodtype === 12 ? 'supplier' : null;
  if (!side) return;
  const digits = input.afm?.replace(/\D/g, '') ?? '';
  const greek = !!input.afm && isValidAfm(digits) && !/[A-Za-z]/.test(input.afm);
  let rec: ReturnType<typeof parseAfm2Info> = null;
  let aadeFound: boolean | undefined;
  if (greek) {
    try {
      const r = await fetch('https://vat.wwa.gr/afm2info', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ afm: digits }), cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
      if (r.ok) { rec = parseAfm2Info(await r.json()); aadeFound = !!rec; }
    } catch { /* η ΑΑΔΕ δεν απάντησε — πρόταση χωρίς ΚΑΔ */ }
  }
  const primary = rec?.activities.find((a) => a.kind === '1') ?? null;
  const res = classifyTrader({
    side, afmKind: !input.afm ? 'none' : greek ? 'greek' : /[A-Za-z]/.test(input.afm) ? 'foreign' : 'invalid',
    aadeFound, legalForm: rec?.legalForm, firmFlag: rec?.firmFlag, naturalPerson: rec?.naturalPerson,
    primaryKad: primary?.code ?? null, primaryKadDescr: primary?.descr ?? null,
  });
  const leaf = res.leaf ? await prisma.traderClass.findUnique({ where: { key_sodtype: { key: res.leaf, sodtype: input.sodtype } }, select: { id: true } }) : null;
  const existing = await prisma.traderClassAssignment.findUnique({ where: { trdr: input.trdr }, select: { status: true } });
  if (existing && existing.status !== 'PROPOSED') return;
  const data = {
    sodtype: input.sodtype, code: input.code, name: input.name, afm: input.afm, afmKind: greek ? 'greek' : input.afm ? 'other' : 'none',
    aadeName: rec?.name ?? null, aadeCheckedAt: greek ? new Date() : null,
    primaryKad: primary ? primary.code.padEnd(8, '0').replace(/^(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1.$2.$3.$4') : null,
    primaryKadDescr: primary?.descr ?? null, activities: rec?.activities ?? undefined,
    leafId: leaf?.id ?? null, pathKeys: res.path, basis: res.basis, rule: res.rule, needsReview: res.review,
  };
  await prisma.traderClassAssignment.upsert({ where: { trdr: input.trdr }, update: data, create: { trdr: input.trdr, ...data } });
}
