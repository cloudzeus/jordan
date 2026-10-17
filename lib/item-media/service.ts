import 'server-only';
import path from 'node:path';
import { customAlphabet } from 'nanoid';
import type { ItemMedia, ItemMediaKind, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { bunnyDelete, bunnyDownload, bunnyUpload } from '@/lib/bunny';
import { normalizeOriginal, renderPanorama, renderSquare, thumbnail } from './render';
import { DEFAULT_TRANSFORM, normalizeTransform, type ImageTransform } from './transform';

export class ItemMediaError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/** Όρια ανά τύπο — τα βίντεο είναι εκ φύσεως μεγάλα, οι φωτογραφίες όχι. */
export const LIMITS: Record<ItemMediaKind, { bytes: number; mimes: RegExp; label: string }> = {
  IMAGE: { bytes: 40 * 1024 * 1024, mimes: /^image\/(jpeg|png|webp|avif|tiff|heic|heif|gif|bmp)$/, label: 'φωτογραφία' },
  PANORAMA: { bytes: 80 * 1024 * 1024, mimes: /^image\/(jpeg|png|webp|avif|tiff)$/, label: 'πανόραμα 360°' },
  VIDEO: { bytes: 500 * 1024 * 1024, mimes: /^video\/(mp4|webm|quicktime)$/, label: 'βίντεο' },
};

const id8 = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);
// Ελληνικά → λατινικά για τα κλειδιά του CDN (αλλιώς «πλακάκι-1» γινόταν σκέτο «1»).
const GR: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n',
  ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
};
const safe = (name: string) =>
  (path.parse(name).name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[α-ω]/g, (c) => GR[c] ?? c)
    .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'file').slice(0, 60);
/** Καθαρισμός CDN που δεν σταματά τη ροή — αλλά ΚΑΤΑΓΡΑΦΕΙ ό,τι δεν σβήστηκε. */
const quietDelete = (keys: (string | null | undefined)[]) =>
  bunnyDelete(keys.filter((k): k is string => !!k)).catch((e) => console.warn('[item-media]', (e as Error).message));
const keyFor = (mtrl: number, folder: string, base: string, ext: string) => `items/${mtrl}/${folder}/${base}-${id8()}.${ext}`;

export type ItemMediaDTO = {
  id: string;
  kind: ItemMediaKind;
  url: string;
  thumbUrl: string | null;
  originalUrl: string | null;
  originalWidth: number | null;
  originalHeight: number | null;
  name: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  transform: ImageTransform | null;
  isPrimary: boolean;
  order: number;
  createdAt: string;
};

export const toDTO = (m: ItemMedia): ItemMediaDTO => ({
  id: m.id, kind: m.kind, url: m.publicUrl, thumbUrl: m.thumbUrl, originalUrl: m.originalUrl,
  originalWidth: m.originalWidth, originalHeight: m.originalHeight, name: m.originalName,
  mimeType: m.mimeType, size: m.size, width: m.width, height: m.height,
  transform: m.kind === 'IMAGE' ? normalizeTransform(m.transform) : null,
  isPrimary: m.isPrimary, order: m.order, createdAt: m.createdAt.toISOString(),
});

export async function listItemMedia(mtrl: number): Promise<ItemMediaDTO[]> {
  const rows = await prisma.itemMedia.findMany({ where: { mtrl }, orderBy: [{ kind: 'asc' }, { isPrimary: 'desc' }, { order: 'asc' }, { createdAt: 'asc' }] });
  return rows.map(toDTO);
}

/** Το είδος πρέπει να υπάρχει στον καθρέφτη — δεν δεχόμαστε αρχεία για ανύπαρκτο MTRL. */
async function assertItem(mtrl: number) {
  const item = await prisma.softoneItem.findUnique({ where: { mtrl }, select: { mtrl: true } });
  if (!item) throw new ItemMediaError('Το είδος δεν βρέθηκε στο μητρώο', 404);
}

async function nextOrder(mtrl: number, kind: ItemMediaKind) {
  const last = await prisma.itemMedia.aggregate({ where: { mtrl, kind }, _max: { order: true } });
  return (last._max.order ?? -1) + 1;
}

export async function uploadItemMedia(input: {
  mtrl: number; kind: ItemMediaKind; buffer: Buffer; name: string; mimeType: string; userId: string | null;
}): Promise<ItemMediaDTO> {
  const { mtrl, kind, buffer, name, userId } = input;
  const mime = (input.mimeType || '').toLowerCase();
  const lim = LIMITS[kind];
  if (!lim.mimes.test(mime)) throw new ItemMediaError(`Μη αποδεκτός τύπος αρχείου για ${lim.label} (${mime || 'άγνωστος'}).`, 415);
  if (buffer.byteLength > lim.bytes) throw new ItemMediaError(`Το αρχείο ξεπερνά το όριο για ${lim.label} (${Math.round(lim.bytes / 1048576)} MB).`, 413);
  await assertItem(mtrl);

  const base = safe(name);
  const uploaded: string[] = [];
  const put = async (key: string, body: Buffer, contentType: string) => {
    const r = await bunnyUpload({ key, body, contentType });
    uploaded.push(key);
    return r.publicUrl;
  };

  try {
    let data: Prisma.ItemMediaCreateInput;
    if (kind === 'IMAGE') {
      const orig = await normalizeOriginal(buffer).catch(() => { throw new ItemMediaError('Η εικόνα δεν διαβάζεται (κατεστραμμένο ή μη υποστηριζόμενο αρχείο).', 422); });
      const square = await renderSquare(orig.data, DEFAULT_TRANSFORM);
      const thumb = await thumbnail(square, 'square');
      const originalKey = keyFor(mtrl, 'originals', base, 'webp');
      const storageKey = keyFor(mtrl, 'images', base, 'webp');
      const thumbKey = keyFor(mtrl, 'thumbs', base, 'webp');
      const [originalUrl, publicUrl, thumbUrl] = await Promise.all([
        put(originalKey, orig.data, 'image/webp'), put(storageKey, square, 'image/webp'), put(thumbKey, thumb, 'image/webp'),
      ]);
      data = {
        mtrl, kind, storageKey, publicUrl, thumbKey, thumbUrl, originalKey, originalUrl,
        originalWidth: orig.width, originalHeight: orig.height, originalName: name, mimeType: 'image/webp',
        size: square.byteLength, width: 1920, height: 1920, transform: DEFAULT_TRANSFORM,
      };
    } else if (kind === 'PANORAMA') {
      const pano = await renderPanorama(buffer).catch(() => { throw new ItemMediaError('Το πανόραμα δεν διαβάζεται.', 422); });
      if (Math.abs(pano.width / pano.height - 2) > 0.15) {
        throw new ItemMediaError(`Το πανόραμα 360° πρέπει να έχει αναλογία 2:1 (equirectangular) — αυτό είναι ${pano.width}×${pano.height}.`, 422);
      }
      const thumb = await thumbnail(pano.data, 'panorama');
      const storageKey = keyFor(mtrl, 'panoramas', base, 'webp');
      const thumbKey = keyFor(mtrl, 'thumbs', base, 'webp');
      const [publicUrl, thumbUrl] = await Promise.all([put(storageKey, pano.data, 'image/webp'), put(thumbKey, thumb, 'image/webp')]);
      data = {
        mtrl, kind, storageKey, publicUrl, thumbKey, thumbUrl, originalName: name, mimeType: 'image/webp',
        size: pano.data.byteLength, width: pano.width, height: pano.height,
      };
    } else {
      const ext = mime === 'video/webm' ? 'webm' : mime === 'video/quicktime' ? 'mov' : 'mp4';
      const storageKey = keyFor(mtrl, 'videos', base, ext);
      const publicUrl = await put(storageKey, buffer, mime);
      data = { mtrl, kind, storageKey, publicUrl, originalName: name, mimeType: mime, size: buffer.byteLength };
    }

    // Η ΠΡΩΤΗ φωτογραφία ενός είδους γίνεται αυτόματα κύρια.
    const row = await prisma.$transaction(async (tx) => {
      const order = await nextOrder(mtrl, kind);
      const hasPrimary = kind === 'IMAGE' ? await tx.itemMedia.count({ where: { mtrl, kind: 'IMAGE', isPrimary: true } }) : 1;
      return tx.itemMedia.create({ data: { ...data, order, isPrimary: hasPrimary === 0, uploadedById: userId } });
    });
    return toDTO(row);
  } catch (e) {
    // Ό,τι ανέβηκε πριν την αποτυχία σβήνεται — δεν αφήνουμε ορφανά αρχεία στο CDN.
    await quietDelete(uploaded);
    throw e;
  }
}

async function getOwned(mtrl: number, id: string) {
  const m = await prisma.itemMedia.findUnique({ where: { id } });
  if (!m || m.mtrl !== mtrl) throw new ItemMediaError('Το αρχείο δεν βρέθηκε', 404);
  return m;
}

export async function setPrimary(mtrl: number, id: string): Promise<void> {
  const m = await getOwned(mtrl, id);
  if (m.kind !== 'IMAGE') throw new ItemMediaError('Κύρια μπορεί να είναι μόνο φωτογραφία.');
  await prisma.$transaction([
    prisma.itemMedia.updateMany({ where: { mtrl, kind: 'IMAGE', isPrimary: true }, data: { isPrimary: false } }),
    prisma.itemMedia.update({ where: { id }, data: { isPrimary: true } }),
  ]);
}

/** Νέα παραγωγή του τετραγώνου από το ΠΡΩΤΟΤΥΠΟ με νέο μετασχηματισμό. Νέο κλειδί → καμία παλιά cache CDN. */
export async function rerenderImage(mtrl: number, id: string, t: unknown): Promise<ItemMediaDTO> {
  const m = await getOwned(mtrl, id);
  if (m.kind !== 'IMAGE' || !m.originalKey) throw new ItemMediaError('Επεξεργασία γίνεται μόνο σε φωτογραφίες.');
  const transform = normalizeTransform(t);
  const original = await bunnyDownload(m.originalKey);
  const square = await renderSquare(original, transform);
  const thumb = await thumbnail(square, 'square');
  const base = safe(m.originalName);
  const storageKey = keyFor(mtrl, 'images', base, 'webp');
  const thumbKey = keyFor(mtrl, 'thumbs', base, 'webp');
  const [a, b] = await Promise.all([
    bunnyUpload({ key: storageKey, body: square, contentType: 'image/webp' }),
    bunnyUpload({ key: thumbKey, body: thumb, contentType: 'image/webp' }),
  ]);
  const row = await prisma.itemMedia.update({
    where: { id },
    data: { storageKey, publicUrl: a.publicUrl, thumbKey, thumbUrl: b.publicUrl, size: square.byteLength, transform },
  });
  await quietDelete([m.storageKey, m.thumbKey]);
  return toDTO(row);
}

/** Νέα σειρά για ΕΝΑΝ τύπο: τα ids με τη σειρά που θέλει ο χρήστης. */
export async function reorderMedia(mtrl: number, kind: ItemMediaKind, ids: string[]): Promise<void> {
  const rows = await prisma.itemMedia.findMany({ where: { mtrl, kind }, select: { id: true } });
  const owned = new Set(rows.map((r) => r.id));
  if (ids.length !== owned.size || ids.some((i) => !owned.has(i))) throw new ItemMediaError('Η λίστα δεν αντιστοιχεί στα αρχεία του είδους.');
  await prisma.$transaction(ids.map((id, order) => prisma.itemMedia.update({ where: { id }, data: { order } })));
}

export async function deleteMedia(mtrl: number, id: string): Promise<ItemMedia> {
  const m = await getOwned(mtrl, id);
  await prisma.$transaction(async (tx) => {
    await tx.itemMedia.delete({ where: { id } });
    // Σβήστηκε η κύρια ⇒ κύρια γίνεται η επόμενη στη σειρά (αν υπάρχει).
    if (m.isPrimary) {
      const next = await tx.itemMedia.findFirst({ where: { mtrl, kind: 'IMAGE' }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
      if (next) await tx.itemMedia.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
  });
  await quietDelete([m.storageKey, m.thumbKey, m.originalKey]);
  return m;
}
