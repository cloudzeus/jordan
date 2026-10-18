// lib/assistant/period.ts — ΚΑΘΑΡΟ. Χρονική περίοδος από ελληνική (ή greeklish/αγγλική) φράση.
//
// «αυτό τον μήνα», «τον προηγούμενο μήνα», «τον Μάιο», «Μάιος 2025», «φέτος», «πέρσι», «Q3», «γ' τρίμηνο»,
// «α' εξάμηνο 2025», «2025», «σήμερα», «χθες», «αυτή την εβδομάδα», «τις τελευταίες 30 μέρες»,
// «από 1/3/2026 έως 15/4/2026». Η περίοδος είναι [from, to) — `to` ΑΠΟΚΛΕΙΣΤΙΚΑ — σε ημερομηνίες
// Αθήνας (yyyy-mm-dd), ώστε να περνά αυτούσια στο φίλτρο TRNDATE του SoftOne.
import { fold } from './text';

export interface Period {
  /** yyyy-mm-dd, συμπεριλαμβάνεται. */
  from: string;
  /** yyyy-mm-dd, ΔΕΝ συμπεριλαμβάνεται. */
  to: string;
  /** Ελληνική ετικέτα για την απάντηση («Οκτώβριος 2026», «Γ΄ τρίμηνο 2026»). */
  label: string;
}

const MONTHS_GEN = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
/** Ρίζες μηνών (folded, ελληνικά + greeklish + αγγλικά) — η πρώτη που ταιριάζει κερδίζει. */
const MONTH_STEMS: [RegExp, number][] = [
  [/(?<![\p{L}\p{N}])(ιανουαρ|γεναρ|ianouar|genar|january|jan)\p{L}*/u, 0],
  [/(?<![\p{L}\p{N}])(φεβρουαρ|φλεβαρ|fevrouar|flevar|february|feb)\p{L}*/u, 1],
  [/(?<![\p{L}\p{N}])(μαρτ|marti|march)\p{L}*/u, 2],
  [/(?<![\p{L}\p{N}])(απριλ|aprili|april|apr)\p{L}*/u, 3],
  [/(?<![\p{L}\p{N}])(μαιο|μαιου|μαη|maio|may)\p{L}*/u, 4],
  [/(?<![\p{L}\p{N}])(ιουν|iouni|june|jun)\p{L}*/u, 5],
  [/(?<![\p{L}\p{N}])(ιουλ|iouli|july|jul)\p{L}*/u, 6],
  [/(?<![\p{L}\p{N}])(αυγουστ|avgoust|august|aug)\p{L}*/u, 7],
  [/(?<![\p{L}\p{N}])(σεπτεμβρ|septemvr|september|sep)\p{L}*/u, 8],
  [/(?<![\p{L}\p{N}])(οκτωβρ|oktovr|october|oct)\p{L}*/u, 9],
  [/(?<![\p{L}\p{N}])(νοεμβρ|noemvr|november|nov)\p{L}*/u, 10],
  [/(?<![\p{L}\p{N}])(δεκεμβρ|dekemvr|december|dec)\p{L}*/u, 11],
];
const ORD: Record<string, number> = { α: 1, β: 2, γ: 3, δ: 4, '1': 1, '2': 2, '3': 3, '4': 4, πρωτ: 1, δευτερ: 2, τριτ: 3, τεταρτ: 4 };
const ROMAN_Q = ['Α΄', 'Β΄', 'Γ΄', 'Δ΄'];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => {
  // Κανονικοποίηση μέσω UTC (μήνας 12 → Ιανουάριος επόμενου έτους κ.λπ.).
  const dt = new Date(Date.UTC(y, m, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};
const month = (y: number, m: number, label?: string): Period => ({ from: ymd(y, m, 1), to: ymd(y, m + 1, 1), label: label ?? `${MONTHS_GEN[((m % 12) + 12) % 12]} ${new Date(Date.UTC(y, m, 1)).getUTCFullYear()}` });
const quarter = (y: number, q: number): Period => ({ from: ymd(y, (q - 1) * 3, 1), to: ymd(y, q * 3, 1), label: `${ROMAN_Q[q - 1]} τρίμηνο ${y}` });

/** Η σημερινή ημερομηνία Αθήνας ως { y, m (0-11), d }. */
export function athensToday(now = new Date()): { y: number; m: number; d: number } {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).split('-').map(Number);
  return { y: p[0], m: p[1] - 1, d: p[2] };
}

function yearIn(t: string, fallback: number): number {
  const m = /(?<![\p{L}\p{N}])(20\d{2})(?![\p{L}\p{N}])/u.exec(t);
  if (m) return Number(m[1]);
  if (/περσ|pers|last year|περασμεν\p{L}* (ετοσ|χρονια)|προηγουμεν\p{L}* (ετοσ|χρονια|χρηση)/u.test(t)) return fallback - 1;
  return fallback;
}

function parseDate(s: string, today: { y: number }): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/u.exec(s);
  if (!m) return null;
  const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : today.y;
  const mo = Number(m[2]) - 1, d = Number(m[1]);
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  return ymd(y, mo, d);
}

/**
 * Περίοδος από φράση, ή null αν η φράση δεν αναφέρει χρόνο.
 * `now`: για δοκιμές· προεπιλογή η τρέχουσα ώρα (ημερομηνία Αθήνας).
 */
export function parsePeriod(text: string, now = new Date()): Period | null {
  const t = ` ${fold(text).replace(/[΄'’`]/g, '')} `;
  const today = athensToday(now);
  const { y, m, d } = today;

  // Ρητό διάστημα «από 1/3/2026 έως/μέχρι 15/4/2026» (το «έως» συμπεριλαμβάνεται).
  const range = /(?:απο|apo|from)\s+(\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)\s+(?:εωσ|μεχρι|eos|mexri|to|-)\s+(\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)/u.exec(t);
  if (range) {
    const a = parseDate(range[1], today), b = parseDate(range[2], today);
    if (a && b) {
      const end = new Date(`${b}T00:00:00Z`);
      return { from: a, to: ymd(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1), label: `${a.split('-').reverse().join('/')} – ${b.split('-').reverse().join('/')}` };
    }
  }

  if (/(?<![\p{L}\p{N}])(σημερα|simera|today)(?![\p{L}\p{N}])/u.test(t)) return { from: ymd(y, m, d), to: ymd(y, m, d + 1), label: 'Σήμερα' };
  if (/(?<![\p{L}\p{N}])(χθεσ|xthes|chthes|yesterday)(?![\p{L}\p{N}])/u.test(t)) return { from: ymd(y, m, d - 1), to: ymd(y, m, d), label: 'Χθες' };

  const lastN = /τελευται\p{L}*\s+(\d{1,3})\s+(μερ|ημερ|mer|imer|days)/u.exec(t) ?? /last\s+(\d{1,3})\s+(days)/u.exec(t);
  if (lastN) {
    const n = Number(lastN[1]);
    return { from: ymd(y, m, d - n + 1), to: ymd(y, m, d + 1), label: `Τελευταίες ${n} ημέρες` };
  }

  if (/(αυτη|αυτην|τρεχουσα|this)\s+(την\s+)?(εβδομαδα|week|evdomada)/u.test(t)) {
    const dow = (new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7; // Δευτέρα = 0
    return { from: ymd(y, m, d - dow), to: ymd(y, m, d + 1), label: 'Αυτή την εβδομάδα' };
  }
  if (/(προηγουμεν|περασμεν|last|proigoumen|perasmen)\p{L}*\s+(την\s+)?(εβδομαδα|week|evdomada)/u.test(t)) {
    const dow = (new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7;
    return { from: ymd(y, m, d - dow - 7), to: ymd(y, m, d - dow), label: 'Προηγούμενη εβδομάδα' };
  }

  // Μήνας: «αυτό τον μήνα», «τρέχων μήνας», «τον προηγούμενο μήνα».
  if (/(αυτο|αυτον|αυτοσ|τρεχον|τρεχων|this|ayto|afto|trexon)\s+(τον\s+|ton\s+)?(μηνα|μηνασ|month|mina)/u.test(t)) return month(y, m);
  if (/(προηγουμεν|περασμεν|last|previous|proigoumen|perasmen)\p{L}*\s+(τον\s+)?(μηνα|month|mina)/u.test(t)) return month(y, m - 1);

  // Τρίμηνο: «Q3», «Q3 2025», «γ τρίμηνο», «3ο τρίμηνο», «τρίτο τρίμηνο».
  const q = /(?<![\p{L}\p{N}])q([1-4])(?![\p{L}\p{N}])/u.exec(t)
    ?? /(?<![\p{L}\p{N}])(α|β|γ|δ|[1-4])ο?\s*(τριμην|trimin)/u.exec(t)
    ?? /(?<![\p{L}\p{N}])(πρωτ|δευτερ|τριτ|τεταρτ)\p{L}*\s+(τριμην|trimin)/u.exec(t);
  if (q) return quarter(yearIn(t, y), ORD[q[1]] ?? Number(q[1]));
  if (/(αυτο|τρεχον|this)\s+(το\s+)?(τριμηνο|quarter)/u.test(t)) return quarter(y, Math.floor(m / 3) + 1);

  // Εξάμηνο: «α' εξάμηνο», «1ο εξάμηνο», «H2».
  const h = /(?<![\p{L}\p{N}])h([12])(?![\p{L}\p{N}])/u.exec(t) ?? /(?<![\p{L}\p{N}])(α|β|[12])ο?\s*(εξαμην|eksamin|examin)/u.exec(t) ?? /(?<![\p{L}\p{N}])(πρωτ|δευτερ)\p{L}*\s+(εξαμην)/u.exec(t);
  if (h) {
    const n = ORD[h[1]] ?? Number(h[1]);
    const yy = yearIn(t, y);
    return { from: ymd(yy, (n - 1) * 6, 1), to: ymd(yy, n * 6, 1), label: `${n === 1 ? 'Α΄' : 'Β΄'} εξάμηνο ${yy}` };
  }

  // Όνομα μήνα (με ή χωρίς έτος). Χωρίς έτος: ο πιο πρόσφατος τέτοιος μήνας (π.χ. Νοέμβριο τον Οκτώβριο ⇒ πέρσι).
  for (const [re, mi] of MONTH_STEMS) {
    if (re.test(t)) {
      const explicit = /(?<![\p{L}\p{N}])(20\d{2})(?![\p{L}\p{N}])/u.exec(t);
      const yy = explicit ? Number(explicit[1]) : yearIn(t, y) !== y ? yearIn(t, y) : mi > m ? y - 1 : y;
      return month(yy, mi);
    }
  }

  // Έτος: «φέτος», «πέρσι», «προπέρσι», «2025», «χρήση 2025».
  if (/(?<![\p{L}\p{N}])(προπερσ|propers)/u.test(t)) return { from: ymd(y - 2, 0, 1), to: ymd(y - 1, 0, 1), label: `Έτος ${y - 2}` };
  if (/(?<![\p{L}\p{N}])(περσ|pers|last year)|(προηγουμεν|περασμεν)\p{L}*\s+(ετοσ|χρονια|χρηση)/u.test(t)) return { from: ymd(y - 1, 0, 1), to: ymd(y, 0, 1), label: `Έτος ${y - 1}` };
  if (/(?<![\p{L}\p{N}])(φετοσ|εφετοσ|fetos|this year)|(τρεχον|τρεχουσα|αυτη τη)\s+(ετοσ|χρονια|χρηση)/u.test(t)) return { from: ymd(y, 0, 1), to: ymd(y, m, d + 1), label: `Έτος ${y} (έως σήμερα)` };
  const yr = /(?<![\p{L}\p{N}])(20\d{2})(?![\p{L}\p{N}])/u.exec(t);
  if (yr) { const yy = Number(yr[1]); return { from: ymd(yy, 0, 1), to: ymd(yy + 1, 0, 1), label: `Έτος ${yy}` }; }

  return null;
}

/** yyyy-mm-dd → yyyymmdd για το φίλτρο TRNDATE του SoftOne (επιβεβαιωμένο ζωντανά). */
export const s1Date = (iso: string) => iso.replace(/-/g, '');
