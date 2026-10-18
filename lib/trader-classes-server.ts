// SERVER: κατηγορίες συναλλασσομένων από τη βάση (`TraderClass` / `TraderClassAssignment`).
// Ορισμός δέντρου και κανόνες ΚΑΔ: lib/trader-classes.ts · συσχετιζόμενες επιλογές: lib/trader-class-select.ts.
import 'server-only';
import { prisma } from '@/lib/db';
import type { ClassRow } from '@/lib/trader-class-select';

/** Οι ενεργοί κόμβοι μιας πλευράς (12 προμηθευτές · 13 πελάτες), από το γενικό στο ειδικό. */
export async function loadClassRows(sodtype: number): Promise<ClassRow[]> {
  return prisma.traderClass.findMany({
    where: { sodtype, isActive: true },
    orderBy: [{ level: 'asc' }, { order: 'asc' }],
    select: { id: true, key: true, level: true, code: true, name: true, parentId: true, softoneId: true },
  });
}

export interface TraderClassState {
  /** Ό,τι έχει ορίσει (εγκρίνει) χρήστης — ή η αυτόματη πρόταση αν δεν έχει οριστεί τίποτα. */
  leafId: number | null;
  status: 'PROPOSED' | 'APPROVED' | 'APPLIED' | null;
  /** Η αυτόματη πρόταση από ΚΑΔ/αγορές, με την αιτιολογία της. */
  proposal: { leafId: number | null; basis: string; rule: string | null; needsReview: boolean; primaryKad: string | null; primaryKadDescr: string | null } | null;
}

export async function loadTraderClass(trdr: number): Promise<TraderClassState> {
  const a = await prisma.traderClassAssignment.findUnique({ where: { trdr } });
  if (!a) return { leafId: null, status: null, proposal: null };
  return {
    leafId: a.leafId,
    status: a.status as TraderClassState['status'],
    proposal: {
      leafId: a.status === 'PROPOSED' ? a.leafId : null,
      basis: a.basis, rule: a.rule, needsReview: a.needsReview, primaryKad: a.primaryKad, primaryKadDescr: a.primaryKadDescr,
    },
  };
}

/**
 * Αποθηκεύει την επιλογή του χρήστη (φύλλο επιπέδου 3) ως ΕΓΚΕΚΡΙΜΕΝΗ. `applied` = γράφτηκαν ήδη και
 * τα τρία επίπεδα στο SoftOne. Ο συναλλασσόμενος μπορεί να μην έχει ακόμα γραμμή (νέος) — δημιουργείται.
 */
export async function saveTraderClass(input: {
  trdr: number; sodtype: number; code: string; name: string; afm?: string | null; leafId: number | null; applied: boolean;
}): Promise<void> {
  const rows = input.leafId != null ? await loadClassRows(input.sodtype) : [];
  const leaf = rows.find((r) => r.id === input.leafId && r.level === 3);
  if (input.leafId != null && !leaf) throw new Error('Άγνωστη κατηγορία επιπέδου 3 για αυτόν τον τύπο συναλλασσομένου.');
  const l2 = leaf ? rows.find((r) => r.id === leaf.parentId) : undefined;
  const l1 = l2 ? rows.find((r) => r.id === l2.parentId) : undefined;
  const data = {
    leafId: leaf?.id ?? null,
    pathKeys: [l1?.key, l2?.key, leaf?.key].filter((k): k is string => !!k),
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
