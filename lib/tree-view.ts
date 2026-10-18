// lib/tree-view.ts — ΚΑΘΑΡΟ. Επίπεδη λίστα κόμβων (id/parentId) → δέντρο με σύνολα υποδέντρου, και
// φίλτρο αναζήτησης που κρατά τους προγόνους όσων ταιριάζουν (για τη σελίδα «Κατηγορίες & ομάδες»).

export interface FlatNode {
  id: number;
  parentId: number | null;
  code: string;
  name: string;
  counts: { applied: number; proposed: number; review: number };
  members?: { code: string; name: string }[];
}

export type TreeOf<T extends FlatNode> = T & {
  children: TreeOf<T>[];
  /** Σύνολα του κόμβου ΚΑΙ όλων των απογόνων του. */
  total: { applied: number; proposed: number; review: number };
  depth: number;
};

const sum = (a: FlatNode['counts'], b: FlatNode['counts']) => ({
  applied: a.applied + b.applied, proposed: a.proposed + b.proposed, review: a.review + b.review,
});

/** Δέντρο με τη σειρά της εισόδου· κόμβοι με άγνωστο γονέα γίνονται ρίζες. */
export function buildTree<T extends FlatNode>(nodes: T[]): TreeOf<T>[] {
  const ids = new Set(nodes.map((n) => n.id));
  const byParent = new Map<number | null, T[]>();
  for (const n of nodes) {
    const p = n.parentId != null && ids.has(n.parentId) ? n.parentId : null;
    byParent.set(p, [...(byParent.get(p) ?? []), n]);
  }
  const make = (n: T, depth: number): TreeOf<T> => {
    const children = (byParent.get(n.id) ?? []).map((c) => make(c, depth + 1));
    const total = children.reduce((acc, c) => sum(acc, c.total), { ...n.counts });
    return { ...n, children, total, depth };
  };
  return (byParent.get(null) ?? []).map((n) => make(n, 0));
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('el');

/**
 * Κρατά κόμβους που ταιριάζουν (όνομα, σύντμηση ή μέλος) και τους προγόνους τους. Κόμβος που ταιριάζει
 * κρατά ΟΛΑ τα παιδιά του· όταν ταιριάζουν μόνο μέλη, κρατιούνται μόνο αυτά τα μέλη.
 */
export function filterTree<T extends FlatNode>(tree: TreeOf<T>[], query: string): TreeOf<T>[] {
  const q = fold(query.trim());
  if (!q) return tree;
  const walk = (n: TreeOf<T>): TreeOf<T> | null => {
    if (fold(`${n.code} ${n.name}`).includes(q)) return n;
    const members = (n.members ?? []).filter((m) => fold(`${m.code} ${m.name}`).includes(q));
    const children = n.children.map(walk).filter((c): c is TreeOf<T> => c != null);
    if (!members.length && !children.length) return null;
    return { ...n, members, children };
  };
  return tree.map(walk).filter((c): c is TreeOf<T> => c != null);
}

/** Όλα τα ids (για «Ανάπτυξη όλων»). */
export function allIds<T extends FlatNode>(tree: TreeOf<T>[]): number[] {
  return tree.flatMap((n) => [n.id, ...allIds(n.children)]);
}
