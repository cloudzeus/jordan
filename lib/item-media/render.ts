import 'server-only';
import sharp from 'sharp';
import { CANVAS, placement, type ImageTransform } from './transform';

export const WEBP_QUALITY = 82;
/** Το πρωτότυπο κρατιέται σε υψηλή ποιότητα (για επανεπεξεργασία), αλλά όχι σε άπειρη ανάλυση. */
const ORIGINAL_MAX = 4096;
const ORIGINAL_QUALITY = 92;
const PANORAMA_MAX_W = 8192; // όριο WebP: 16383 — 8K αρκεί για πανόραμα και κρατά λογικό μέγεθος
const THUMB = 480;

/**
 * Κανονικοποίηση πρωτοτύπου: εφαρμογή EXIF προσανατολισμού (αλλιώς οι φωτογραφίες κινητού
 * έρχονται «ξαπλωμένες»), όριο 4096px, WebP υψηλής ποιότητας. Από ΑΥΤΟ παράγονται όλα τα υπόλοιπα.
 */
export async function normalizeOriginal(input: Buffer) {
  const { data, info } = await sharp(input, { failOn: 'error' })
    .rotate()
    .resize({ width: ORIGINAL_MAX, height: ORIGINAL_MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: ORIGINAL_QUALITY })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Το τετράγωνο 1920×1920 WebP από το (κανονικοποιημένο) πρωτότυπο και τον μετασχηματισμό. */
export async function renderSquare(original: Buffer, t: ImageTransform): Promise<Buffer> {
  const rotated = t.rotate
    ? await sharp(original).rotate(t.rotate).toBuffer({ resolveWithObject: true })
    : await sharp(original).toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = rotated.info;
  // Το placement δουλεύει με τις ΑΡΧΙΚΕΣ διαστάσεις και την περιστροφή· εδώ η εικόνα είναι ήδη
  // περιστραμμένη, οπότε περνάμε rotate 0 με τις περιστραμμένες διαστάσεις.
  const p = placement(w, h, { ...t, rotate: 0 });

  const background = t.background === 'transparent'
    ? { r: 0, g: 0, b: 0, alpha: 0 }
    : { r: 255, g: 255, b: 255, alpha: 1 };
  const base = sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background } });

  // Το ορατό κομμάτι: τομή φωτογραφίας και καμβά (zoom/μετατόπιση μπορεί να βγάζουν εκτός).
  const x0 = Math.max(0, p.left);
  const y0 = Math.max(0, p.top);
  const x1 = Math.min(CANVAS, p.left + p.width);
  const y1 = Math.min(CANVAS, p.top + p.height);
  if (x1 <= x0 || y1 <= y0) return base.webp({ quality: WEBP_QUALITY }).toBuffer();

  const visible = await sharp(rotated.data)
    .resize(p.width, p.height, { fit: 'fill' })
    .extract({ left: x0 - p.left, top: y0 - p.top, width: x1 - x0, height: y1 - y0 })
    .toBuffer();
  return base.composite([{ input: visible, left: x0, top: y0 }]).webp({ quality: WEBP_QUALITY }).toBuffer();
}

/** Πανόραμα 360°: ίδια αναλογία (2:1), EXIF προσανατολισμός, όριο πλάτους 8K, WebP. */
export async function renderPanorama(input: Buffer) {
  const { data, info } = await sharp(input, { failOn: 'error' })
    .rotate()
    .resize({ width: PANORAMA_MAX_W, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Μικρογραφία για λίστες/πλέγματα. Τετράγωνη για φωτογραφίες, 2:1 για πανοράματα. */
export async function thumbnail(input: Buffer, shape: 'square' | 'panorama'): Promise<Buffer> {
  const size = shape === 'square' ? { width: THUMB, height: THUMB } : { width: THUMB * 2, height: THUMB };
  return sharp(input).resize({ ...size, fit: 'cover' }).webp({ quality: 78 }).toBuffer();
}
