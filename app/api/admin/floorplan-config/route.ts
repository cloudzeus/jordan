import { NextResponse } from 'next/server';
import { getCurrentUserWithPermissions, requirePermission } from '@/lib/rbac';
import { listWallTypes } from '@/lib/floorplan/wall-types-db';
import { floorplanV2ForUser } from '@/lib/floorplan/feature-flag-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Config του editor κατόψεων ανά ΧΡΗΣΤΗ (flag v2 + κατάλογος τύπων τοίχου) — ανεξάρτητο από τον owner,
// ώστε ο FloorPlanDialog να παίρνει τον v2 editor + AI ΑΠΟ ΠΑΝΤΟΥ (όχι μόνο από τη σελίδα «Κατόψεις»).
export async function GET() {
  await requirePermission('projects.read');
  const me = await getCurrentUserWithPermissions();
  const [editorV2, rows] = await Promise.all([floorplanV2ForUser(me?.id ?? null), listWallTypes()]);
  const wallTypes = rows.filter((w) => w.active).map((w) => ({ id: w.id, code: w.code, name: w.name, color: w.color, thicknessM: w.thicknessM, hotkey: w.hotkey }));
  return NextResponse.json({ editorV2, wallTypes });
}
