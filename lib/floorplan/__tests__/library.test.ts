import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, files } = vi.hoisted(() => ({
  db: { floorPlan: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() }, softoneProject: { findUnique: vi.fn() } },
  files: { getEntityFile: vi.fn(), uploadEntityFile: vi.fn(), deleteEntityFile: vi.fn() },
}));
vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('@/lib/bunny', () => ({ bunnyDownload: vi.fn().mockResolvedValue(Buffer.from('image')) }));
vi.mock('@/lib/entity-files/service', () => files);
import { copyLibraryPlanToProject, listFloorPlans, ownsPlan } from '../plans';
import { planData } from '../saved';

const data = planData.parse({ v: 1, w: 100, h: 100, calib: { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, meters: 1 }, rooms: [{ id: 'r1', name: 'Κουζίνα', color: '#fff', polygon: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }], areaPx: 1200, perimeterPx: 140 }] });
const source = { id: 'library-plan', prjc: null, trdr: null, prospectId: null, title: 'Ισόγειο', source: 'plan.pdf', data, imageFileId: 'image', annotatedFileId: 'annotation', sourceFileId: 'original' };
const user = { id: 'u1', name: 'User', email: 'user@example.com' };
beforeEach(() => {
  vi.clearAllMocks();
  db.floorPlan.findUnique.mockResolvedValue(structuredClone(source));
  db.softoneProject.findUnique.mockResolvedValue({ trdr: 22 });
  db.floorPlan.create.mockResolvedValue({ id: 'copy' });
  files.getEntityFile.mockImplementation(async (id) => ({ id, name: `${id}.png`, storageKey: id }));
  files.uploadEntityFile.mockImplementation(async ({ name }) => ({ id: `new-${name}` }));
  files.deleteEntityFile.mockResolvedValue(undefined);
});

describe('floor plan library', () => {
  it('distinguishes library plans from customer and project plans', () => {
    expect(ownsPlan({ kind: 'library' }, source)).toBe(true);
    expect(ownsPlan({ kind: 'library' }, { ...source, trdr: 2 })).toBe(false);
    expect(ownsPlan({ kind: 'library' }, { ...source, prospectId: 2 })).toBe(false);
    expect(ownsPlan({ kind: 'project', prjc: 1 }, source)).toBe(false);
  });
  it('lists only independent plans', async () => {
    db.floorPlan.findMany.mockResolvedValue([]);
    await listFloorPlans({ kind: 'library' });
    expect(db.floorPlan.findMany.mock.calls[0][0].where).toEqual({ prjc: null, trdr: null, prospectId: null });
  });
  it('copies all files and measured data without modifying the source', async () => {
    await expect(copyLibraryPlanToProject(source.id, 10, user)).resolves.toEqual({ id: 'copy' });
    const saved = db.floorPlan.create.mock.calls[0][0].data;
    expect(saved).toMatchObject({ prjc: 10, trdr: 22, imageFileId: 'new-image.png', annotatedFileId: 'new-annotation.png', sourceFileId: 'new-original.png', roomCount: 1 });
    expect(saved.floorM2).toBeCloseTo(12);
    expect(saved.data.rooms[0].name).toBe('Κουζίνα');
    expect(files.deleteEntityFile).not.toHaveBeenCalled();
  });
  it('rejects unfinished measurements before uploading files', async () => {
    db.floorPlan.findUnique.mockResolvedValue({ ...source, data: { ...data, calib: null } });
    await expect(copyLibraryPlanToProject(source.id, 10, user)).rejects.toThrow('επιμετρήσεις');
    expect(files.uploadEntityFile).not.toHaveBeenCalled();
  });
  it('rejects plans already owned by another project', async () => {
    db.floorPlan.findUnique.mockResolvedValue({ ...source, prjc: 9 });
    await expect(copyLibraryPlanToProject(source.id, 10, user)).rejects.toThrow('βιβλιοθήκη');
    expect(files.uploadEntityFile).not.toHaveBeenCalled();
  });
  it('cleans up newly copied files on a database failure', async () => {
    db.floorPlan.create.mockRejectedValueOnce(new Error('database failure'));
    await expect(copyLibraryPlanToProject(source.id, 10, user)).rejects.toThrow('database failure');
    expect(files.deleteEntityFile.mock.calls.map((c) => c[0])).toEqual(['new-image.png', 'new-annotation.png', 'new-original.png']);
  });
});
