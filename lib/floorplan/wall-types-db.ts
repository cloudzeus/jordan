import 'server-only';
import type { WallType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { wallTypeInput, type WallTypeInputRaw } from './wall-types';

// Λογική βάσης του global καταλόγου τύπων κατασκευής (WallType). Καθαρά CRUD — τα δικαιώματα και το
// audit μένουν στο action (app/admin/floorplans/wall-types/actions.ts).

export class WallTypeError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const isP2002 = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
const DUP = 'Υπάρχει ήδη τύπος με αυτόν τον κωδικό.';

export function listWallTypes(): Promise<WallType[]> {
  return prisma.wallType.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
}

export async function createWallType(input: WallTypeInputRaw): Promise<WallType> {
  const data = wallTypeInput.parse(input);
  try {
    return await prisma.wallType.create({ data });
  } catch (e) {
    if (isP2002(e)) throw new WallTypeError(DUP);
    throw e;
  }
}

export async function updateWallType(id: string, input: WallTypeInputRaw): Promise<WallType> {
  const data = wallTypeInput.parse(input);
  try {
    return await prisma.wallType.update({ where: { id }, data });
  } catch (e) {
    if (isP2002(e)) throw new WallTypeError(DUP);
    throw e;
  }
}

export function setWallTypeActive(id: string, active: boolean): Promise<WallType> {
  return prisma.wallType.update({ where: { id }, data: { active } });
}

// TODO(Plan 02): απενεργοποίηση (active=false) αντί διαγραφής όταν κάποιο planData δείχνει σε αυτόν τον τύπο.
export async function deleteWallType(id: string): Promise<void> {
  await prisma.wallType.delete({ where: { id } });
}

export async function reorderWallTypes(ids: string[]): Promise<void> {
  await prisma.$transaction(ids.map((id, i) => prisma.wallType.update({ where: { id }, data: { sortOrder: (i + 1) * 10 } })));
}
