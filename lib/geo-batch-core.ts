/**
 * Μαζική γεωκωδικοποίηση συναλλασσομένων/συνεργατών — ΚΑΘΑΡΗ λογική (χωρίς πάροχο/DB, για tests):
 * από ποια πεδία φτιάχνεται η διεύθυνση και πότε ένα αποτέλεσμα θεωρείται σίγουρο ή «αμφίβολο».
 */

export type GeoInput = { address?: string | null; district?: string | null; zip?: string | null; city?: string | null; countryIso?: string | null };
export type GeoHit = { found: boolean; lat: number | null; lng: number | null; zip: string | null; city: string | null; countryCode: string | null; formatted?: string | null };

export type GeoStatus = 'match' | 'approximate' | 'ambiguous' | 'not_found' | 'no_address';

const clean = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();
const plain = (s: string | null | undefined) => clean(s).toLocaleLowerCase('el').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N} ]/gu, '');
const zip5 = (s: string | null | undefined) => (clean(s).replace(/\D/g, '').slice(0, 5) || null);
const isDummyAfm = (s: string) => /^0+$/.test(s);

/** SoftOne γράφει την Ελλάδα ως «EL»· οι πάροχοι θέλουν ISO-3166 «GR». */
export function isoCountry(code: string | null | undefined): string | null {
  const c = clean(code).toUpperCase();
  if (!c) return null;
  if (c === 'EL' || c === 'GRC') return 'GR';
  return /^[A-Z]{2}$/.test(c) ? c : null;
}

/** «Οδός 12, 11636 Αθήνα, Περιοχή» — μόνο ό,τι υπάρχει. Χωρίς οδό ΚΑΙ χωρίς πόλη/ΤΚ δεν ρωτάμε τον πάροχο. */
export function addressLine(i: GeoInput): string | null {
  const street = clean(i.address);
  const place = [zip5(i.zip), clean(i.city)].filter(Boolean).join(' ');
  if (!street && !place) return null;
  return [street, place, clean(i.district) && plain(i.district) !== plain(i.city) ? clean(i.district) : ''].filter(Boolean).join(', ');
}

/**
 * Κατάταξη αποτελέσματος:
 *  • no_address — δεν υπάρχει τίποτα να αναζητηθεί·
 *  • not_found — ο πάροχος δεν το βρήκε ή δεν έδωσε σημείο·
 *  • ambiguous — βρέθηκε, αλλά ο ΤΚ ή η πόλη που δώσαμε ΔΕΝ ταιριάζει, ή άλλη χώρα, ή δόθηκε μόνο πόλη/ΤΚ (σημείο πόλης, όχι κτιρίου)·
 *  • approximate — σωστή περιοχή (ΤΚ/πόλη) αλλά ο πάροχος δεν αναγνώρισε την οδό: σημείο ΤΚ/οικισμού·
 *  • match — βρέθηκε η οδός και συμφωνεί.
 */
export function classify(i: GeoInput, hit: GeoHit | null): GeoStatus {
  if (!addressLine(i)) return 'no_address';
  if (!hit || !hit.found || hit.lat == null || hit.lng == null || !Number.isFinite(hit.lat) || !Number.isFinite(hit.lng)) return 'not_found';
  const wantCountry = isoCountry(i.countryIso) ?? 'GR';
  if (hit.countryCode && hit.countryCode.toUpperCase() !== wantCountry) return 'ambiguous';
  if (!clean(i.address)) return 'ambiguous';
  const z = zip5(i.zip), hz = zip5(hit.zip);
  const street = streetMatched(i.address, hit.formatted);
  // Ίδια οδός και ίδια ταχυδρομική περιοχή (3 πρώτα ψηφία): γειτονικά τετράγωνα έχουν συχνά διπλανό ΤΚ.
  if (z && hz && z !== hz && !(street && z.slice(0, 3) === hz.slice(0, 3))) return 'ambiguous';
  const c = plain(i.city), hc = plain(hit.city);
  if (!z && c && hc && !hc.includes(c) && !c.includes(hc)) return 'ambiguous';
  return street ? 'match' : 'approximate';
}

/** Βρήκε ο πάροχος την ΟΔΟ; Αρκεί ένα «ουσιαστικό» κομμάτι λέξης της οδού (≥5 γράμματα, πρώτα 5) στο αποτέλεσμα. */
export function streetMatched(street: string | null | undefined, formatted: string | null | undefined): boolean {
  const f = plain(formatted);
  if (!f) return false;
  const stems = plain(street).split(' ').filter((w) => /\p{L}{5,}/u.test(w)).map((w) => w.slice(0, 5));
  return stems.some((st) => f.includes(st));
}

/** Ήδη έχει θέση (μη μηδενική) — δεν ξαναγράφεται. */
export function hasCoords(lat: unknown, lng: unknown): boolean {
  const a = Number(lat), b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && !(a === 0 && b === 0) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && String(lat ?? '').trim() !== '';
}

/** Λείπει η οδός ή (ΤΚ ΚΑΙ πόλη) — τότε ζητάμε τη διεύθυνση από ΑΑΔΕ/VIES με τον ΑΦΜ. */
export function needsRegistryAddress(i: GeoInput): boolean {
  return !clean(i.address) || (!zip5(i.zip) && !clean(i.city));
}

/** Ελληνικός ΑΦΜ (9 ψηφία) → ΑΑΔΕ· ξένος με χώρα ΕΕ → VIES (π.χ. «IT01808880270»). Αλλιώς τίποτα. */
export function registryTarget(afm: string | null | undefined, countryIso: string | null | undefined): { kind: 'aade'; afm: string } | { kind: 'vies'; vat: string } | null {
  const raw = clean(afm).toUpperCase().replace(/[\s.-]/g, '');
  if (!raw) return null;
  const c = isoCountry(countryIso) ?? 'GR';
  const digits = raw.replace(/^(EL|GR)/, '');
  if (c === 'GR') return /^\d{9}$/.test(digits) && !isDummyAfm(digits) ? { kind: 'aade', afm: digits } : null;
  const prefix = c === 'GR' ? 'EL' : c;
  const body = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
  return /^[0-9A-Z+*]{2,14}$/.test(body) ? { kind: 'vies', vat: `${prefix}${body}` } : null;
}
