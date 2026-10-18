// SERVER: οι ιεραρχίες κατηγοριοποίησης για τη σελίδα «Κατηγορίες & ομάδες» — μόνο βάση της εφαρμογής.
//   · Ομάδες ειδών/υπηρεσιών (ItemGroup → SoftOne MTRGROUP, με κωδικό ιεραρχίας)
//   · Εμπορικές κατηγορίες συναλλασσομένων (TraderClass → SoftOne TRDBUSINESS, με κωδικό ιεραρχίας)
// Πλήθη με groupBy (δείκτες σε leafId/groupId + status) — ένα ερώτημα ανά πίνακα, όχι ανά κόμβο.
import 'server-only';
import { prisma } from '@/lib/db';

export interface TreeMember { code: string; name: string; status: string; review: boolean }

export interface TreeNode {
  id: number;
  parentId: number | null;
  soh: string;
  code: string;
  name: string;
  description: string | null;
  /** Κλειδί στο SoftOne — null = δεν υπάρχει ακόμα εκεί. */
  softoneId: number | null;
  counts: { applied: number; proposed: number; review: number };
  members: TreeMember[];
}

export interface ClassTree { key: string; title: string; subtitle: string; softoneField: string; nodes: TreeNode[] }

const bump = (m: Map<number, TreeNode['counts']>, id: number | null, status: string, review: boolean) => {
  if (id == null) return;
  const c = m.get(id) ?? { applied: 0, proposed: 0, review: 0 };
  if (status === 'APPLIED') c.applied++;
  else c.proposed++;
  if (review && status !== 'APPLIED') c.review++;
  m.set(id, c);
};

const bySoh = (a: { soh: string }, b: { soh: string }) =>
  a.soh.split('.').map(Number).reduce((r, n, i) => r || n - (Number(b.soh.split('.')[i]) || 0), 0) || a.soh.length - b.soh.length;

export async function loadItemGroupTrees(): Promise<ClassTree[]> {
  const [groups, assigns] = await Promise.all([
    prisma.itemGroup.findMany({ where: { isActive: true } }),
    prisma.itemGroupAssignment.findMany({ select: { groupId: true, status: true, needsReview: true, code: true, name: true } }),
  ]);
  const counts = new Map<number, TreeNode['counts']>();
  const members = new Map<number, TreeMember[]>();
  for (const a of assigns) {
    bump(counts, a.groupId, a.status, a.needsReview);
    if (a.groupId != null) {
      const l = members.get(a.groupId) ?? [];
      l.push({ code: a.code, name: a.name, status: a.status, review: a.needsReview });
      members.set(a.groupId, l);
    }
  }
  const tree = (sodtype: number, title: string, subtitle: string): ClassTree => ({
    key: `items-${sodtype}`, title, subtitle, softoneField: 'MTRGROUP',
    nodes: groups.filter((g) => g.sodtype === sodtype).map((g) => ({
      id: g.id, parentId: g.parentId, soh: g.sohCode, code: g.code, name: g.name, description: g.description, softoneId: g.softoneId,
      counts: counts.get(g.id) ?? { applied: 0, proposed: 0, review: 0 },
      members: (members.get(g.id) ?? []).sort((x, y) => x.name.localeCompare(y.name, 'el')),
    })).sort(bySoh),
  });
  return [tree(51, 'Είδη', 'Ομάδες ειδών'), tree(52, 'Υπηρεσίες', 'Ομάδες υπηρεσιών')];
}

export async function loadTraderClassTrees(): Promise<ClassTree[]> {
  const [classes, assigns] = await Promise.all([
    prisma.traderClass.findMany({ where: { isActive: true } }),
    prisma.traderClassAssignment.findMany({ select: { leafId: true, status: true, needsReview: true, code: true, name: true, leaf: { select: { key: true } } } }),
  ]);
  const counts = new Map<number, TreeNode['counts']>();
  const members = new Map<number, TreeMember[]>();
  for (const a of assigns) {
    bump(counts, a.leafId, a.status, a.needsReview);
    // Τα ονόματα των ιδιωτών δεν χρειάζονται στη λίστα — μόνο το πλήθος.
    if (a.leafId != null && a.leaf?.key !== 'C_PRIVATE') {
      const l = members.get(a.leafId) ?? [];
      l.push({ code: a.code, name: a.name, status: a.status, review: a.needsReview });
      members.set(a.leafId, l);
    }
  }
  const tree = (sodtype: number, title: string, subtitle: string): ClassTree => ({
    key: `traders-${sodtype}`, title, subtitle, softoneField: 'TRDBUSINESS',
    nodes: classes.filter((c) => c.sodtype === sodtype).map((c) => ({
      id: c.id, parentId: c.parentId, soh: c.sohCode ?? '', code: c.code, name: c.name, description: c.description, softoneId: c.softoneId,
      counts: counts.get(c.id) ?? { applied: 0, proposed: 0, review: 0 },
      members: (members.get(c.id) ?? []).sort((x, y) => x.name.localeCompare(y.name, 'el')),
    })).sort(bySoh),
  });
  return [tree(13, 'Πελάτες', 'Εμπορικές κατηγορίες πελατών'), tree(12, 'Προμηθευτές', 'Εμπορικές κατηγορίες προμηθευτών')];
}
