// lib/dashboard/finance.ts — ΚΑΘΑΡΟ. Συγκεντρωτικά της αρχικής από το στιγμιότυπο κερδοφορίας των
// έργων (ProjectFinancials — ΠΟΤΕ ζωντανά από το SoftOne). Κάθε παραστατικό μετρά με το μερίδιο που
// αναλογεί στο έργο (DocRef.net/gross), άρα το άθροισμα ανά έργο δεν διπλομετρά τα κοινά παραστατικά.

import type { ProjectProfit, AgeBucket } from '@/lib/project-profit/calc';

type DocLite = { date: string | null; net: number; gross: number };
export type ProfitLite = {
  prjc: number;
  revenue: { docs: DocLite[] };
  costs: { docs: DocLite[] };
  collections: { docs: DocLite[]; ageing: AgeBucket[] };
};

export type MonthPoint = { month: string; label: string; revenue: number; costs: number; collected: number };

const MONTHS_EL = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Οι `n` τελευταίοι μήνες ως «YYYY-MM», με τον τρέχοντα τελευταίο. */
export function lastMonths(today: string, n = 12): string[] {
  let y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`);
    if (--m === 0) { m = 12; y--; }
  }
  return out;
}

export const monthLabel = (ym: string) => `${MONTHS_EL[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;

export function monthlySeries(profits: ProfitLite[], today: string, n = 12): MonthPoint[] {
  const months = lastMonths(today, n);
  const at = new Map(months.map((m, i) => [m, i]));
  const pts: MonthPoint[] = months.map((m) => ({ month: m, label: monthLabel(m), revenue: 0, costs: 0, collected: 0 }));
  const add = (docs: DocLite[] | undefined, key: 'revenue' | 'costs' | 'collected', v: (d: DocLite) => number) => {
    for (const d of docs ?? []) {
      const i = d.date ? at.get(d.date.slice(0, 7)) : undefined;
      if (i != null) pts[i][key] += v(d);
    }
  };
  for (const p of profits) {
    add(p.revenue?.docs, 'revenue', (d) => d.net);
    add(p.costs?.docs, 'costs', (d) => d.net);
    // Εισπράξεις = ό,τι μπήκε στο ταμείο, άρα μικτά.
    add(p.collections?.docs, 'collected', (d) => d.gross);
  }
  return pts.map((p) => ({ ...p, revenue: r2(p.revenue), costs: r2(p.costs), collected: r2(p.collected) }));
}

export type MtdPair = { revenue: number; collected: number };

/**
 * Τρέχων μήνας μέχρι σήμερα έναντι του ΙΔΙΟΥ διαστήματος του προηγούμενου μήνα (1η έως την ίδια
 * ημέρα) — η σύγκριση με ολόκληρο τον προηγούμενο μήνα θα έδειχνε «πτώση» κάθε αρχή του μήνα.
 */
export function monthToDate(profits: ProfitLite[], today: string): { cur: MtdPair; prev: MtdPair } {
  const [curYm, prevYm] = lastMonths(today, 2).reverse();
  const day = today.slice(8, 10);
  const cur = { revenue: 0, collected: 0 }, prev = { revenue: 0, collected: 0 };
  const take = (docs: DocLite[] | undefined, key: keyof MtdPair, v: (d: DocLite) => number) => {
    for (const d of docs ?? []) {
      if (!d.date) continue;
      const ym = d.date.slice(0, 7), dd = d.date.slice(8, 10);
      if (ym === curYm && dd <= day) cur[key] += v(d);
      else if (ym === prevYm && dd <= day) prev[key] += v(d);
    }
  };
  for (const p of profits) {
    take(p.revenue?.docs, 'revenue', (d) => d.net);
    take(p.collections?.docs, 'collected', (d) => d.gross);
  }
  return { cur: { revenue: r2(cur.revenue), collected: r2(cur.collected) }, prev: { revenue: r2(prev.revenue), collected: r2(prev.collected) } };
}

/** Ενηλικίωση όλων των έργων: άθροισμα ανά κάδο, με τη σειρά του πρώτου έργου που τον ορίζει. */
export function totalAgeing(profits: ProfitLite[]): AgeBucket[] {
  const by = new Map<string, number>();
  for (const p of profits) for (const b of p.collections?.ageing ?? []) by.set(b.label, (by.get(b.label) ?? 0) + b.amount);
  return [...by].map(([label, amount]) => ({ label, amount: r2(amount) }));
}

export type RiskRow = { prjc: number; code: string; name: string; netProfit: number; marginPct: number | null; revenue: number; issues: number; reasons: RiskReason[] };
export type RiskReason = 'loss' | 'low-margin' | 'issues' | 'no-revenue';
export const RISK_LABEL: Record<RiskReason, string> = { loss: 'Ζημιά', 'low-margin': 'Χαμηλό περιθώριο', issues: 'Λείπουν δεδομένα', 'no-revenue': 'Κόστος χωρίς τιμολόγηση' };
export const LOW_MARGIN_PCT = 10;

type FinRow = { prjc: number; revenue: number; costs: number; netProfit: number; marginPct: number | null; issues: number };

/** Έργα που θέλουν ματιά — πρώτα οι μεγαλύτερες ζημιές, μετά όσα έχουν τα περισσότερα προβλήματα. */
export function projectsAtRisk(rows: FinRow[], names: Map<number, { code: string; name: string }>, limit = 6): RiskRow[] {
  const out: RiskRow[] = [];
  for (const r of rows) {
    const p = names.get(r.prjc);
    if (!p) continue;
    const reasons: RiskReason[] = [];
    if (r.revenue <= 0 && r.costs > 0) reasons.push('no-revenue');
    else if (r.netProfit < 0) reasons.push('loss');
    else if (r.marginPct != null && r.marginPct < LOW_MARGIN_PCT) reasons.push('low-margin');
    if (r.issues > 0) reasons.push('issues');
    if (reasons.length) out.push({ prjc: r.prjc, code: p.code, name: p.name, netProfit: r.netProfit, marginPct: r.marginPct, revenue: r.revenue, issues: r.issues, reasons });
  }
  // Πρώτα ο οικονομικός κίνδυνος (μεγαλύτερη ζημιά πρώτα), μετά όσα έχουν μόνο ελλείψεις δεδομένων.
  const money = (r: RiskRow) => (r.reasons.some((x) => x !== 'issues') ? 0 : 1);
  return out.sort((a, b) => money(a) - money(b) || a.netProfit - b.netProfit || b.issues - a.issues).slice(0, limit);
}

/** `open` = ανοιχτά υπόλοιπα πελατών (μόνο θετικά)· `advances` = προκαταβολές (έργα με είσπραξη πάνω από την τιμολόγηση). */
export type FinanceTotals = { revenue: number; collected: number; open: number; advances: number; costs: number; overhead: number; netProfit: number; marginPct: number | null };

export function financeTotals(rows: { revenue: number; collected: number; openAmount: number; costs: number; overhead: number; netProfit: number }[]): FinanceTotals {
  const s = rows.reduce((a, r) => ({
    revenue: a.revenue + r.revenue, collected: a.collected + r.collected,
    open: a.open + Math.max(0, r.openAmount), advances: a.advances + Math.max(0, -r.openAmount),
    costs: a.costs + r.costs, overhead: a.overhead + r.overhead, netProfit: a.netProfit + r.netProfit,
  }), { revenue: 0, collected: 0, open: 0, advances: 0, costs: 0, overhead: 0, netProfit: 0 });
  return {
    revenue: r2(s.revenue), collected: r2(s.collected), open: r2(s.open), advances: r2(s.advances), costs: r2(s.costs), overhead: r2(s.overhead), netProfit: r2(s.netProfit),
    marginPct: s.revenue > 0 ? r2((s.netProfit / s.revenue) * 100) : null,
  };
}

/** Από το πλήρες ProjectProfit κρατάμε μόνο ό,τι χρειάζεται η αρχική. */
export const toLite = (p: ProjectProfit): ProfitLite => ({
  prjc: p.prjc,
  revenue: { docs: p.revenue?.docs ?? [] },
  costs: { docs: p.costs?.docs ?? [] },
  collections: { docs: p.collections?.docs ?? [], ageing: p.collections?.ageing ?? [] },
});
