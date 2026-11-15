// lib/dnd-tree.ts — ΚΑΘΑΡΟ. Μηχανική του drag-drop δέντρου με κωδικό ιεραρχίας (SOHCODE): χτίσιμο δέντρου
// από επίπεδη λίστα (φωλιά με βάση τον SOHCODE), προβολή βάθους/γονέα κατά το σύρσιμο, εφαρμογή μετακίνησης
// και ΞΑΝΑΫΠΟΛΟΓΙΣΜΟΣ των κωδικών ιεραρχίας. Κοινό για τις εμπορικές κατηγορίες (SoftOne) και τις ομάδες ειδών.

export interface DndNode { id: string; sohCode: string }
export type DndTree<T extends DndNode> = T & { children: DndTree<T>[]; depth: number; parentId: string | null };
export type DndFlat<T extends DndNode> = T & { depth: number; parentId: string | null; childCount: number };

/** Προεπιλεγμένο βήμα εσοχής (px) ανά επίπεδο — και για το styling και για την προβολή κατά το σύρσιμο. */
export const INDENT = 28;

export function parentSoh(soh: string): string | null {
  const i = soh.lastIndexOf('.');
  return i > 0 ? soh.slice(0, i) : null;
}

/** Δέντρο από επίπεδη λίστα, φωλιά με βάση τον κωδικό ιεραρχίας (π.χ. «1.02» παιδί του «1»). */
export function buildTree<T extends DndNode>(nodes: T[]): DndTree<T>[] {
  const bySoh = new Map<string, DndTree<T>>();
  const items = nodes.map((n) => {
    const item = { ...n, children: [], depth: 0, parentId: null } as DndTree<T>;
    bySoh.set(n.sohCode, item);
    return item;
  });
  const roots: DndTree<T>[] = [];
  for (const item of items) {
    const ps = parentSoh(item.sohCode);
    const parent = ps ? bySoh.get(ps) : null;
    if (parent) { item.parentId = parent.id; parent.children.push(item); } else { roots.push(item); }
  }
  const setDepth = (list: DndTree<T>[], d: number) => { for (const i of list) { i.depth = d; setDepth(i.children, d + 1); } };
  setDepth(roots, 0);
  return roots;
}

/** Ορατές σειρές (οι συμπτυγμένες κρύβουν τα παιδιά τους), με βάθος/γονέα/πλήθος παιδιών. */
export function flattenTree<T extends DndNode>(items: DndTree<T>[], collapsed: Set<string>): DndFlat<T>[] {
  const out: DndFlat<T>[] = [];
  const walk = (list: DndTree<T>[]) => {
    for (const item of list) {
      const { children, ...rest } = item;
      out.push({ ...(rest as T), depth: item.depth, parentId: item.parentId, childCount: children.length });
      if (!collapsed.has(item.id)) walk(children);
    }
  };
  walk(items);
  return out;
}

/** Βάθος + γονέας όπου θα προσγειωθεί η σειρά που σέρνεται, περιορισμένο από τους γείτονες. */
export function getProjection<T extends DndNode>(
  flatItems: DndFlat<T>[], activeId: string, overId: string, dragOffsetX: number, indent = INDENT,
): { depth: number; parentId: string | null } {
  const itemsWithoutActive = flatItems.filter((i) => i.id !== activeId);
  const overIndex = itemsWithoutActive.findIndex((i) => i.id === overId);
  if (overIndex < 0) return { depth: 0, parentId: null };

  const activeItem = flatItems.find((i) => i.id === activeId);
  const projectedDepth = (activeItem?.depth ?? 0) + Math.round(dragOffsetX / indent);
  const prevItem = itemsWithoutActive[overIndex - 1];
  const maxDepth = prevItem ? prevItem.depth + 1 : 0;
  const nextItem = itemsWithoutActive[overIndex];
  const minDepth = nextItem ? nextItem.depth : 0;

  let depth = Math.max(minDepth, Math.min(projectedDepth, maxDepth));
  depth = Math.max(0, depth);

  let parentId: string | null = null;
  if (depth > 0) {
    for (let i = overIndex - 1; i >= 0; i--) {
      if (itemsWithoutActive[i].depth === depth - 1) { parentId = itemsWithoutActive[i].id; break; }
    }
  }
  return { depth, parentId };
}

/** Ξαναϋπολογίζει τους κωδικούς ιεραρχίας από τη θέση στο δέντρο: 1, 1.01, 1.02, 2… */
export function rebuildSohCodes<T extends DndNode>(tree: DndTree<T>[], prefix = ''): { id: string; sohCode: string }[] {
  const out: { id: string; sohCode: string }[] = [];
  tree.forEach((item, idx) => {
    const seg = String(idx + 1).padStart(prefix ? 2 : 1, '0');
    const soh = prefix ? `${prefix}.${seg}` : seg;
    out.push({ id: item.id, sohCode: soh });
    out.push(...rebuildSohCodes(item.children, soh));
  });
  return out;
}

/** Πλήρης θέση κάθε κόμβου μετά από μετακίνηση: κωδικός ιεραρχίας, γονέας, επίπεδο (1=κορυφή) και σειρά. */
export function flattenPositions<T extends DndNode>(
  tree: DndTree<T>[], parentId: string | null = null, prefix = '', level = 1,
): { id: string; sohCode: string; parentId: string | null; level: number; order: number }[] {
  const out: { id: string; sohCode: string; parentId: string | null; level: number; order: number }[] = [];
  tree.forEach((item, idx) => {
    const seg = String(idx + 1).padStart(prefix ? 2 : 1, '0');
    const soh = prefix ? `${prefix}.${seg}` : seg;
    out.push({ id: item.id, sohCode: soh, parentId, level, order: idx });
    out.push(...flattenPositions(item.children, item.id, soh, level + 1));
  });
  return out;
}

/** Νέο δέντρο μετά τη μετακίνηση της ενεργής σειράς κάτω/μέσα στη σειρά «over», στο προβλεπόμενο βάθος. */
export function applyMove<T extends DndNode>(
  flatItems: DndFlat<T>[], activeId: string, overId: string, projection: { depth: number; parentId: string | null },
): DndTree<T>[] {
  const tree = buildTree(flatItems as unknown as T[]);

  const removeFromTree = (items: DndTree<T>[]): DndTree<T> | null => {
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === activeId) return items.splice(i, 1)[0];
      const found = removeFromTree(items[i].children);
      if (found) return found;
    }
    return null;
  };
  const active = removeFromTree(tree);
  if (!active) return tree;

  const insertInto = (items: DndTree<T>[], parentId: string | null): boolean => {
    if (parentId === null) {
      const overIdx = items.findIndex((i) => i.id === overId);
      items.splice(overIdx >= 0 ? overIdx : items.length, 0, active);
      return true;
    }
    for (const item of items) {
      if (item.id === parentId) {
        const overIdx = item.children.findIndex((i) => i.id === overId);
        item.children.splice(overIdx >= 0 ? overIdx : item.children.length, 0, active);
        return true;
      }
      if (insertInto(item.children, parentId)) return true;
    }
    return false;
  };
  if (!insertInto(tree, projection.parentId)) tree.push(active);
  return tree;
}
