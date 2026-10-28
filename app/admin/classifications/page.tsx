import { FiTag } from 'react-icons/fi';
import { requirePermission, hasPermission } from '@/lib/rbac';
import { getSetting } from '@/lib/settings';
import { listClassifications } from '@/lib/item-classifications';
import { PageHeader } from '@/components/admin/page-header';
import { ClassificationsTableClient } from './classifications-table-client';
import { ClassificationsTabs } from './classifications-tabs';
import { HierarchyTree } from '@/components/admin/hierarchy-tree';
import { RowHint } from '@/components/admin/form-kit';
import { loadItemGroupTrees, loadTraderClassTrees } from '@/lib/classification-trees';
import { loadCategoryHierarchies } from '@/lib/category-hierarchy';
import { CategoryDndTree } from '@/components/admin/category-dnd-tree';

export const dynamic = 'force-dynamic';

// Εμπορικές κατηγορίες & ομάδες ειδών/υπηρεσιών (SoftOne MTRCATEGORY / MTRGROUP), ομάδα «Operations».
export default async function ClassificationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  await requirePermission('classifications.read');
  const [{ rows, membersError }, canManage, lastSync, itemTrees, traderTrees, catHierarchies] = await Promise.all([
    listClassifications(),
    hasPermission('classifications.manage'),
    getSetting<string>('integrations.softoneClassificationsLastSync'),
    loadItemGroupTrees(),
    loadTraderClassTrees(),
    loadCategoryHierarchies(),
  ]);
  const cats = rows.filter((r) => r.kind === 'CATEGORY' && r.isActive).length;
  const groups = rows.filter((r) => r.kind === 'GROUP' && r.isActive).length;

  return (
    <div className="w-full">
      <PageHeader
        icon={<FiTag />}
        title="Κατηγορίες & ομάδες"
        description="Ιεραρχίες κατηγοριοποίησης με κωδικό ιεραρχίας — ομάδες ειδών/υπηρεσιών και εμπορικές κατηγορίες συναλλασσομένων"
        helpAnchor="classifications"
      />
      <ClassificationsTabs
        initialTab={tab === 'traders' || tab === 'registry' ? tab : 'items'}
        items={(
          <div className="space-y-3">
            <RowHint>
              Πρόταση ομάδων από τα ονόματα των ειδών και τους προμηθευτές τους. Οι ομάδες που δείχνουν «μόνο εφαρμογή» δεν έχουν
              δημιουργηθεί ακόμα στο SoftOne. Η εμπορική κατηγορία των ειδών (Εμπορεύματα, Προϊόντα…) είναι λογιστική ρύθμιση και δεν αλλάζει.
            </RowHint>
            <div className="grid gap-3 xl:grid-cols-2">{itemTrees.map((t) => <HierarchyTree key={t.key} tree={t} />)}</div>
          </div>
        )}
        traders={(
          <div className="space-y-3">
            <RowHint>
              Εμπορική κατηγορία (TRDBUSINESS) πελατών και προμηθευτών, προτεινόμενη από τον κύριο ΚΑΔ της ΑΑΔΕ. Αλλάζει από τη φόρμα του
              συναλλασσομένου. Η λογιστική κατηγορία δεν αγγίζεται.
            </RowHint>
            <div className="grid gap-3 xl:grid-cols-2">{traderTrees.map((t) => <HierarchyTree key={t.key} tree={t} />)}</div>
          </div>
        )}
        registry={(
          <div className="space-y-3">
            <RowHint>{cats} ενεργές εμπορικές κατηγορίες · {groups} ομάδες, όπως είναι σήμερα στο SoftOne. Σύρε τις κατηγορίες για αλλαγή ιεραρχίας.</RowHint>
            <div className="grid gap-3 xl:grid-cols-2">
              {catHierarchies.map((h) => <CategoryDndTree key={h.sodtype} hierarchy={h} canManage={canManage} />)}
            </div>
            <ClassificationsTableClient rows={rows} membersError={membersError} canManage={canManage} lastSync={lastSync ?? null} />
          </div>
        )}
      />
    </div>
  );
}
