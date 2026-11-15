// SERVER: οι ιεραρχίες κατηγοριοποίησης για τη σελίδα «Κατηγορίες & ομάδες» — μόνο βάση της εφαρμογής.
//   · Ομάδες ειδών/υπηρεσιών (ItemGroup → SoftOne MTRGROUP, με κωδικό ιεραρχίας)
//   · Εμπορικές κατηγορίες συναλλασσομένων (TraderClass → SoftOne TRDBUSINESS, με κωδικό ιεραρχίας)
// Πλήθη με groupBy (δείκτες σε leafId/groupId + status) — ένα ερώτημα ανά πίνακα, όχι ανά κόμβο.
import 'server-only';
import { prisma } from '@/lib/db';
import { itemGroupColor } from '@/lib/item-groups';

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

// ── Ομάδες ειδών/υπηρεσιών: πίνακας drag-drop με σύνδεση εμπορικής κατηγορίας (ΤΟΠΙΚΟ, όχι SoftOne) ──

/** Κόμβος ομάδας για τον επεξεργαστή: id ως string (απαίτηση του dnd), κωδικός ιεραρχίας, σύνδεση κατηγορίας. */
export interface ItemGroupBoardNode {
  id: string;
  sodtype: number;
  sohCode: string;
  code: string;
  name: string;
  description: string | null;
  color: string;
  softoneId: number | null;
  categoryCode: number | null;
  categoryName: string | null;
  counts: { applied: number; proposed: number; review: number };
  members: TreeMember[];
}

export interface CategoryOption { code: number; name: string }

export interface ItemGroupBoard {
  sodtype: number;
  label: string;
  nodes: ItemGroupBoardNode[];
  /** Εμπορικές κατηγορίες του ίδιου sodtype — επιλογές για τη σύνδεση. */
  categoryOptions: CategoryOption[];
}

export async function loadItemGroupBoards(): Promise<ItemGroupBoard[]> {
  const [groups, assigns, categories] = await Promise.all([
    prisma.itemGroup.findMany({ where: { isActive: true } }),
    prisma.itemGroupAssignment.findMany({ select: { groupId: true, status: true, needsReview: true, code: true, name: true } }),
    prisma.softoneClassification.findMany({ where: { kind: 'CATEGORY', isActive: true }, select: { sodtype: true, code: true, name: true } }),
  ]);
  const counts = new Map<number, ItemGroupBoardNode['counts']>();
  const members = new Map<number, TreeMember[]>();
  for (const a of assigns) {
    bump(counts, a.groupId, a.status, a.needsReview);
    if (a.groupId != null) {
      const l = members.get(a.groupId) ?? [];
      l.push({ code: a.code, name: a.name, status: a.status, review: a.needsReview });
      members.set(a.groupId, l);
    }
  }
  const catName = new Map(categories.map((c) => [`${c.sodtype}:${c.code}`, c.name]));
  const board = (sodtype: number, label: string): ItemGroupBoard => ({
    sodtype, label,
    categoryOptions: categories.filter((c) => c.sodtype === sodtype).map((c) => ({ code: c.code, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'el')),
    nodes: groups.filter((g) => g.sodtype === sodtype).map((g) => ({
      id: String(g.id), sodtype: g.sodtype, sohCode: g.sohCode, code: g.code, name: g.name, description: g.description,
      color: itemGroupColor(g.key), softoneId: g.softoneId,
      categoryCode: g.categoryCode, categoryName: g.categoryCode != null ? catName.get(`${sodtype}:${g.categoryCode}`) ?? null : null,
      counts: counts.get(g.id) ?? { applied: 0, proposed: 0, review: 0 },
      members: (members.get(g.id) ?? []).sort((x, y) => x.name.localeCompare(y.name, 'el')),
    })).sort((a, b) => bySoh({ soh: a.sohCode }, { soh: b.sohCode })),
  });
  return [board(51, 'Είδη'), board(52, 'Υπηρεσίες')];
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
