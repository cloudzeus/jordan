'use server';

// Server Actions του καταλόγου τύπων κατασκευής (WallType) — τα καλεί απευθείας το UI του admin.
// Κάθε action ελέγχει το δικαίωμα floorplans.catalog και επιστρέφει { ok, … } — ποτέ redirect.
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { actor, caught as caughtBase, parse, type ActionResult } from '@/lib/server-actions';
import { wallTypeInput } from '@/lib/floorplan/wall-types';
import {
  WallTypeError, listWallTypes, createWallType, updateWallType, deleteWallType, setWallTypeActive, reorderWallTypes,
} from '@/lib/floorplan/wall-types-db';
import type { WallType } from '@prisma/client';

const caught = (e: unknown) => caughtBase(e, 'wall-types', [WallTypeError]);
const PATH = '/admin/floorplans/wall-types';

export async function listWallTypesAction(): Promise<ActionResult<WallType[]>> {
  const a = await actor('floorplans.catalog');
  if ('error' in a) return a.error;
  return { ok: true, data: await listWallTypes() };
}

/** Νέος τύπος (id = null) ή πλήρης ενημέρωση υπάρχοντος. */
export async function saveWallTypeAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  const a = await actor('floorplans.catalog');
  if ('error' in a) return a.error;
  const p = parse(wallTypeInput, input);
  if ('error' in p) return p.error;
  try {
    const r = id ? await updateWallType(id, p.data) : await createWallType(p.data);
    await logAudit({
      userId: a.user.id, userEmail: a.user.email, action: id ? 'wall_type.update' : 'wall_type.create',
      resource: 'wall_type', resourceId: r.id, metadata: { code: p.data.code, name: p.data.name },
    }).catch(() => null);
    revalidatePath(PATH);
    return { ok: true, data: { id: r.id } };
  } catch (e) {
    return caught(e);
  }
}

export async function setWallTypeActiveAction(id: string, active: boolean): Promise<ActionResult> {
  const a = await actor('floorplans.catalog');
  if ('error' in a) return a.error;
  try {
    await setWallTypeActive(id, active);
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'wall_type.active', resource: 'wall_type', resourceId: id, metadata: { active } }).catch(() => null);
    revalidatePath(PATH);
    return { ok: true, data: undefined };
  } catch (e) {
    return caught(e);
  }
}

export async function deleteWallTypeAction(id: string): Promise<ActionResult> {
  const a = await actor('floorplans.catalog');
  if ('error' in a) return a.error;
  try {
    await deleteWallType(id);
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'wall_type.delete', resource: 'wall_type', resourceId: id }).catch(() => null);
    revalidatePath(PATH);
    return { ok: true, data: undefined };
  } catch (e) {
    return caught(e);
  }
}

export async function reorderWallTypesAction(ids: string[]): Promise<ActionResult> {
  const a = await actor('floorplans.catalog');
  if ('error' in a) return a.error;
  try {
    await reorderWallTypes(ids);
    revalidatePath(PATH);
    return { ok: true, data: undefined };
  } catch (e) {
    return caught(e);
  }
}
