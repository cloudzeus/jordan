import { describe, expect, it } from 'vitest';
import {
  burnLine, detectWalls, flood, labelPoint, measureRoom, otsu, pointInPolygon, polygonArea, simplifyClosed,
  toGray, traceOuter, type Mask,
} from '../core';

/** Κάτοψη-παιχνίδι: λευκό φόντο, χοντροί μαύροι τοίχοι, προαιρετικά κείμενο/λεπτές γραμμές. */
function plan(w: number, h: number, draw: (set: (x0: number, y0: number, x1: number, y1: number) => void) => void) {
  const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
  draw((x0, y0, x1, y1) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const j = (y * w + x) * 4;
      rgba[j] = rgba[j + 1] = rgba[j + 2] = 0;
    }
  });
  return toGray(rgba, w, h);
}

/** Δύο δωμάτια 100×80 και 60×80 (εσωτερικά), τοίχοι 8 px, πόρτα 20 px στον μεσότοιχο. */
const W = 200, H = 120;
const twoRooms = (door: boolean) => plan(W, H, (rect) => {
  rect(10, 10, 186, 18);   // πάνω
  rect(10, 98, 186, 106);  // κάτω
  rect(10, 10, 18, 106);   // αριστερά
  rect(178, 10, 186, 106); // δεξιά
  rect(118, 10, 126, 106); // μεσότοιχος (εσωτερικά: 18..118 = 100, 126..178 = 52)
  if (door) for (let y = 48; y < 68; y++) for (let x = 118; x < 126; x++) { /* κενό */ }
  rect(30, 30, 31, 90);    // λεπτή γραμμή (διάσταση) — πρέπει να αγνοηθεί
  rect(60, 50, 63, 53);    // «γράμμα»
});

function withDoor(): Uint8Array {
  const g = twoRooms(false);
  for (let y = 48; y < 68; y++) for (let x = 118; x < 126; x++) g[y * W + x] = 255;
  return g;
}

describe('otsu', () => {
  it('χωρίζει μαύρο από λευκό', () => {
    const g = new Uint8Array(100);
    g.fill(20, 0, 30); g.fill(240, 30);
    const t = otsu(g);
    expect(t).toBeGreaterThan(20);
    expect(t).toBeLessThanOrEqual(240);
  });
});

describe('detectWalls', () => {
  it('κρατά τους χοντρούς τοίχους, πετά λεπτές γραμμές και γράμματα', () => {
    const { walls } = detectWalls(twoRooms(false), W, H, { minThickness: 5 });
    expect(walls[14 * W + 50]).toBe(1);   // πάνω τοίχος
    expect(walls[60 * W + 122]).toBe(1);  // μεσότοιχος
    expect(walls[60 * W + 30]).toBe(0);   // λεπτή γραμμή
    expect(walls[51 * W + 61]).toBe(0);   // γράμμα
    expect(walls[60 * W + 80]).toBe(0);   // δάπεδο
  });
});

describe('traceOuter + polygonArea', () => {
  it('εμβαδό περιγράμματος = πλήθος pixels (L-σχήμα)', () => {
    const w = 20, h = 20;
    const m: Mask = new Uint8Array(w * h);
    for (let y = 2; y < 12; y++) for (let x = 3; x < 8; x++) m[y * w + x] = 1;
    for (let y = 8; y < 12; y++) for (let x = 8; x < 15; x++) m[y * w + x] = 1;
    const n = m.reduce((s, v) => s + v, 0);
    const poly = traceOuter(m, w, h);
    expect(polygonArea(poly)).toBe(n);
    expect(poly.length).toBe(6);
    expect(polygonArea(simplifyClosed(poly, 0.5))).toBe(n);
  });

  it('ένα pixel', () => {
    const m: Mask = new Uint8Array(25);
    m[2 * 5 + 2] = 1;
    expect(traceOuter(m, 5, 5)).toEqual([{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 3 }, { x: 2, y: 3 }]);
  });
});

describe('measureRoom', () => {
  it('κλειστό δωμάτιο: ακριβές εμβαδό', () => {
    const { walls } = detectWalls(twoRooms(false), W, H, { minThickness: 5 });
    const r = measureRoom(walls, W, H, { x: 70, y: 60 }, [0]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.areaPx).toBe(100 * 80);
  });

  it('πόρτα: χωρίς κλείσιμο ενώνει τα δύο δωμάτια, με κλείσιμο δίνει μόνο το ένα', () => {
    const { walls } = detectWalls(withDoor(), W, H, { minThickness: 5 });
    const open = measureRoom(walls, W, H, { x: 70, y: 60 }, [0]);
    expect(open.ok && open.areaPx).toBeGreaterThan(100 * 80 + 52 * 80 - 1);
    const closed = measureRoom(walls, W, H, { x: 70, y: 60 }, [0, 24]);
    expect(closed.ok).toBe(true);
    if (closed.ok) {
      // Ίδιο εμβαδό ± μία λωρίδα στο άνοιγμα της πόρτας.
      expect(closed.areaPx).toBeGreaterThanOrEqual(100 * 80);
      expect(closed.areaPx).toBeLessThan(100 * 80 + 20 * 14);
    }
  });

  it('κλειστό δωμάτιο: το κλείσιμο ανοιγμάτων δεν αλλάζει το αποτέλεσμα', () => {
    const { walls } = detectWalls(twoRooms(false), W, H, { minThickness: 5 });
    const r = measureRoom(walls, W, H, { x: 70, y: 60 }, [0, 24]);
    expect(r.ok && r.gapPx).toBe(0);
    expect(r.ok && r.areaPx).toBe(100 * 80);
  });

  it('διαχωριστικό του χρήστη κλείνει την πόρτα', () => {
    const { walls } = detectWalls(withDoor(), W, H, { minThickness: 5 });
    burnLine(walls, W, H, { x: 122, y: 40 }, { x: 122, y: 75 }, 1);
    const r = measureRoom(walls, W, H, { x: 70, y: 60 }, [0]);
    // + η λωρίδα της πόρτας μέχρι τη γραμμή (x 118..120 × 20 px).
    expect(r.ok && r.areaPx).toBe(100 * 80 + 3 * 20);
  });

  it('έξω από το κτίριο ⇒ leak, πάνω σε τοίχο ⇒ on-wall', () => {
    const { walls } = detectWalls(twoRooms(false), W, H, { minThickness: 5 });
    expect(measureRoom(walls, W, H, { x: 3, y: 3 }, [0])).toEqual({ ok: false, reason: 'leak' });
    expect(measureRoom(walls, W, H, { x: 14, y: 50 }, [0])).toEqual({ ok: false, reason: 'on-wall' });
  });
});

describe('βοηθητικά', () => {
  it('flood ξέρει αν ακουμπά το περιθώριο', () => {
    const m: Mask = new Uint8Array(100);
    expect(flood(m, 10, 10, 5, 5)?.touchesBorder).toBe(true);
  });

  it('labelPoint σε σχήμα Γ: όχι πάνω σε πλευρά', () => {
    const g = [{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 4 }, { x: 5, y: 4 }, { x: 5, y: 7 }, { x: 2, y: 7 }];
    const p = labelPoint(g);
    expect(pointInPolygon(p, g)).toBe(true);
    expect(Math.abs(p.x - 5) > 0.3 || p.y < 3.7).toBe(true);
  });

  it('labelPoint μέσα σε πολύγωνο U', () => {
    const u = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 10 }, { x: 7, y: 10 }, { x: 7, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 12 }, { x: 0, y: 12 }];
    expect(pointInPolygon(labelPoint(u), u)).toBe(true);
  });

});
