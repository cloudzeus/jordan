// lib/entity-files/service.ts — φάκελοι & αρχεία πελατών/προμηθευτών/έργων στο Bunny (ιδιωτικά).
// Το storage key ΔΕΝ φεύγει ποτέ προς τον browser: λήψη μόνο μέσω /api/admin/entity-files/file/[id].
import { customAlphabet } from 'nanoid';
import { prisma } from '@/lib/db';
import { bunnyDelete, bunnyDownload, bunnyUploadPrivate } from '@/lib/bunny';
import {
  EntityFileError, buildBasePath, buildFileKey, subfolderPrefix, cleanSubfolder, renameKeepingExt, typeOfExt, validateUpload,
  type EntityType, type FileFamily,
} from './core';

const unique = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);

export interface EntityFileDTO {
  id: string;
  name: string;
  ext: string;
  family: FileFamily;
  size: number;
  subfolder: string;
  notes: string | null;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EntityFolderDTO {
  type: EntityType;
  id: number;
  code: string;
  name: string;
  basePath: string;
  subfolders: string[];
  files: EntityFileDTO[];
}

type FileRow = Awaited<ReturnType<typeof prisma.entityFile.findFirstOrThrow>>;

function toDTO(f: FileRow): EntityFileDTO {
  return {
    id: f.id, name: f.name, ext: f.ext, family: typeOfExt(f.ext)?.family ?? 'pdf', size: f.size,
    subfolder: f.subfolder, notes: f.notes, uploadedBy: f.uploadedBy,
    createdAt: f.createdAt.toISOString(), updatedAt: f.updatedAt.toISOString(),
  };
}

/** Κωδικός + όνομα από τον καθρέφτη του SoftOne (μόνο για τη ΔΗΜΙΟΥΡΓΙΑ της διαδρομής). */
async function entityInfo(type: EntityType, id: number): Promise<{ code: string; name: string } | null> {
  if (type === 'TRADER') return prisma.softoneTrader.findUnique({ where: { trdr: id }, select: { code: true, name: true } });
  return prisma.softoneProject.findUnique({ where: { prjc: id }, select: { code: true, name: true } });
}

/** Ο φάκελος της οντότητας — δημιουργείται (DB + Bunny) την πρώτη φορά, μετά μένει ίδιος. */
export async function ensureFolder(type: EntityType, id: number) {
  const existing = await prisma.entityFolder.findUnique({ where: { entityType_entityId: { entityType: type, entityId: id } } });
  if (existing) return existing;
  const info = await entityInfo(type, id);
  if (!info) throw new EntityFileError(type === 'TRADER' ? 'Ο συναλλασσόμενος δεν βρέθηκε.' : 'Το έργο δεν βρέθηκε.', 404);
  const base = buildBasePath(type, id, info.code, info.name);
  let folder;
  try {
    folder = await prisma.entityFolder.create({ data: { entityType: type, entityId: id, basePath: base } });
  } catch {
    // ταυτόχρονο πρώτο άνοιγμα από δύο καρτέλες → ο άλλος πρόλαβε
    folder = await prisma.entityFolder.findUnique({ where: { entityType_entityId: { entityType: type, entityId: id } } });
    if (!folder) throw new EntityFileError('Δεν δημιουργήθηκε ο φάκελος.', 500);
    return folder;
  }
  await bunnyMarker(`${folder.basePath}/`);
  return folder;
}

/** Κενό αντικείμενο `…/` = φάκελος ορατός στο Bunny πριν μπει αρχείο. Αποτυχία δεν μπλοκάρει. */
async function bunnyMarker(key: string) {
  await bunnyUploadPrivate({ key, body: Buffer.alloc(0), contentType: 'application/x-directory' }).catch(() => null);
}

async function folderDTO(type: EntityType, id: number, folder: { basePath: string; subfolders: string[]; id: string } | null, info: { code: string; name: string }): Promise<EntityFolderDTO> {
  const files = folder ? await prisma.entityFile.findMany({ where: { folderId: folder.id }, orderBy: [{ subfolder: 'asc' }, { createdAt: 'desc' }] }) : [];
  return { type, id, code: info.code, name: info.name, basePath: folder?.basePath ?? '', subfolders: [...new Set(folder?.subfolders ?? [])], files: files.map(toDTO) };
}

/** Τα αρχεία μιας οντότητας. Για πελάτη/προμηθευτή, ΚΑΙ οι φάκελοι των έργων του (πελάτης ή προμηθευτής έργου). */
export async function listEntityFiles(type: EntityType, id: number): Promise<{ folder: EntityFolderDTO; projects: (EntityFolderDTO & { role: 'customer' | 'supplier' })[] }> {
  const folder = await ensureFolder(type, id);
  const info = (await entityInfo(type, id)) ?? { code: '', name: '' };
  const own = await folderDTO(type, id, folder, info);
  if (type !== 'TRADER') return { folder: own, projects: [] };

  const projects = await prisma.softoneProject.findMany({
    where: { OR: [{ trdr: id }, { trdrSu: id }] },
    select: { prjc: true, code: true, name: true, trdr: true },
    orderBy: [{ isActive: 'desc' }, { code: 'desc' }],
  });
  const folders = await prisma.entityFolder.findMany({ where: { entityType: 'PROJECT', entityId: { in: projects.map((p) => p.prjc) } } });
  const byPrjc = new Map(folders.map((f) => [f.entityId, f]));
  const out = await Promise.all(projects.map(async (p) => ({
    ...(await folderDTO('PROJECT', p.prjc, byPrjc.get(p.prjc) ?? null, p)),
    role: (p.trdr === id ? 'customer' : 'supplier') as 'customer' | 'supplier',
  })));
  return { folder: own, projects: out };
}

export async function uploadEntityFile(opts: {
  type: EntityType; id: number; buffer: Buffer; name: string; subfolder?: string; notes?: string | null;
  user: { id: string; name: string | null; email: string };
}): Promise<EntityFileDTO> {
  const fileType = validateUpload(opts.name, opts.buffer);
  const folder = await ensureFolder(opts.type, opts.id);
  const sub = cleanSubfolder(opts.subfolder ?? '');
  if (sub && !folder.subfolders.includes(sub)) {
    // Ατομικά: παράλληλα ανεβάσματα στον ίδιο νέο φάκελο (π.χ. αποθήκευση κάτοψης) δεν τον προσθέτουν δύο φορές.
    await prisma.$executeRaw`UPDATE "EntityFolder" SET "subfolders" = array_append("subfolders", ${sub}) WHERE "id" = ${folder.id} AND NOT (${sub} = ANY("subfolders"))`;
  }
  const key = buildFileKey(folder.basePath, sub, opts.name, fileType.ext, unique());
  await bunnyUploadPrivate({ key, body: opts.buffer, contentType: fileType.mime });
  const displayName = renameKeepingExt(opts.name.replace(/^.*[\\/]/, ''), fileType.ext);
  const row = await prisma.entityFile.create({
    data: {
      folderId: folder.id, subfolder: sub, name: displayName, originalName: opts.name, ext: fileType.ext,
      mimeType: fileType.mime, size: opts.buffer.byteLength, storageKey: key,
      notes: opts.notes?.trim() || null, uploadedById: opts.user.id, uploadedBy: opts.user.name || opts.user.email,
    },
  });
  return toDTO(row);
}

/** Για λήψη: το αρχείο + το κλειδί (μόνο server-side). */
export async function getEntityFile(fileId: string) {
  return prisma.entityFile.findUnique({ where: { id: fileId }, include: { folder: { select: { entityType: true, entityId: true } } } });
}

export async function updateEntityFile(fileId: string, patch: { name?: string; notes?: string | null; subfolder?: string }): Promise<EntityFileDTO> {
  const f = await prisma.entityFile.findUnique({ where: { id: fileId }, include: { folder: true } });
  if (!f) throw new EntityFileError('Το αρχείο δεν βρέθηκε.', 404);
  const data: { name?: string; notes?: string | null; subfolder?: string; storageKey?: string } = {};
  if (patch.name !== undefined) data.name = renameKeepingExt(patch.name, f.ext);
  if (patch.notes !== undefined) data.notes = patch.notes?.trim() || null;
  let movedFrom: string | null = null;
  if (patch.subfolder !== undefined) {
    const sub = cleanSubfolder(patch.subfolder);
    if (sub && !f.folder.subfolders.includes(sub)) throw new EntityFileError('Ο φάκελος δεν υπάρχει.', 404);
    if (sub !== f.subfolder) {
      // Μετακίνηση και ΣΤΟ Bunny, ώστε το δέντρο εκεί να ταιριάζει με ό,τι βλέπει ο χρήστης. Νέο κλειδί
      // (τα κλειδιά δεν ξαναγράφονται ποτέ — βλ. serve-file), μετά σβήνεται το παλιό.
      const key = buildFileKey(f.folder.basePath, sub, f.name, f.ext, unique());
      await bunnyUploadPrivate({ key, body: await bunnyDownload(f.storageKey), contentType: f.mimeType });
      data.storageKey = key;
      movedFrom = f.storageKey;
    }
    data.subfolder = sub;
  }
  const row = await prisma.entityFile.update({ where: { id: fileId }, data });
  if (movedFrom) await bunnyDelete([movedFrom]).catch(() => null);
  return toDTO(row);
}

export async function deleteEntityFile(fileId: string) {
  const f = await prisma.entityFile.findUnique({ where: { id: fileId } });
  if (!f) throw new EntityFileError('Το αρχείο δεν βρέθηκε.', 404);
  await bunnyDelete([f.storageKey]);
  await prisma.entityFile.delete({ where: { id: fileId } });
  return f;
}

export async function createSubfolder(type: EntityType, id: number, name: string) {
  const sub = cleanSubfolder(name);
  if (!sub) throw new EntityFileError('Δώστε όνομα φακέλου.');
  const folder = await ensureFolder(type, id);
  if (folder.subfolders.some((s) => s.toLocaleLowerCase('el') === sub.toLocaleLowerCase('el'))) throw new EntityFileError(`Υπάρχει ήδη φάκελος «${sub}».`, 409);
  await prisma.entityFolder.update({ where: { id: folder.id }, data: { subfolders: { push: sub } } });
  await bunnyMarker(subfolderPrefix(folder.basePath, sub));
  return sub;
}

export async function deleteSubfolder(type: EntityType, id: number, name: string) {
  const folder = await ensureFolder(type, id);
  const sub = cleanSubfolder(name);
  if (!folder.subfolders.includes(sub)) throw new EntityFileError('Ο φάκελος δεν υπάρχει.', 404);
  const n = await prisma.entityFile.count({ where: { folderId: folder.id, subfolder: sub } });
  if (n > 0) throw new EntityFileError(`Ο φάκελος «${sub}» έχει ${n} αρχεία — μετακινήστε ή διαγράψτε τα πρώτα.`, 409);
  await prisma.entityFolder.update({ where: { id: folder.id }, data: { subfolders: folder.subfolders.filter((s) => s !== sub) } });
  await bunnyDelete([subfolderPrefix(folder.basePath, sub)]).catch(() => null);
}
