import 'server-only';
import { prisma } from '@/lib/db';
import { classificationMembers } from '@/lib/item-classifications';

export interface CatHierarchyNode {
  id: string;
  sodtype: number;
  code: number;
  shortCode: string | null;
  name: string;
  sohCode: string;
  isActive: boolean;
  itemCount: number;
}

export interface CatHierarchy {
  sodtype: number;
  label: string;
  nodes: CatHierarchyNode[];
}

export async function loadCategoryHierarchies(): Promise<CatHierarchy[]> {
  const [rows, members] = await Promise.all([
    prisma.softoneClassification.findMany({
      where: { kind: 'CATEGORY', isActive: true },
      orderBy: { code: 'asc' },
    }),
    classificationMembers().catch(() => null),
  ]);
  const counts = new Map<string, number>();
  if (members) {
    for (const m of members) {
      if (m.category != null) {
        const k = `${m.sodtype}:${m.category}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
  }
  const bySoh = (a: CatHierarchyNode, b: CatHierarchyNode) => {
    const sa = a.sohCode.split('.').map(Number);
    const sb = b.sohCode.split('.').map(Number);
    for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
      const diff = (sa[i] ?? 0) - (sb[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  };
  const build = (sodtype: number, label: string): CatHierarchy => {
    let nextAuto = 1;
    const used = new Set<string>();
    const nodes: CatHierarchyNode[] = rows
      .filter((r) => r.sodtype === sodtype)
      .map((r) => {
        const soh = r.sohCode?.trim() || '';
        if (soh) used.add(soh);
        return {
          id: `${r.sodtype}:${r.code}`,
          sodtype: r.sodtype,
          code: r.code,
          shortCode: r.shortCode,
          name: r.name,
          sohCode: soh,
          isActive: r.isActive,
          itemCount: counts.get(`${r.sodtype}:${r.code}`) ?? 0,
        };
      });
    for (const n of nodes) {
      if (!n.sohCode) {
        while (used.has(String(nextAuto))) nextAuto++;
        n.sohCode = String(nextAuto++);
        used.add(n.sohCode);
      }
    }
    nodes.sort(bySoh);
    return { sodtype, label, nodes };
  };
  return [build(51, 'Κατηγορίες ειδών'), build(52, 'Κατηγορίες υπηρεσιών')];
}
