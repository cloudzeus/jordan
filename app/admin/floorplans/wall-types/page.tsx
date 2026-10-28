import { BrickWall } from 'lucide-react';
import { requirePermission } from '@/lib/rbac';
import { PageHeader } from '@/components/admin/page-header';
import { listWallTypes } from '@/lib/floorplan/wall-types-db';
import { WallTypesTableClient, type WallTypeData } from './wall-types-table-client';

export const dynamic = 'force-dynamic';

// Κατάλογος τύπων κατασκευής (WallType) — global, κοινός για όλες τις κατόψεις. Δικαίωμα: floorplans.catalog.
export default async function WallTypesPage() {
  await requirePermission('floorplans.catalog');
  const rows = await listWallTypes();
  const data: WallTypeData[] = rows.map((r) => ({
    id: r.id, code: r.code, name: r.name, category: r.category, thicknessM: r.thicknessM,
    bottomM: r.bottomM, topM: r.topM, color: r.color, pattern: r.pattern,
    coreRecipeId: r.coreRecipeId, faceRecipeId: r.faceRecipeId, lengthItemMtrl: r.lengthItemMtrl,
    measureFaces: r.measureFaces, attenuationDb: r.attenuationDb, cadLayerHints: r.cadLayerHints,
    hotkey: r.hotkey, sortOrder: r.sortOrder, active: r.active,
  }));
  return (
    <div className="w-full">
      <PageHeader
        icon={<BrickWall />}
        title="Τύποι κατασκευής"
        description={`${data.length.toLocaleString('el-GR')} τύποι τοίχου & χωρισμάτων · πάχος, ύψη, υλικά και κανόνες επιμέτρησης για τις κατόψεις`}
        helpAnchor="wall-types"
      />
      <WallTypesTableClient rows={data} canManage />
    </div>
  );
}
