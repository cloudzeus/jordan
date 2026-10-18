// lib/assistant/when.ts — ΚΑΘΑΡΟ. Ημέρα + ώρα ραντεβού από ελληνική (ή greeklish) φράση, ώρα Αθήνας.
//
// «στις 4 το απόγευμα της Δευτέρας» → επόμενη Δευτέρα 16:00 · «αύριο 10:30» · «μεθαύριο το πρωί» (μόνο
// τμήμα ημέρας, χωρίς ώρα) · «την Πέμπτη στις 12 το μεσημέρι» · «20/10 στις 11» · «25 Οκτωβρίου 17:00».
// Ό,τι μαντεύεται (π.χ. «στις 4» χωρίς «απόγευμα» ⇒ 16:00 σε ώρες γραφείου) καταγράφεται στο `assumed`,
// ώστε η κάρτα επιβεβαίωσης να το δείχνει.
import { fold } from './text';
import { athensToday } from './period';

export type PartOfDay = 'morning' | 'noon' | 'afternoon' | 'evening';
export interface When {
  /** yyyy-mm-dd (Αθήνα) */
  date: string | null;
  /** HH:MM (Αθήνα) ή null αν δεν δόθηκε ώρα */
  time: string | null;
  partOfDay: PartOfDay | null;
  /** Υποθέσεις που έγιναν — για να τις δει ο χρήστης πριν επιβεβαιώσει. */
  assumed: string[];
}

const L = '(?<![\\p{L}\\p{N}])';
const R = '(?![\\p{L}\\p{N}])';
const re = (s: string) => new RegExp(s, 'u');

const WEEKDAYS: [string, number][] = [
  ['κυριακ|kiriak|kyriak|sunday', 0], ['δευτερ|deuter|defter|monday', 1], ['τριτ|trit|tuesday', 2], ['τεταρτ|tetart|wednesday', 3],
  ['πεμπτ|pempt|thursday', 4], ['παρασκευ|paraskev|friday', 5], ['σαββατ|savvat|saturday', 6],
];
const WEEKDAY_EL = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
const MONTHS = ['ιανουαρ', 'φεβρουαρ', 'μαρτ', 'απριλ', 'μαι', 'ιουν', 'ιουλ', 'αυγουστ', 'σεπτεμβρ', 'οκτωβρ', 'νοεμβρ', 'δεκεμβρ'];
const NUMBER_WORDS: [string, number][] = [
  ['μια|μιαν|ενα|mia|ena', 1], ['δυο|dio|dyo', 2], ['τρεισ|τρια|tris|tria', 3], ['τεσσερισ|τεσσερα|teseris|tesera', 4], ['πεντε|pente', 5],
  ['εξι|eksi|exi', 6], ['επτα|εφτα|epta|efta', 7], ['οκτω|οχτω|okto|oxto', 8], ['εννια|εννεα|ennia|ennea|enia', 9], ['δεκα|deka', 10],
  ['εντεκα|endeka|enteka', 11], ['δωδεκα|dodeka', 12],
];

const pad = (n: number) => String(n).padStart(2, '0');
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

export function parseWhen(text: string, now = new Date()): When {
  const t = ` ${fold(text).replace(/[΄'’`]/g, '')} `;
  const { y, m, d } = athensToday(now);
  const today = `${y}-${pad(m + 1)}-${pad(d)}`;
  const assumed: string[] = [];
  let date: string | null = null;

  // ── ημέρα ──
  if (re(`${L}(μεθαυριο|methavrio|meuavrio)${R}`).test(t)) date = addDays(today, 2);
  else if (re(`${L}(αυριο|avrio|tomorrow)${R}`).test(t)) date = addDays(today, 1);
  else if (re(`${L}(σημερα|simera|today)${R}`).test(t)) date = today;

  if (!date) {
    // 20/10 ή 20/10/2026 (μόνο «/» — το «16.30» είναι ώρα)
    const dm = /(?<![\d/.])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d/.])/.exec(t);
    if (dm && Number(dm[2]) >= 1 && Number(dm[2]) <= 12 && Number(dm[1]) >= 1 && Number(dm[1]) <= 31) {
      const yy = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : y;
      let cand = `${yy}-${pad(Number(dm[2]))}-${pad(Number(dm[1]))}`;
      if (!dm[3] && cand < today) cand = `${yy + 1}-${pad(Number(dm[2]))}-${pad(Number(dm[1]))}`;
      date = cand;
    }
  }
  if (!date) {
    // «25 Οκτωβρίου»
    const md = re(`${L}(\\d{1,2})\\s+(${MONTHS.join('|')})\\p{L}*`).exec(t);
    if (md) {
      const mi = MONTHS.indexOf(md[2]);
      let cand = `${y}-${pad(mi + 1)}-${pad(Number(md[1]))}`;
      if (cand < today) cand = `${y + 1}-${pad(mi + 1)}-${pad(Number(md[1]))}`;
      date = cand;
    }
  }
  if (!date) {
    for (const [stem, wd] of WEEKDAYS) {
      if (!re(`${L}(${stem})\\p{L}*`).test(t)) continue;
      // Η ΕΠΟΜΕΝΗ τέτοια μέρα (αν είναι σήμερα: σε μία εβδομάδα, εκτός από «σήμερα»).
      let diff = (wd - weekdayOf(today) + 7) % 7;
      if (diff === 0) diff = 7;
      // «την άλλη/επόμενη εβδομάδα», «την μεθεπόμενη Δευτέρα»
      if (re(`${L}(αλλη|επομενη|ερχομενη)σ? εβδομαδ|μεθεπομεν`).test(t)) diff += 7;
      date = addDays(today, diff);
      break;
    }
  }

  // ── ώρα ──
  let time: string | null = null;
  let partOfDay: PartOfDay | null = null;
  if (re(`${L}(πρωι|proi|morning)`).test(t)) partOfDay = 'morning';
  else if (re(`${L}(μεσημερ|mesimer|noon)`).test(t)) partOfDay = 'noon';
  else if (re(`${L}(απογευμ|apogevm|afternoon)|${L}μ\\s?\\.?\\s?μ\\.?${R}|${L}(pm)${R}`).test(t)) partOfDay = 'afternoon';
  else if (re(`${L}(βραδ|vrad|evening|night)`).test(t)) partOfDay = 'evening';
  const am = re(`${L}π\\s?\\.?\\s?μ\\.?${R}|${L}am${R}`).test(t);

  let hh: number | null = null, mm = 0;
  const hm = /(?<![\d/.])([01]?\d|2[0-3])[:.]([0-5]\d)(?![\d/.])/.exec(t);
  if (hm) { hh = Number(hm[1]); mm = Number(hm[2]); }
  else {
    const at = re(`${L}(?:στισ|στη|στην|stis|at)\\s+(\\d{1,2})${R}`).exec(t)
      ?? re(`${L}(\\d{1,2})\\s*(?:η ωρα|ωρα|μ\\.?μ|π\\.?μ|pm|am)`).exec(t)
      ?? re(`${L}(\\d{1,2})\\s+(?:το\\s+|τη\\s+|to\\s+)?(?:πρωι|μεσημερ|απογευμ|βραδ|proi|mesimer|apogevm|vrad)`).exec(t);
    if (at) hh = Number(at[1]);
    else {
      for (const [w, n] of NUMBER_WORDS) {
        if (re(`${L}(?:στισ|stis)\\s+(${w})${R}`).test(t)) { hh = n; break; }
      }
    }
    if (hh != null && re(`(και μιση|kai misi|μιση|:30)`).test(t)) mm = 30;
    else if (hh != null && re(`(και τεταρτο|kai tetarto)`).test(t)) mm = 15;
  }

  if (hh != null) {
    if (hh <= 12) {
      if ((partOfDay === 'afternoon' || partOfDay === 'evening') && hh < 12) hh += 12;
      else if (partOfDay === 'noon' && hh < 6) hh += 12;
      else if (!partOfDay && !am && hh >= 1 && hh <= 7) { hh += 12; assumed.push(`«στις ${hh - 12}» ⇒ ${hh}:${pad(mm)} (απόγευμα, ώρες γραφείου)`); }
    }
    time = `${pad(hh)}:${pad(mm)}`;
  }

  if (date && weekdayOf(date) !== undefined && !re(`${L}(σημερα|αυριο|μεθαυριο|simera|avrio|methavrio)`).test(t) && WEEKDAYS.some(([s]) => re(`${L}(${s})`).test(t))) {
    assumed.push(`${WEEKDAY_EL[weekdayOf(date)]} ${date.split('-').reverse().join('/')}`);
  }
  return { date, time, partOfDay, assumed };
}

/** Αρχή/τέλος τμήματος ημέρας (για πρόταση ελεύθερης ώρας όταν λείπει η ακριβής). */
export const PART_OF_DAY_RANGE: Record<PartOfDay, [string, string]> = {
  morning: ['09:00', '12:00'], noon: ['12:00', '15:00'], afternoon: ['15:00', '19:00'], evening: ['18:00', '21:00'],
};
