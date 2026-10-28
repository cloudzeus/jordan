import { FiMap } from 'react-icons/fi';
import { getCurrentUserWithPermissions, hasPermission, requirePermission } from '@/lib/rbac';
import { listAllFloorPlans } from '@/lib/floorplan/plans';
import { listWallTypes } from '@/lib/floorplan/wall-types-db';
import { floorplanV2ForUser } from '@/lib/floorplan/feature-flag-db';
import { PageHeader } from '@/components/admin/page-header';
import { FloorPlansGallery } from './floorplans-gallery';

export const dynamic = 'force-dynamic';

// Όλες οι χαρτογραφήσεις κάτοψης (2D σχέδιο με χώρους + προβολή 3D) — έργων και πελατών — σε κάρτες,
// για να ξανανοίξουν στο εργαλείο διαστασιολόγησης. Μόνο από τη βάση της εφαρμογής.
export default async function FloorPlansPage() {
  await requirePermission('projects.read');
  const me = await getCurrentUserWithPermissions();
  const [plans, canSave, canOffer, canToggleV2, editorV2, wallTypeRows] = await Promise.all([
    listAllFloorPlans(), hasPermission('files.manage'), hasPermission('projects.manage'),
    hasPermission('system.settings'), floorplanV2ForUser(me?.id ?? null), listWallTypes(),
  ]);
  const wallTypes = wallTypeRows.filter((w) => w.active).map((w) => ({ id: w.id, code: w.code, name: w.name, color: w.color, thicknessM: w.thicknessM, hotkey: w.hotkey }));
  const m2 = plans.reduce((s, p) => s + p.floorM2, 0);
  const with3d = plans.filter((p) => p.has3d).length;
  return (
    <div className="w-full">
      <PageHeader icon={<FiMap />} title="Κατόψεις & σχέδια" helpAnchor="floorplans"
        description={`${plans.length} χαρτογραφήσεις · ${with3d} με προβολή 3D · ${m2.toLocaleString('el-GR', { maximumFractionDigits: 0 })} m² δαπέδου`} />
      <FloorPlansGallery plans={plans} canSave={canSave} canOffer={canOffer} editorV2={editorV2} canToggleV2={canToggleV2} wallTypes={wallTypes} />
    </div>
  );
}
