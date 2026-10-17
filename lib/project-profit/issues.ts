/**
 * «ΔΕΔΟΜΕΝΑ ΠΟΥ ΛΕΙΠΟΥΝ» στην κερδοφορία έργων — εντοπισμός, ΚΑΘΑΡΟΣ (χωρίς βάση/SoftOne).
 *
 * Κανόνας: όπου λείπει ή είναι λάθος η εγγραφή στο SoftOne, ΔΕΝ μαντεύουμε σιωπηλά. Το ποσό ΔΕΝ
 * μπαίνει στο έργο· βγαίνει θέμα με συγκεκριμένη ενέργεια, για:
 *  - τον ΛΟΓΙΣΤΗ («Ερωτήματα λογιστή», ομάδα «Έργα») — παραστατικά που θέλουν σήμανση/καταχώριση·
 *  - τον INTEGRATOR («Αναφορά integrator», αυτόματος έλεγχος) — ρυθμίσεις σειρών/μετασχηματισμών.
 *
 * Λογιστικό μοντέλο της εγκατάστασης: το SoftOne κρατά ΕΜΠΟΡΙΚΗ διαχείριση (πωλήσεις, αγορές, εμβάσματα
 * πελατών/προμηθευτών), ΧΩΡΙΣ γενική λογιστική (ο πίνακας ACNT είναι κενός). Γι' αυτό οι οδηγίες μιλούν
 * για παραστατικά, σειρές και καρτέλες συναλλασσομένων — όχι για λογαριασμούς γενικής.
 */
import {
  CUSTOMER_REMITTANCES, PURCHASES, SALES, SUPPLIER_REMITTANCES, SUSPECT_RATIO, round2,
  type FinDoc, type ProfitContext, type ProjectProfit, type ProjectRef,
} from './calc';

export type IssueAudience = 'accountant' | 'integrator';

export type IssueDoc = { findoc: number; fincode: string; date: string | null; amount: number };

export type DataIssue = {
  /** Σταθερό κλειδί (χωρίς το πρόθεμα των ερωτημάτων). */
  key: string;
  audience: IssueAudience;
  severity: 'high' | 'mid' | 'low';
  /** Έργα που αφορά — κενό = γενικό θέμα της εγκατάστασης. */
  prjcs: number[];
  title: string;
  /** Η οδηγία, σε πλήρεις προτάσεις. */
  detail: string;
  /** Ποσό που ΔΕΝ μετρά στο έργο εξαιτίας του θέματος (καθαρό ή μικτό, όπως λέει η οδηγία). */
  amount: number | null;
  docs: IssueDoc[];
  /** Για γενικά θέματα: μία γραμμή ανά εύρημα (π.χ. ανά σειρά). */
  rows?: string[];
};

const eur = (n: number) => `${n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('el-GR', { timeZone: 'UTC' }) : '—');
const DOC_LIST_MAX = 15;

export function docList(docs: IssueDoc[]): string {
  const shown = docs.slice(0, DOC_LIST_MAX).map((d) => `${d.fincode} (${fmtDate(d.date)}, ${eur(d.amount)})`);
  return shown.join(' · ') + (docs.length > DOC_LIST_MAX ? ` · και ${docs.length - DOC_LIST_MAX} ακόμη` : '');
}

/** Σύντομο, σταθερό αποτύπωμα των παραστατικών ενός θέματος — αλλάζει όταν αλλάξει το σύνολό τους. */
export function issueFingerprint(issue: Pick<DataIssue, 'docs' | 'rows' | 'amount'>): string {
  const src = issue.docs.length
    ? issue.docs.map((d) => d.findoc).sort((a, b) => a - b).join(',')
    : `${(issue.rows ?? []).join('|')}#${issue.amount ?? ''}`;
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `p:${(h >>> 0).toString(36)}:${issue.docs.length}`;
}

const countsDoc = (d: FinDoc) => !d.cancelled && (d.kind === 'invoice' || d.kind === 'credit');
const projectLabel = (p: ProjectRef) => `${p.code} «${p.name}»`;
const PROJECTS_SHOWN = 5;
const projectsText = (ps: ProjectRef[]) =>
  ps.length === 1
    ? `ένα έργο, το ${projectLabel(ps[0])}`
    : `${ps.length} έργα: ${ps.slice(0, PROJECTS_SHOWN).map(projectLabel).join(', ')}${ps.length > PROJECTS_SHOWN ? ` και ${ps.length - PROJECTS_SHOWN} ακόμη` : ''}`;
const severityFor = (amount: number) => (Math.abs(amount) >= 1000 ? 'high' : 'mid') as 'high' | 'mid';
const sum = (docs: IssueDoc[]) => round2(docs.reduce((s, d) => s + d.amount, 0));

export function detectIssues(
  ctx: ProfitContext,
  projects: ProjectRef[],
  profits: Map<number, ProjectProfit>,
  opts: { itemName?: (mtrl: number) => string } = {},
): DataIssue[] {
  const issues: DataIssue[] = [];
  const docs = [...ctx.docs.values()];
  const byPrjc = new Map(projects.map((p) => [p.prjc, p]));
  const hasProject = (d: FinDoc) => d.prjc != null || (ctx.linesByDoc.get(d.findoc) ?? []).some((l) => l.prjc != null);
  const projectsOf = (d: FinDoc): number[] => {
    const s = new Set<number>();
    if (d.prjc != null) s.add(d.prjc);
    for (const l of ctx.linesByDoc.get(d.findoc) ?? []) if (l.prjc != null) s.add(l.prjc);
    return [...s];
  };
  const toIssueDoc = (d: FinDoc, amount: number): IssueDoc => ({ findoc: d.findoc, fincode: d.fincode, date: d.date, amount: round2(amount) });
  const signed = (d: FinDoc, v: number) => (d.kind === 'credit' ? -v : v);

  // ── 1. Μετασχηματισμός από παραστατικό έργου χωρίς μεταφορά του έργου (ισχυρή ένδειξη) ──
  const fromProjectDoc = new Map<number, number>(); // target findoc → prjc
  for (const [findoc, lines] of ctx.linesByDoc) {
    const d = ctx.docs.get(findoc);
    if (!d || hasProject(d) || !countsDoc(d) || (d.sosource !== SALES && d.sosource !== PURCHASES)) continue;
    for (const l of lines) {
      const src = l.sourceFindoc != null ? ctx.docs.get(l.sourceFindoc) : undefined;
      const p = src ? projectsOf(src)[0] : undefined;
      if (p != null && byPrjc.has(p)) { fromProjectDoc.set(findoc, p); break; }
    }
  }
  const converted = new Map<number, IssueDoc[]>();
  for (const [findoc, p] of fromProjectDoc) {
    const d = ctx.docs.get(findoc)!;
    converted.set(p, [...(converted.get(p) ?? []), toIssueDoc(d, signed(d, d.net))]);
  }
  for (const [p, list] of converted) {
    const pr = byPrjc.get(p)!;
    issues.push({
      key: `from-order:${p}`, audience: 'accountant', severity: 'high', prjcs: [p],
      title: `Τιμολόγια από παραγγελίες του έργου χωρίς το έργο · ${pr.code}`,
      detail: `${list.length === 1 ? 'Ένα παραστατικό προέκυψε' : `${list.length} παραστατικά προέκυψαν`} με μετασχηματισμό από παραγγελία/δελτίο του έργου ${projectLabel(pr)}, αλλά το έργο ΔΕΝ μεταφέρθηκε (καθαρή αξία ${eur(sum(list))}). Μέχρι να διορθωθεί, το ποσό δεν μετρά στο έργο. Ενέργεια: στο SoftOne άνοιξε κάθε παραστατικό και συμπλήρωσε το πεδίο «Έργο» στην κεφαλή. Παραστατικά: ${docList(list)}.`,
      amount: sum(list), docs: list,
    });
  }

  // ── 2. Παραστατικά/εμβάσματα χωρίς έργο, συναλλασσομένων που ΕΧΟΥΝ έργα ──
  const customerProjects = new Map<number, ProjectRef[]>();
  for (const p of projects) if (p.trdr != null) customerProjects.set(p.trdr, [...(customerProjects.get(p.trdr) ?? []), p]);
  // Προμηθευτές με ιστορικό σε έργα: όποιο παραστατικό αγορών (και παραγγελία) φέρει έργο.
  const supplierProjects = new Map<number, Set<number>>();
  for (const d of docs) {
    if (d.sosource !== PURCHASES || d.trdr == null || d.cancelled) continue;
    for (const p of projectsOf(d)) if (byPrjc.has(p)) supplierProjects.set(d.trdr, (supplierProjects.get(d.trdr) ?? new Set()).add(p));
  }
  const earliest = (ps: ProjectRef[]) => {
    const dates = ps.map((p) => p.since).filter((v): v is string => !!v).sort();
    if (!dates.length) return null;
    // 60 ημέρες πριν: προκαταβολές/τιμολόγια μπορεί να προηγούνται της επίσημης έναρξης.
    return new Date(Date.parse(dates[0]) - 60 * 86_400_000).toISOString();
  };

  const groupUnlinked = (filter: (d: FinDoc) => boolean) => {
    const g = new Map<number, FinDoc[]>();
    for (const d of docs) if (d.trdr != null && filter(d) && !hasProject(d) && !fromProjectDoc.has(d.findoc)) g.set(d.trdr, [...(g.get(d.trdr) ?? []), d]);
    return g;
  };

  // 2α. Πωλήσεις
  for (const [trdr, list] of groupUnlinked((d) => d.sosource === SALES && countsDoc(d) && customerProjects.has(d.trdr!))) {
    const ps = customerProjects.get(trdr)!;
    const since = earliest(ps);
    const ds = list.filter((d) => !since || !d.date || d.date >= since).map((d) => toIssueDoc(d, signed(d, d.net)));
    if (!ds.length) continue;
    const name = list[0].traderName ?? `#${trdr}`;
    issues.push({
      key: `sales-no-project:${trdr}`, audience: 'accountant', severity: severityFor(sum(ds)), prjcs: ps.map((p) => p.prjc),
      title: `Πωλήσεις χωρίς έργο · ${name}`,
      detail: `${ds.length} παραστατικ${ds.length === 1 ? 'ό' : 'ά'} πώλησης του πελάτη «${name}» (καθαρή αξία ${eur(sum(ds))}) δεν έχουν έργο, ούτε στην κεφαλή ούτε στις γραμμές. Ο πελάτης έχει ${projectsText(ps)}. Μέχρι να συμπληρωθεί, τα ποσά ΔΕΝ μετρούν στα έσοδα κανενός έργου. Ενέργεια: στο SoftOne → Πωλήσεις άνοιξε κάθε παραστατικό και συμπλήρωσε το πεδίο «Έργο» — ή απάντησε εδώ ότι δεν αφορούν έργο. Παραστατικά: ${docList(ds)}.`,
      amount: sum(ds), docs: ds,
    });
  }

  // 2β. Εμβάσματα πελατών (= εισπράξεις)
  for (const [trdr, list] of groupUnlinked((d) => d.sosource === CUSTOMER_REMITTANCES && !d.cancelled && customerProjects.has(d.trdr!))) {
    const ps = customerProjects.get(trdr)!;
    const since = earliest(ps);
    const ds = list.filter((d) => !since || !d.date || d.date >= since).map((d) => toIssueDoc(d, signed(d, d.total)));
    if (!ds.length) continue;
    const name = list[0].traderName ?? `#${trdr}`;
    issues.push({
      key: `receipts-no-project:${trdr}`, audience: 'accountant', severity: severityFor(sum(ds)), prjcs: ps.map((p) => p.prjc),
      title: `Εισπράξεις χωρίς έργο · ${name}`,
      detail: `${ds.length} έμβασμ${ds.length === 1 ? 'α' : 'ατα'} του πελάτη «${name}» (σύνολο ${eur(sum(ds))}) δεν έχουν έργο. Ο πελάτης έχει ${projectsText(ps)}. Μέχρι να συμπληρωθεί, τα ποσά ΔΕΝ μετρούν ως εισπράξεις έργου και το ανοιχτό υπόλοιπο του έργου φαίνεται μεγαλύτερο. Ενέργεια: στο SoftOne → Εμβάσματα πελατών συμπλήρωσε το «Έργο» σε κάθε έμβασμα· αν ένα έμβασμα καλύπτει περισσότερα έργα, καταχώρισέ το ως ένα έμβασμα ανά έργο. Εμβάσματα: ${docList(ds)}.`,
      amount: sum(ds), docs: ds,
    });
  }

  // 2γ. Τιμολόγια αγορών / λήψης υπηρεσιών προμηθευτών που δουλεύουν σε έργα
  for (const [trdr, list] of groupUnlinked((d) => d.sosource === PURCHASES && countsDoc(d) && supplierProjects.has(d.trdr!))) {
    const ps = [...supplierProjects.get(trdr)!].map((p) => byPrjc.get(p)!).filter(Boolean);
    const since = earliest(ps);
    const ds = list.filter((d) => !since || !d.date || d.date >= since).map((d) => toIssueDoc(d, signed(d, d.net)));
    if (!ds.length) continue;
    const name = list[0].traderName ?? `#${trdr}`;
    issues.push({
      key: `purchases-no-project:${trdr}`, audience: 'accountant', severity: severityFor(sum(ds)), prjcs: ps.map((p) => p.prjc),
      title: `Αγορές χωρίς έργο · ${name}`,
      detail: `${ds.length} τιμολόγι${ds.length === 1 ? 'ο' : 'α'} του προμηθευτή «${name}» (καθαρή αξία ${eur(sum(ds))}) δεν έχουν έργο, ενώ ο προμηθευτής έχει παραγγελίες/τιμολόγια σε ${projectsText(ps)}. Μέχρι να συμπληρωθεί, το κόστος ΔΕΝ μετρά σε κανένα έργο (το κέρδος φαίνεται μεγαλύτερο). Ενέργεια: στο SoftOne → Αγορές συμπλήρωσε το «Έργο» σε όσα αφορούν έργο (στην κεφαλή, ή ανά γραμμή αν μοιράζονται σε έργα)· όσα είναι γενικά έξοδα της επιχείρησης μένουν χωρίς έργο — απάντησε εδώ ποια. Τιμολόγια: ${docList(ds)}.`,
      amount: sum(ds), docs: ds,
    });
  }

  // ── 3. Ανά έργο: έσοδα χωρίς κόστος · κόστος από απόθεμα (εκτίμηση) · εισπράξεις > τιμολόγια ──
  for (const p of projects) {
    const r = profits.get(p.prjc);
    if (!r) continue;
    const realCosts = r.costs.total - r.costs.stock.filter((s) => s.source === 'estimate').reduce((a, s) => a + s.value, 0);
    if (r.revenue.net > 0 && Math.abs(realCosts) < 0.005) {
      issues.push({
        key: `no-costs:${p.prjc}`, audience: 'accountant', severity: 'high', prjcs: [p.prjc],
        title: `Έργο με έσοδα χωρίς καταχωρισμένο κόστος · ${p.code}`,
        detail: `Το έργο ${projectLabel(p)} έχει καθαρά έσοδα ${eur(r.revenue.net)} αλλά κανένα τιμολόγιο αγοράς ή λήψης υπηρεσιών και καμία εξαγωγή αποθήκης με το έργο. Το καθαρό κέρδος του είναι επομένως υπερεκτιμημένο. Ενέργεια: καταχώρισε (ή σήμανε με το έργο) τα τιμολόγια προμηθευτών, υπεργολάβων και μεταφορέων του έργου· αν τα υλικά δόθηκαν από το απόθεμα, κάνε εξαγωγή αποθήκης (Αποθήκη → Εξαγωγή ποσότητας) με το έργο.`,
        amount: null, docs: [],
      });
    }
    const est = r.costs.stock.filter((s) => s.source === 'estimate');
    if (est.length) {
      const noCost = est.filter((s) => s.unitCost == null);
      const suspect = est.filter((s) => s.suspect);
      const counted = round2(est.reduce((a, s) => a + s.value, 0));
      const name = (m: number) => opts.itemName?.(m) ?? `είδος #${m}`;
      const notes = [
        noCost.length ? `${noCost.length} δεν έχ${noCost.length === 1 ? 'ει' : 'ουν'} καμία τιμή αγοράς και μετρ${noCost.length === 1 ? 'ά' : 'ούν'} με κόστος 0` : null,
        suspect.length ? `σε ${suspect.length} η τελευταία τιμή αγοράς είναι πάνω από ${SUSPECT_RATIO}× την τιμή πώλησης (πιθανό λάθος μονάδας μέτρησης ή σχέσης μονάδων στο είδος/παραστατικό) και ΔΕΝ μετρήθηκε: ${suspect.slice(0, PROJECTS_SHOWN).map((s) => `${name(s.mtrl)} — αγορά ${eur(s.unitCost!)}/μον., πώληση ${eur(s.salesUnit ?? 0)}/μον.`).join(' · ')}` : null,
      ].filter(Boolean);
      issues.push({
        key: `stock-estimate:${p.prjc}`, audience: 'accountant', severity: noCost.length || suspect.length ? 'high' : 'mid', prjcs: [p.prjc],
        title: `Υλικά πωλήθηκαν χωρίς κόστος στο έργο · ${p.code}`,
        detail: `${est.length} υλικ${est.length === 1 ? 'ό' : 'ά'} τιμολογήθηκ${est.length === 1 ? 'ε' : 'αν'} στον πελάτη του έργου ${projectLabel(p)} χωρίς αγορά ή εξαγωγή αποθήκης με το έργο. Το κόστος τους μετρά ως ΕΚΤΙΜΗΣΗ με την τελευταία τιμή αγοράς (${eur(counted)})${notes.length ? `· ${notes.join('· ')}` : ''}. Ενέργεια: σήμανε με το έργο τα τιμολόγια αγοράς τους· αν βγήκαν από το απόθεμα, κάνε εξαγωγή αποθήκης με το έργο. Υλικά: ${est.slice(0, DOC_LIST_MAX).map((s) => `${name(s.mtrl)} × ${round2(s.qty)}`).join(' · ')}${est.length > DOC_LIST_MAX ? ` · και ${est.length - DOC_LIST_MAX} ακόμη` : ''}.`,
        amount: counted || null, docs: [],
      });
    }
    if (r.collections.collected - r.revenue.gross > 1) {
      const diff = round2(r.collections.collected - r.revenue.gross);
      issues.push({
        key: `overcollected:${p.prjc}`, audience: 'accountant', severity: 'low', prjcs: [p.prjc],
        title: `Εισπράξεις περισσότερες από την τιμολόγηση · ${p.code}`,
        detail: `Στο έργο ${projectLabel(p)} εισπράχθηκαν ${eur(r.collections.collected)} ενώ τιμολογήθηκαν (μικτά) ${eur(r.revenue.gross)} — διαφορά ${eur(diff)}. Είναι προκαταβολή για τιμολόγιο που θα εκδοθεί, ή λείπει τιμολόγιο πώλησης με το έργο; Ενέργεια: αν έχει εκδοθεί τιμολόγιο, συμπλήρωσε σε αυτό το «Έργο»· αν είναι προκαταβολή, απάντησε εδώ για να μη ξαναρωτηθεί μέχρι να αλλάξει το ποσό.`,
        amount: diff, docs: [],
      });
    }
  }

  // ── 4. INTEGRATOR: σειρές που η εφαρμογή δεν γνωρίζει ──
  const unknown = new Map<string, { sosource: number; series: string; n: number }>();
  for (const d of docs) {
    if (d.seriesName != null || d.cancelled || (d.sosource !== SALES && d.sosource !== PURCHASES) || !hasProject(d)) continue;
    const k = `${d.sosource}:${d.series}`;
    const e = unknown.get(k) ?? { sosource: d.sosource, series: d.series, n: 0 };
    e.n++;
    unknown.set(k, e);
  }
  if (unknown.size) {
    const rows = [...unknown.values()].map((u) => `${u.sosource === SALES ? 'Πωλήσεις' : 'Αγορές'} · σειρά ${u.series}: ${u.n} παραστατικ${u.n === 1 ? 'ό' : 'ά'} έργων`);
    issues.push({
      key: 'unknown-series', audience: 'integrator', severity: 'low', prjcs: [], rows,
      title: 'Έργα: σειρές παραστατικών που δεν είναι στο μητρώο σειρών',
      detail: 'Παραστατικά με έργο ανήκουν σε σειρές που δεν επιστρέφει ο συγχρονισμός σειρών (ανενεργές ή άλλης εταιρίας/χρήσης). Η εφαρμογή δεν ξέρει αν είναι τιμολόγιο ή παραγγελία, άρα ΔΕΝ τα μετρά στην κερδοφορία. Ενέργεια integrator: επιβεβαίωσε τον τύπο τους (υποενότητα) και, αν είναι ενεργές, να εμφανίζονται στον πίνακα SERIES της εταιρίας· μετά «Συγχρονισμός σειρών».',
      amount: null, docs: [],
    });
  }

  // ── 5. INTEGRATOR: το «Έργο» δεν είναι υποχρεωτικό/δεν μεταφέρεται στις σειρές που το χρειάζονται ──
  const projectSince = projects.map((p) => p.since).filter((v): v is string => !!v).sort()[0] ?? null;
  const perSeries = new Map<string, { label: string; total: number; without: number; withProject: number }>();
  const MODULE: Record<number, string> = { [SALES]: 'Πωλήσεις', [PURCHASES]: 'Αγορές', [CUSTOMER_REMITTANCES]: 'Εμβάσματα πελατών', [SUPPLIER_REMITTANCES]: 'Εμβάσματα προμηθευτών' };
  for (const d of docs) {
    if (!MODULE[d.sosource] || d.cancelled) continue;
    if ((d.sosource === SALES || d.sosource === PURCHASES) && !countsDoc(d)) continue;
    if (projectSince && d.date && d.date < projectSince) continue;
    const k = `${d.sosource}:${d.series}`;
    const e = perSeries.get(k) ?? { label: `${MODULE[d.sosource]} · ${d.seriesName ?? 'σειρά'} (${d.series})`, total: 0, without: 0, withProject: 0 };
    e.total++;
    if (hasProject(d)) e.withProject++; else e.without++;
    perSeries.set(k, e);
  }
  const loose = [...perSeries.values()].filter((e) => e.withProject > 0 && e.without > 0).sort((a, b) => b.without - a.without);
  if (loose.length) {
    const rows = loose.map((e) => `${e.label}: ${e.without} από ${e.total} χωρίς έργο`);
    const conv = converted.size ? ' Επιπλέον, σε μετασχηματισμούς παραγγελία/δελτίο → τιμολόγιο το έργο ΔΕΝ μεταφέρεται — να μεταφέρεται από την κεφαλή και τις γραμμές του αρχικού παραστατικού.' : '';
    issues.push({
      key: 'project-field-optional', audience: 'integrator', severity: 'mid', prjcs: [], rows,
      title: 'Έργα: το πεδίο «Έργο» λείπει συστηματικά σε σειρές που το χρησιμοποιούν',
      detail: `Στις παρακάτω σειρές άλλα παραστατικά φέρουν έργο και άλλα όχι, οπότε τα έσοδα, οι εισπράξεις και το κόστος των έργων μένουν ελλιπή. Ενέργεια integrator: στις σειρές αυτές το «Έργο» να είναι υποχρεωτικό ή να ζητείται με προειδοποίηση, με προεπιλογή από τον πελάτη (όταν έχει ένα ενεργό έργο) ή από το παραστατικό προέλευσης.${conv}`,
      amount: null, docs: [],
    });
  }

  return issues;
}

