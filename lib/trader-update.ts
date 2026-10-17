// Τροποποίηση ΥΠΑΡΧΟΝΤΟΣ συναλλασσομένου στη SoftOne — καθαρό module (χωρίς I/O).
//
// Κανόνας: στέλνουμε ΜΟΝΟ ό,τι άλλαξε σε σχέση με τη ΖΩΝΤΑΝΗ ανάγνωση της καρτέλας (όχι με τον
// τοπικό καθρέφτη, που μπορεί να είναι παλιός). Τα objects SUPPLIER/CUSTOMER/DEBTOR/CREDITOR είναι
// EditMaster: το setData με KEY ενημερώνει μόνο τα πεδία που στέλνονται. Ο ΚΑΔ ζει σε άλλον πίνακα
// (TRDEXTRA μέσω <SUP|CUS|DEB|CRE>EXTRA) — στέλνεται μόνο αν άλλαξε.
// Η γεωγραφική θέση (TRDR.LATITUDE / LONGITUDE) είναι ΖΕΥΓΟΣ: αλλάζει ή σβήνει πάντα μαζί.
import { formatCoords, validCoords } from '@/lib/coords';

/** Object ανά SODTYPE. Οι χρηματικοί λογαριασμοί (14) δεν τροποποιούνται από εδώ. */
export const TRADER_OBJECT_BY_SODTYPE: Record<number, { object: string; extra: string }> = {
  12: { object: 'SUPPLIER', extra: 'SUPEXTRA' },
  13: { object: 'CUSTOMER', extra: 'CUSEXTRA' },
  15: { object: 'DEBTOR', extra: 'DEBEXTRA' },
  16: { object: 'CREDITOR', extra: 'CREEXTRA' },
};

/** Τα πεδία της καρτέλας που τροποποιούνται, με το όριο χαρακτήρων του schema (SUPPLIER/CUSTOMER). */
export const TRADER_EDIT_FIELDS = [
  { key: 'name', col: 'NAME', label: 'Επωνυμία', max: 128 },
  { key: 'afm', col: 'AFM', label: 'Α.Φ.Μ.', max: 20 },
  { key: 'irsData', col: 'IRSDATA', label: 'Δ.Ο.Υ.', max: 128 },
  { key: 'profession', col: 'JOBTYPETRD', label: 'Επάγγελμα', max: 128 },
  { key: 'address', col: 'ADDRESS', label: 'Διεύθυνση', max: 100 },
  { key: 'district', col: 'DISTRICT', label: 'Περιοχή', max: 30 },
  { key: 'zip', col: 'ZIP', label: 'Τ.Κ.', max: 10 },
  { key: 'city', col: 'CITY', label: 'Πόλη', max: 30 },
  { key: 'country', col: 'COUNTRY', label: 'Χώρα', max: 6 },
  { key: 'phone', col: 'PHONE01', label: 'Τηλέφωνο', max: 20 },
  { key: 'phone2', col: 'PHONE02', label: 'Τηλέφωνο 2', max: 20 },
  { key: 'fax', col: 'FAX', label: 'Fax', max: 20 },
  { key: 'email', col: 'EMAIL', label: 'Email', max: 128 },
  { key: 'webpage', col: 'WEBPAGE', label: 'Ιστοσελίδα', max: 64 },
] as const;

export type TraderFieldKey = (typeof TRADER_EDIT_FIELDS)[number]['key'];
export type TraderValues = Partial<Record<TraderFieldKey, string | null>> & {
  kad?: number | null; kad1?: number | null;
  /** Γεωγραφικό πλάτος / μήκος (TRDR.LATITUDE / LONGITUDE) — null = άγνωστο. */
  lat?: number | null; lng?: number | null;
};

export interface TraderChange { key: TraderFieldKey | 'kad' | 'kad1' | 'coords'; label: string; from: string | null; to: string | null }

/** Ίδια θέση αν διαφέρουν λιγότερο από ~5 cm (το SoftOne κρατά Float). */
const COORD_EPS = 5e-7;
const sameCoords = (a: { lat: number; lng: number } | null, b: { lat: number; lng: number } | null) =>
  a == null || b == null ? a === b : Math.abs(a.lat - b.lat) < COORD_EPS && Math.abs(a.lng - b.lng) < COORD_EPS;

const norm = (v: unknown): string | null => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s ? s : null;
};
const kadNorm = (v: unknown): number | null => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

/** Από τη γραμμή TRDR (GetTable) στις τιμές της φόρμας. */
export function traderValuesFromRow(row: Record<string, unknown>, extra?: Record<string, unknown> | null): TraderValues {
  const out: TraderValues = {};
  for (const f of TRADER_EDIT_FIELDS) out[f.key] = norm(row[f.col]);
  out.kad = kadNorm(extra?.KAD);
  out.kad1 = kadNorm(extra?.KAD1);
  const c = validCoords(row.LATITUDE, row.LONGITUDE);
  out.lat = c?.lat ?? null;
  out.lng = c?.lng ?? null;
  return out;
}

export interface TraderUpdatePlan {
  changes: TraderChange[];
  /** Τα πεδία της καρτέλας (μόνο όσα άλλαξαν). */
  row: Record<string, unknown>;
  /** Ο πίνακας EXTRA (μόνο αν άλλαξε ΚΑΔ). */
  extra: Record<string, unknown> | null;
  errors: string[];
}

/**
 * Τι αλλάζει. `next` περιέχει ΜΟΝΟ όσα πεδία ορίζει ο χρήστης (απόντα κλειδιά = «δεν αγγίζω»).
 * Κενή τιμή σε πεδίο που είχε τιμή = σβήσιμο (στέλνεται ""). Η επωνυμία δεν σβήνεται ποτέ.
 */
export function planTraderUpdate(current: TraderValues, next: TraderValues): TraderUpdatePlan {
  const changes: TraderChange[] = [];
  const row: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const f of TRADER_EDIT_FIELDS) {
    if (!(f.key in next)) continue;
    const to = norm(next[f.key]);
    const from = norm(current[f.key]);
    if (to === from) continue;
    if (f.key === 'name' && !to) { errors.push('Η επωνυμία δεν μπορεί να είναι κενή.'); continue; }
    if (to && to.length > f.max) { errors.push(`${f.label}: έως ${f.max} χαρακτήρες (έχει ${to.length}).`); continue; }
    if (f.key === 'country' && to && !/^\d+$/.test(to)) { errors.push('Χώρα: επίλεξε από το μητρώο χωρών της SoftOne.'); continue; }
    changes.push({ key: f.key, label: f.label, from, to });
    row[f.col] = f.key === 'irsData' || f.key === 'country' ? (to ? Number(to) || to : '') : (to ?? '');
  }
  let extra: Record<string, unknown> | null = null;
  for (const [key, col, label] of [['kad', 'KAD', 'ΚΑΔ (κύρια)'], ['kad1', 'KAD1', 'ΚΑΔ (δευτερεύουσα)']] as const) {
    if (!(key in next)) continue;
    const to = kadNorm(next[key]);
    const from = kadNorm(current[key]);
    if (to === from) continue;
    extra ??= {};
    extra[col] = to ?? '';
    changes.push({ key, label, from: from == null ? null : String(from), to: to == null ? null : String(to) });
  }
  // Γεωγραφική θέση: ζεύγος — έγκυρο πλάτος ΚΑΙ μήκος, ή και τα δύο κενά (σβήσιμο).
  if ('lat' in next || 'lng' in next) {
    const empty = (v: unknown) => v == null || v === '';
    const to = validCoords(next.lat, next.lng);
    const from = validCoords(current.lat, current.lng);
    if (!to && !(empty(next.lat) && empty(next.lng))) {
      errors.push('Γεωγραφική θέση: χρειάζονται έγκυρο πλάτος (−90…90) ΚΑΙ μήκος (−180…180).');
    } else if (!sameCoords(from, to)) {
      changes.push({ key: 'coords', label: 'Γεωγραφική θέση', from: formatCoords(from) || null, to: formatCoords(to) || null });
      row.LATITUDE = to ? to.lat : '';
      row.LONGITUDE = to ? to.lng : '';
    }
  }
  return { changes, row, extra, errors };
}

/**
 * Μετά την εγγραφή: ποια πεδία ΔΕΝ πήραν την τιμή που στείλαμε (σύγκριση με νέα ανάγνωση).
 * Η SoftOne απαντά `success:true` και για εγγραφές που αγνόησε — αυτό είναι η μόνη απόδειξη.
 */
export function unappliedChanges(plan: TraderUpdatePlan, after: TraderValues): TraderChange[] {
  return plan.changes.filter((c) => {
    if (c.key === 'coords') {
      const want = c.to ? validCoords(...(c.to.split(',').map(Number) as [number, number])) : null;
      return !sameCoords(want, validCoords(after.lat, after.lng));
    }
    const got = c.key === 'kad' || c.key === 'kad1' ? (after[c.key] == null ? null : String(after[c.key])) : norm(after[c.key as TraderFieldKey]);
    return (got ?? null) !== (c.to ?? null);
  });
}
