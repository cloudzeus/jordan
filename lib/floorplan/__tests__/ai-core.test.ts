import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { chooseScale, dimsAreaPx, fallbackPolygon, parseAiResponse, parseDims, pickCandidate, plausibleArea, roomsInPx } from '../ai-core';
import { polygonArea } from '../core';

// Πραγματική απάντηση Gemini για κάτοψη ισογείου 1920×1446 (12 χώροι, κλίμακα 1215 cm).
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/ai-isogeio.json'), 'utf8');
const W = 1600, H = Math.round(1446 * (1600 / 1920));

describe('αναγνώριση κάτοψης με AI', () => {
  it('διαβάζει την απάντηση και αριθμεί τα διπλά ονόματα', () => {
    const r = parseAiResponse('```json\n' + fixture + '\n```');
    const rooms = roomsInPx(r, W, H);
    expect(rooms).toHaveLength(12);
    expect(rooms.map((x) => x.name)).toEqual(expect.arrayContaining(['ΑΠΟΘΗΚΗ', 'ΑΠΟΘΗΚΗ 2', 'ΑΠΟΘΗΚΗ 3', 'ΑΠΟΘΗΚΗ ΚΑΥΣΙΜΩΝ']));
    expect(rooms[0]).toMatchObject({ name: 'ΚΑΘΙΣΤΙΚΟ', dims: [515, 655] });
    expect(rooms[0].seed.x).toBeCloseTo(0.298 * W);
  });

  it('κλίμακα από τη διάσταση, συμφωνεί με τις διαστάσεις των χώρων', () => {
    const r = parseAiResponse(fixture);
    const s = chooseScale(r, roomsInPx(r, W, H), W, H)!;
    expect(s.source).toBe('dimension');
    // 1215 cm σε 296/1000 του πλάτους (1600 px) → ~0,0257 m/px
    expect(s.mPerPx).toBeCloseTo(12.15 / (0.296 * W), 4);
  });

  it('λάθος ανάγνωση της διάστασης ⇒ κλίμακα από τους χώρους', () => {
    const r = parseAiResponse(fixture);
    r.scale!.cm = 4215;
    const s = chooseScale(r, roomsInPx(r, W, H), W, H)!;
    expect(s.source).toBe('rooms');
    expect(s.mPerPx).toBeGreaterThan(0.02);
    expect(s.mPerPx).toBeLessThan(0.032);
  });

  it('διαστάσεις και ανοχή εμβαδού', () => {
    expect(parseDims('515x655')).toEqual([515, 655]);
    expect(parseDims('5,15 × 6,55 m')).toEqual([515, 655]);
    expect(parseDims(null)).toBeNull();
    const box = { x0: 0, y0: 0, x1: 100, y1: 100 };
    expect(plausibleArea(9000, box)).toBe(true);
    expect(plausibleArea(900, box)).toBe(false); // ένα «πλακάκι»
    expect(plausibleArea(30000, box)).toBe(false); // διαρροή
  });

  it('ανεκτική σε χαλασμένα στοιχεία', () => {
    const r = parseAiResponse('Ορίστε: {"rooms":[{"name":"Χ","seed":[1,2],"box_2d":[1,2,3,4]},{"bad":1}],"scale":"?"}');
    expect(r.rooms).toHaveLength(1);
    expect(r.scale).toBeNull();
  });

  it('διαστάσεις σχεδίου: απορρίπτει «κομμένο» περίγραμμα, κρατά το σωστό, αλλιώς ορθογώνιο με σωστό εμβαδό', () => {
    const r = parseAiResponse(fixture);
    const rooms = roomsInPx(r, W, H);
    const mpp = chooseScale(r, rooms, W, H)!.mPerPx;
    const living = rooms[0]; // ΚΑΘΙΣΤΙΚΟ 515×655 = 33,73 m²
    const target = dimsAreaPx(living, mpp)!;
    expect(target * mpp * mpp).toBeCloseTo(33.73, 1);
    const cut = { areaPx: target * 0.85 }, good = { areaPx: target * 1.05 };
    expect(pickCandidate([cut, null], living, mpp)).toBeNull();
    expect(pickCandidate([cut, good], living, mpp)).toBe(good);
    const fb = fallbackPolygon(living, mpp);
    expect(polygonArea(fb) * mpp * mpp).toBeCloseTo(33.73, 1);
    // Χωρίς διαστάσεις: το πλαίσιο του μοντέλου.
    const kitchen = rooms[1];
    expect(kitchen.dims).toBeNull();
    expect(polygonArea(fallbackPolygon(kitchen, mpp))).toBeCloseTo((kitchen.box.x1 - kitchen.box.x0) * (kitchen.box.y1 - kitchen.box.y0));
  });
});
