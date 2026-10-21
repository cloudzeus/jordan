// Αναγνώριση χώρων κάτοψης με vision μοντέλο — καθαρή λογική (prompt, ανάγνωση απάντησης, κλίμακα).
// Υβριδικά: το μοντέλο διαβάζει ΤΙ υπάρχει (ονόματα χώρων, ένα σημείο μέσα σε κάθε χώρο, πλαίσιο,
// αναγραφόμενες διαστάσεις, μια γραμμή διάστασης για κλίμακα) και ο αλγόριθμος pixel (`measureRoom`)
// χαράζει το ακριβές περίγραμμα. Συντεταγμένες μοντέλου: [y, x] κανονικοποιημένες 0–1000.
import { z } from 'zod';
import type { Pt } from './core';

export const FLOORPLAN_AI_PROMPT = `Είσαι αρχιτέκτονας. Στην εικόνα υπάρχει κάτοψη κτιρίου (σχέδιο ή φωτογραφία σχεδίου).
Βρες ΚΑΘΕ κλειστό εσωτερικό χώρο (δωμάτιο, σαλόνι, κουζίνα, μπάνιο/λουτρό/WC, χωλ/διάδρομος, αποθήκη, γκαράζ, λεβητοστάσιο κ.λπ.). Όχι αυλές, βεράντες, σκάλες εξωτερικές, οικόπεδο.
Για κάθε χώρο δώσε:
- name: όπως γράφεται στο σχέδιο (αλλιώς σύντομη περιγραφή στα ελληνικά)
- seed: ένα σημείο ΜΕΣΑ στο δάπεδο του χώρου, μακριά από τοίχους, γράμματα, έπιπλα και διαγραμμίσεις, [y, x] κανονικοποιημένο 0-1000
- box_2d: [ymin, xmin, ymax, xmax] 0-1000, το εσωτερικό του χώρου
- dims_cm: οι εσωτερικές διαστάσεις του χώρου από τους αριθμούς διαστάσεων του σχεδίου (μέσα στον χώρο ή στις γραμμές διαστάσεων που τον ορίζουν), ως "οριζόντια x κάθετη" όπως φαίνονται στην εικόνα, π.χ. "515x655". Ψάξε προσεκτικά — τα αρχιτεκτονικά σχέδια σχεδόν πάντα τις γράφουν. null μόνο αν πραγματικά δεν υπάρχουν.
Επίσης scale: η ΜΕΓΑΛΥΤΕΡΗ ευανάγνωστη οριζόντια ή κάθετη διάσταση του σχεδίου — τα δύο άκρα της γραμμής διάστασης a, b ως [y, x] 0-1000 και η τιμή της σε cm (αν το σχέδιο είναι σε m, μετάτρεψε σε cm). Αν δεν υπάρχει, null.
Απάντησε ΜΟΝΟ με JSON: {"rooms":[{"name":"","seed":[0,0],"box_2d":[0,0,0,0],"dims_cm":null}],"scale":{"a":[0,0],"b":[0,0],"cm":0}}`;

const pair = z.tuple([z.coerce.number(), z.coerce.number()]);
const room = z.object({
  name: z.coerce.string().trim().max(120).default(''),
  seed: pair,
  box_2d: z.tuple([z.coerce.number(), z.coerce.number(), z.coerce.number(), z.coerce.number()]),
  dims_cm: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? null : String(v))),
});
export const aiResponse = z.object({
  rooms: z.array(z.unknown()).max(200).transform((rs) => rs.flatMap((r) => { const p = room.safeParse(r); return p.success ? [p.data] : []; })),
  scale: z.object({ a: pair, b: pair, cm: z.coerce.number() }).nullish().catch(null).transform((v) => v ?? null),
});
export type AiResponse = z.infer<typeof aiResponse>;

/** Το JSON της απάντησης (και μέσα σε ```json … ``` ή με κείμενο γύρω). */
export function parseAiResponse(text: string): AiResponse {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let raw: unknown;
  try { raw = JSON.parse(t); } catch {
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b <= a) throw new Error('Η απάντηση του μοντέλου δεν είναι JSON');
    raw = JSON.parse(t.slice(a, b + 1));
  }
  return aiResponse.parse(raw);
}

const clamp = (v: number) => Math.max(0, Math.min(1000, v));
/** [y, x] 0–1000 → pixels ανάλυσης. */
export const toPx = ([y, x]: [number, number], w: number, h: number): Pt => ({ x: (clamp(x) / 1000) * w, y: (clamp(y) / 1000) * h });

export type AiRoom = { name: string; seed: Pt; box: { x0: number; y0: number; x1: number; y1: number }; dims: [number, number] | null };

/** «515x655», «5,15 × 6,55 m», «515/655» → [w, h] σε cm (null αν δεν διαβάζεται). */
export function parseDims(s: string | null): [number, number] | null {
  if (!s) return null;
  const nums = s.replace(/,/g, '.').match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (nums.length < 2) return null;
  let [a, b] = nums;
  if (/\bm\b|μ\b/i.test(s) && a < 50 && b < 50) { a *= 100; b *= 100; }
  return a > 0 && b > 0 ? [a, b] : null;
}

/** Οι χώροι σε pixels ανάλυσης, με αρίθμηση στα διπλά ονόματα («ΑΠΟΘΗΚΗ», «ΑΠΟΘΗΚΗ 2»). */
export function roomsInPx(r: AiResponse, w: number, h: number): AiRoom[] {
  const count = new Map<string, number>();
  return r.rooms.map((x) => {
    const base = x.name.trim() || 'Χώρος';
    const n = (count.get(base) ?? 0) + 1;
    count.set(base, n);
    const [y0, x0, y1, x1] = x.box_2d;
    const a = toPx([y0, x0], w, h), b = toPx([y1, x1], w, h);
    return {
      name: n > 1 ? `${base} ${n}` : base, seed: toPx(x.seed, w, h),
      box: { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) },
      dims: parseDims(x.dims_cm),
    };
  });
}

const median = (xs: number[]) => { const s = [...xs].sort((p, q) => p - q); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * Κλίμακα (μέτρα ανά pixel ανάλυσης): από τη γραμμή διάστασης, διασταυρωμένη με τις αναγραφόμενες
 * διαστάσεις των χώρων (μεγάλη πλευρά πλαισίου ↔ μεγάλη διάσταση). Αν διαφωνούν πάνω από 15%, κερδίζει
 * ο διάμεσος των χώρων (πιο ανθεκτικός σε μια λάθος ανάγνωση). Επιστρέφει και τη γραμμή για τη βαθμονόμηση.
 */
export function chooseScale(r: AiResponse, rooms: AiRoom[], w: number, h: number):
  { mPerPx: number; line: [Pt, Pt]; source: 'dimension' | 'rooms' } | null {
  const fromRooms = rooms.flatMap((x) => {
    if (!x.dims) return [];
    const bw = x.box.x1 - x.box.x0, bh = x.box.y1 - x.box.y0;
    if (bw < 5 || bh < 5) return [];
    const [d1, d2] = [Math.max(...x.dims), Math.min(...x.dims)];
    const [p1, p2] = [Math.max(bw, bh), Math.min(bw, bh)];
    return [d1 / 100 / p1, d2 / 100 / p2];
  });
  const roomsK = fromRooms.length >= 2 ? median(fromRooms) : null;
  let lineK: number | null = null, line: [Pt, Pt] | null = null;
  if (r.scale && r.scale.cm > 0) {
    const a = toPx(r.scale.a, w, h), b = toPx(r.scale.b, w, h);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > Math.max(w, h) * 0.05) { lineK = r.scale.cm / 100 / len; line = [a, b]; }
  }
  if (lineK && line && (!roomsK || Math.abs(lineK / roomsK - 1) <= 0.15)) return { mPerPx: lineK, line, source: 'dimension' };
  if (roomsK) {
    // Οριζόντια γραμμή 1/4 του πλάτους με το μήκος που αντιστοιχεί στην κλίμακα των χώρων.
    const L = w / 4, y = h * 0.04;
    return { mPerPx: roomsK, line: [{ x: w * 0.05, y }, { x: w * 0.05 + L, y }], source: 'rooms' };
  }
  return null;
}

/** Δεκτό περίγραμμα; Το εμβαδό του να είναι κοντά στο πλαίσιο του μοντέλου (όχι διαρροή, όχι «πλακάκι»). */
export const plausibleArea = (areaPx: number, box: AiRoom['box']) => {
  const boxA = (box.x1 - box.x0) * (box.y1 - box.y0);
  return boxA > 0 && areaPx >= boxA * 0.45 && areaPx <= boxA * 1.5;
};

/** Ανοχή απόκλισης από τις διαστάσεις του σχεδίου (έπιπλα/διαγραμμίσεις μικραίνουν το περίγραμμα). */
export const DIMS_TOLERANCE = 0.1;

/** Εμβαδό (px²) από τις αναγραφόμενες διαστάσεις του χώρου — η «αλήθεια» του σχεδίου. */
export const dimsAreaPx = (r: AiRoom, mPerPx: number | null) =>
  r.dims && mPerPx ? (r.dims[0] / 100 / mPerPx) * (r.dims[1] / 100 / mPerPx) : null;

/**
 * Από τα υποψήφια περιγράμματα (τοίχοι, γραμμές σχεδίου) το καταλληλότερο: με αναγραφόμενες διαστάσεις
 * πρέπει να συμφωνεί ±10% με αυτές (έπιπλα/διαγραμμίσεις «κόβουν» τον χώρο, ανοίγματα τον «χύνουν»)·
 * χωρίς διαστάσεις, κοντά στο πλαίσιο του μοντέλου. Ανάμεσα σε δεκτά, το πιο κοντινό στο αναμενόμενο.
 */
export function pickCandidate<T extends { areaPx: number }>(cands: (T | null)[], r: AiRoom, mPerPx: number | null): T | null {
  const target = dimsAreaPx(r, mPerPx);
  const ok = cands.filter((c): c is T => !!c && (target ? Math.abs(c.areaPx / target - 1) <= DIMS_TOLERANCE : plausibleArea(c.areaPx, r.box)));
  if (!ok.length) return null;
  const goal = target ?? (r.box.x1 - r.box.x0) * (r.box.y1 - r.box.y0);
  return ok.reduce((b, c) => (Math.abs(c.areaPx - goal) < Math.abs(b.areaPx - goal) ? c : b));
}

/**
 * Χωρίς δεκτό περίγραμμα: ορθογώνιο με τις διαστάσεις του σχεδίου (σωστό εμβαδό) στο κέντρο του
 * πλαισίου — με τον προσανατολισμό που ταιριάζει στο πλαίσιο — αλλιώς το ίδιο το πλαίσιο.
 */
export function fallbackPolygon(r: AiRoom, mPerPx: number | null): Pt[] {
  if (r.dims && mPerPx) {
    const bw = r.box.x1 - r.box.x0, bh = r.box.y1 - r.box.y0;
    let [dw, dh] = r.dims.map((d) => d / 100 / mPerPx) as [number, number];
    if ((bw >= bh) !== (dw >= dh)) [dw, dh] = [dh, dw];
    const cx = (r.box.x0 + r.box.x1) / 2, cy = (r.box.y0 + r.box.y1) / 2;
    return boxPolygon({ x0: cx - dw / 2, y0: cy - dh / 2, x1: cx + dw / 2, y1: cy + dh / 2 });
  }
  return boxPolygon(r.box);
}

export const boxPolygon = (b: AiRoom['box']): Pt[] => [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }];
