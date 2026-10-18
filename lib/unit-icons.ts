import 'server-only';
import { prisma } from '@/lib/db';
import { deleteMediaFile, isImageMime, isSvgMime, processAndUpload } from '@/lib/media';
import { generateImage } from '@/lib/ai/image-gen';
import { UnitError } from '@/lib/units';

/**
 * Εικονίδιο μονάδας μέτρησης — ΜΟΝΟ στην εφαρμογή (το SoftOne MTRUNIT δεν έχει πεδίο εικόνας, καμία
 * εγγραφή στο SoftOne). Το αρχείο μπαίνει στη βιβλιοθήκη πολυμέσων (Bunny, `MediaFile`) στον φάκελο
 * «Εικονίδια μονάδων», και η μονάδα κρατά το `iconMediaId`. Ανέβασμα ή δημιουργία με AI.
 */

export const ICON_FOLDER_NAME = 'Εικονίδια μονάδων';
export const MAX_ICON_BYTES = 5 * 1024 * 1024;
export const MAX_HINT_CHARS = 300;

/** Ελέγχει το αρχείο πριν ανέβει: μόνο εικόνα/SVG, έως 5 MB. Επιστρέφει μήνυμα σφάλματος ή null. */
export function iconFileProblem(mimeType: string, size: number): string | null {
  if (!isImageMime(mimeType) && !isSvgMime(mimeType)) return 'Δεκτές μόνο εικόνες (PNG, JPG, WebP, SVG…)';
  if (size <= 0) return 'Το αρχείο είναι κενό';
  if (size > MAX_ICON_BYTES) return 'Το εικονίδιο ξεπερνά τα 5 MB';
  return null;
}

/** Οδηγία προς το μοντέλο εικόνας: ένα καθαρό, επίπεδο εικονίδιο χωρίς κείμενο. */
export function buildUnitIconPrompt(u: { shortcut: string; name: string; interCode?: string | null }, hint?: string | null): string {
  const label = `"${u.name}" (${u.shortcut}${u.interCode ? `, international code ${u.interCode}` : ''})`;
  const extra = hint?.trim().slice(0, MAX_HINT_CHARS);
  return [
    `Minimal flat icon that represents the unit of measure ${label}, as used by a construction, interior design and building-materials company.`,
    'Show one simple, recognisable object or symbol, centered, with clean shapes and a soft, professional colour palette.',
    'Plain solid white background, square composition, generous padding.',
    'No text, no letters, no numbers, no watermark, no border.',
    extra ? `Additional guidance: ${extra}` : '',
  ].filter(Boolean).join(' ');
}

const findIconFolderId = async () =>
  (await prisma.mediaFolder.findFirst({ where: { parentId: null, name: ICON_FOLDER_NAME }, select: { id: true } }))?.id ?? null;

async function iconFolderId(): Promise<string> {
  const found = await findIconFolderId();
  if (found) return found;
  return (await prisma.mediaFolder.create({ data: { name: ICON_FOLDER_NAME }, select: { id: true } })).id;
}

async function unitOrThrow(code: number) {
  const unit = await prisma.softoneUnit.findUnique({ where: { code }, include: { iconMedia: { select: { id: true, folderId: true } } } });
  if (!unit) throw new UnitError('Η μονάδα δεν υπάρχει', 404);
  return unit;
}

/** Σβήνει το παλιό αρχείο μόνο αν ανήκει στον φάκελο εικονιδίων και δεν το χρησιμοποιεί άλλη μονάδα. */
async function dropOldIcon(old: { id: string; folderId: string | null } | null, folderId: string | null) {
  if (!old || !folderId || old.folderId !== folderId) return;
  const stillUsed = await prisma.softoneUnit.count({ where: { iconMediaId: old.id } });
  if (stillUsed > 0) return;
  await deleteMediaFile(old.id).catch((e) => console.warn('[unit-icons] διαγραφή παλιού εικονιδίου απέτυχε', e));
}

export async function setUnitIcon(code: number, file: { buffer: Buffer; name: string; mimeType: string }, userId?: string | null) {
  const problem = iconFileProblem(file.mimeType, file.buffer.byteLength);
  if (problem) throw new UnitError(problem);
  const unit = await unitOrThrow(code);
  const folderId = await iconFolderId();
  const uploaded = await processAndUpload({ buffer: file.buffer, originalName: file.name, mimeType: file.mimeType, folderId, uploadedById: userId ?? null });
  await prisma.softoneUnit.update({ where: { code }, data: { iconMediaId: uploaded.id } });
  await dropOldIcon(unit.iconMedia, folderId);
  return { iconUrl: uploaded.publicUrl, mediaId: uploaded.id };
}

export async function generateUnitIcon(code: number, hint: string | null | undefined, userId?: string | null) {
  const unit = await unitOrThrow(code);
  let img;
  try {
    img = await generateImage(buildUnitIconPrompt(unit, hint), { operation: 'unit.icon', userId, refType: 'unit', refId: String(code) });
  } catch (e) {
    throw new UnitError(`Η δημιουργία με AI απέτυχε: ${(e as Error).message}`, 502);
  }
  return setUnitIcon(code, { buffer: img.buffer, name: `unit-${code}-ai.${img.mimeType.split('/')[1] ?? 'png'}`, mimeType: img.mimeType }, userId);
}

export async function removeUnitIcon(code: number) {
  const unit = await unitOrThrow(code);
  if (!unit.iconMedia) return;
  await prisma.softoneUnit.update({ where: { code }, data: { iconMediaId: null } });
  await dropOldIcon(unit.iconMedia, await findIconFolderId());
}
