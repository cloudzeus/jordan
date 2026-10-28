'use server';

// Toggle του feature flag «Editor κατόψεων v2» (AppSetting floorplan.v2) — μόνο ρόλος με system.settings.
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { actor, parse, caught as caughtBase, type ActionResult } from '@/lib/server-actions';
import { setSetting } from '@/lib/settings';
import { floorplanV2Config, FLOORPLAN_V2_KEY } from '@/lib/floorplan/feature-flag';

const caught = (e: unknown) => caughtBase(e, 'floorplan-v2-flag', []);

export async function setFloorplanV2Action(input: unknown): Promise<ActionResult> {
  const a = await actor('system.settings');
  if ('error' in a) return a.error;
  const p = parse(floorplanV2Config, input);
  if ('error' in p) return p.error;
  try {
    await setSetting(FLOORPLAN_V2_KEY, p.data, a.user.id);
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'floorplan.v2.flag', resource: 'app_setting', resourceId: FLOORPLAN_V2_KEY, metadata: p.data }).catch(() => null);
    revalidatePath('/admin/floorplans');
    return { ok: true, data: undefined };
  } catch (e) {
    return caught(e);
  }
}
