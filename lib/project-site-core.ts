/**
 * Τοποθεσία έργου — ΚΑΘΑΡΗ λογική (χωρίς δίκτυο/βάση, τρέχει και σε client).
 *
 * Ο geocoder (MapTiler) απαντά με features GeoJSON: `center` [lng, lat], `place_type`
 * ('address' | 'street' | 'postal_code' | 'municipality' | 'place' | …), `text`, `address`
 * (αριθμός οδού) και `context` (Τ.Κ., δήμος, περιοχή, χώρα). Από αυτά βγαίνει η ΑΚΡΙΒΕΙΑ:
 *  - exact  — βρέθηκε ο αριθμός της οδού·
 *  - street — βρέθηκε μόνο η οδός (το σημείο είναι κάπου πάνω της)·
 *  - area   — μόνο Τ.Κ./οικισμός/δήμος — ο χρήστης ΠΡΕΠΕΙ να μετακινήσει την πινέζα.
 */
import { validCoords } from '@/lib/coords';

export type SitePrecision = 'exact' | 'street' | 'area';

export type SiteCandidate = {
  lat: number;
  lng: number;
  /** Πλήρης διεύθυνση όπως τη δίνει ο geocoder. */
  formatted: string;
  /** Οδός & αριθμός (όσο υπάρχει). */
  address: string | null;
  zip: string | null;
  district: string | null;
  city: string | null;
  precision: SitePrecision;
};

export const PRECISION_LABEL: Record<SitePrecision, string> = {
  exact: 'Ακριβής διεύθυνση',
  street: 'Μόνο η οδός — μετακίνησε την πινέζα στο σωστό σημείο',
  area: 'Μόνο η περιοχή — μετακίνησε την πινέζα στο σωστό σημείο',
};

type Ctx = { id?: string; text?: string };
type Feature = {
  center?: [number, number];
  place_type?: string[];
  place_name?: string;
  text?: string;
  address?: string;
  context?: Ctx[];
};

export function precisionOf(placeTypes: string[] | undefined): SitePrecision {
  const t = placeTypes ?? [];
  if (t.includes('address') || t.includes('poi')) return 'exact';
  if (t.includes('street') || t.includes('road')) return 'street';
  return 'area';
}

const ctx = (f: Feature, ...prefixes: string[]) =>
  f.context?.find((c) => prefixes.some((p) => c.id?.startsWith(`${p}.`)))?.text ?? null;

/** Τ.Κ. ελληνικού τύπου «113 62» → «11362». */
export const normZip = (z: string | null) => (z ? z.replace(/\s+/g, '') : null);

export function parseFeature(f: Feature): SiteCandidate | null {
  const [lng, lat] = f.center ?? [];
  const c = validCoords(lat, lng);
  if (!c) return null;
  // «address» χωρίς αριθμό οδού = μόνο ο δρόμος (το σημείο είναι κάπου πάνω του).
  const raw = precisionOf(f.place_type);
  const precision: SitePrecision = raw === 'exact' && (f.place_type ?? []).includes('address') && !String(f.address ?? '').trim() ? 'street' : raw;
  const isAddress = precision === 'exact';
  const street = precision !== 'area' ? f.text ?? null : null;
  const address = street ? [street, isAddress ? f.address : null].filter(Boolean).join(' ') || null : null;
  const isZip = (f.place_type ?? []).includes('postal_code');
  const zipRaw = ctx(f, 'postal_code') ?? (isZip ? f.text ?? null : null);
  // Πόλη: το «113 62 Αθήνα» της πλήρους διεύθυνσης (ό,τι ακολουθεί τον Τ.Κ.) — ο geocoder βάζει στο
  // context τη ΣΥΝΟΙΚΙΑ ως «place» (π.χ. Νέα Κυψέλη). Αλλιώς δήμος/οικισμός· για αποτέλεσμα-περιοχή, το όνομά του.
  const segs = (f.place_name ?? '').split(',').map((x) => x.trim());
  const zipSeg = zipRaw ? segs.find((x) => x.startsWith(zipRaw)) : undefined;
  const cityFromName = zipSeg ? zipSeg.slice(zipRaw!.length).trim() || null : null;
  const quarter = ctx(f, 'place');
  return {
    lat: c.lat,
    lng: c.lng,
    formatted: f.place_name ?? [address, f.text].filter(Boolean).join(', '),
    address,
    zip: normZip(zipRaw),
    district: precision === 'area' ? null : quarter,
    city: cityFromName ?? ctx(f, 'municipality') ?? (precision === 'area' && !isZip ? f.text ?? null : quarter),
    precision,
  };
}

/** Όλα τα αποτελέσματα, τα ακριβέστερα πρώτα (η σειρά του geocoder κρατιέται μέσα σε κάθε ακρίβεια). */
export function parseCandidates(data: { features?: Feature[] } | null | undefined, limit = 5): SiteCandidate[] {
  const order: Record<SitePrecision, number> = { exact: 0, street: 1, area: 2 };
  return (data?.features ?? [])
    .map(parseFeature)
    .filter((c): c is SiteCandidate => !!c)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => order[a.c.precision] - order[b.c.precision] || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.c);
}

/** Η μία γραμμή που δείχνουμε: «Πεστών 13, 11362 Αθήνα». */
export function siteLine(s: { address?: string | null; zip?: string | null; city?: string | null; formatted?: string | null }): string {
  const line = [s.address, [s.zip, s.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return line || s.formatted || '';
}
