/**
 * Ο μετασχηματισμός μιας φωτογραφίας πάνω στον τετράγωνο καμβά 1920×1920.
 *
 * ΚΟΙΝΟΣ για browser (προεπισκόπηση στον editor) και server (παραγωγή WebP με sharp): η ίδια
 * συνάρτηση `placement` δίνει και στους δύο το ίδιο αποτέλεσμα, άρα ό,τι βλέπει ο χρήστης είναι
 * αυτό που αποθηκεύεται.
 *
 *  • rotate: 0 | 90 | 180 | 270 (μοίρες, δεξιόστροφα) — μόνο ορθές γωνίες, χωρίς απώλεια.
 *  • zoom:   πολλαπλασιαστής πάνω στο «χωράει ολόκληρη ΜΕ ΠΕΡΙΘΩΡΙΟ». 1 = όλη η φωτογραφία μέσα,
 *            με 5% κενό σε κάθε πλευρά (η μεγάλη πλευρά πιάνει το 90% του καμβά) — η φωτογραφία
 *            δεν «κολλάει» ποτέ στις άκρες στην αυτόματη προσαρμογή.
 *  • x, y:   μετατόπιση του ΚΕΝΤΡΟΥ της φωτογραφίας από το κέντρο του καμβά, σε px του καμβά.
 *  • background: γέμισμα όσου καμβά δεν καλύπτει η φωτογραφία.
 */
export const CANVAS = 1920;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 6;
/** Περιθώριο της αυτόματης προσαρμογής, ανά πλευρά, ως ποσοστό του καμβά. */
export const FIT_MARGIN = 0.05;
const FIT = 1 - 2 * FIT_MARGIN;

export type Rotation = 0 | 90 | 180 | 270;
export type Background = 'white' | 'transparent';

export type ImageTransform = {
  zoom: number;
  x: number;
  y: number;
  rotate: Rotation;
  background: Background;
};

export const DEFAULT_TRANSFORM: ImageTransform = { zoom: 1, x: 0, y: 0, rotate: 0, background: 'white' };

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

/** Ασφαλής μετασχηματισμός από οτιδήποτε (JSON της βάσης, σώμα αιτήματος). */
export function normalizeTransform(v: unknown): ImageTransform {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const n = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  const rotate = ROTATIONS.includes(o.rotate as Rotation) ? (o.rotate as Rotation) : 0;
  return {
    zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, n(o.zoom, 1))),
    x: Math.max(-CANVAS * 2, Math.min(CANVAS * 2, n(o.x, 0))),
    y: Math.max(-CANVAS * 2, Math.min(CANVAS * 2, n(o.y, 0))),
    rotate,
    background: o.background === 'transparent' ? 'transparent' : 'white',
  };
}

/** Διαστάσεις της φωτογραφίας ΜΕΤΑ την περιστροφή. */
export function rotatedSize(w: number, h: number, rotate: Rotation) {
  return rotate === 90 || rotate === 270 ? { w: h, h: w } : { w, h };
}

/** Μέγεθος και θέση (πάνω-αριστερή γωνία) της περιστραμμένης φωτογραφίας πάνω στον καμβά. */
export function placement(origW: number, origH: number, t: ImageTransform, canvas = CANVAS) {
  const { w, h } = rotatedSize(origW, origH, t.rotate);
  const scale = ((canvas * FIT) / Math.max(w, h)) * t.zoom;
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(h * scale));
  const left = Math.round(canvas / 2 + t.x - width / 2);
  const top = Math.round(canvas / 2 + t.y - height / 2);
  return { width, height, left, top, scale };
}

/** «Γέμισμα»: η φωτογραφία καλύπτει ΟΛΟ τον καμβά (κόβεται ό,τι περισσεύει), κεντραρισμένη. */
export function fillZoom(origW: number, origH: number, rotate: Rotation) {
  const { w, h } = rotatedSize(origW, origH, rotate);
  return Math.min(MAX_ZOOM, Math.max(w, h) / (Math.min(w, h) * FIT));
}
