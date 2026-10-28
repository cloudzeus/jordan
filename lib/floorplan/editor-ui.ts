// Καθαρά helpers UI του editor (χωρίς DOM), ελέγχονται με vitest.

type XY = { x: number; y: number };
type WH = { w: number; h: number };

/** Κρατά τη θέση της (draggable) παλέτας ΜΕΣΑ στον καμβά, με περιθώριο `pad`· ποτέ πέρα από το pad. */
export function clampToolbarPos(pos: XY, bounds: WH, el: WH, pad = 4): XY {
  const clamp = (v: number, max: number) => Math.max(pad, Math.min(v, Math.max(pad, max)));
  return { x: clamp(pos.x, bounds.w - el.w - pad), y: clamp(pos.y, bounds.h - el.h - pad) };
}
