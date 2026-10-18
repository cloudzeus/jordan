import 'server-only';
// Γραμμές των σελίδων «Είδη» (MTRL 51) και «Υπηρεσίες» (MTRL 52): εγγραφή καθρέφτη + μικρογραφία,
// υπόλοιπα αποθηκών (μόνο είδη) και ομάδα κατηγοριοποίησης. Κοινό ώστε οι δύο σελίδες να δείχνουν
// ακριβώς τα ίδια στοιχεία.
import { prisma } from '@/lib/db';
import { primaryThumbs } from '@/lib/item-media/thumbs';
import { stockByItem } from '@/lib/item-stock';

export async function loadItemRows(kind: 'products' | 'services') {
  const isService = kind === 'services';
  const [items, thumbs, stock, groupRows] = await Promise.all([
    prisma.softoneItem.findMany({ where: { isService }, orderBy: { name: 'asc' } }),
    primaryThumbs(),
    isService ? Promise.resolve(null) : stockByItem(),
    // Ομάδα κατηγοριοποίησης ανά είδος (πρόταση ή ανατεθειμένη) — ένα ερώτημα, δείκτης στο mtrl.
    prisma.itemGroupAssignment.findMany({
      where: { groupId: { not: null } },
      select: { mtrl: true, status: true, needsReview: true, group: { select: { key: true, name: true, parent: { select: { name: true } } } } },
    }),
  ]);
  const groupOf = new Map(groupRows.map((g) => [g.mtrl, g.group ? {
    key: g.group.key, name: g.group.name, path: [g.group.parent?.name, g.group.name].filter(Boolean).join(' › '),
    status: g.status, review: g.needsReview,
  } : null]));
  return items.map((i) => ({
    ...i, thumbUrl: thumbs.get(i.mtrl) ?? null, stock: stock ? stock.get(i.mtrl) ?? {} : undefined, group: groupOf.get(i.mtrl) ?? null,
  }));
}
