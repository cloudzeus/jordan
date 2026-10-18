// lib/softone-mirror/core.ts — ΚΑΘΑΡΗ λογική του καθρέφτη παραστατικών SoftOne (χωρίς βάση, χωρίς δίκτυο).
//
// Εδώ ζουν όσα πρέπει να είναι σωστά για να μη χαθεί ούτε ένα παραστατικό: το watermark (μέχρι πού
// έχουμε δει), το φίλτρο «ό,τι άλλαξε από τότε», η μετατροπή γραμμών SoftOne ↔ καθρέφτη και το σχέδιο
// της νυχτερινής συμφωνίας (τι σβήνεται, τι ξανακατεβαίνει). Όλα με unit tests.
//
// ΤΟ ΡΟΛΟΙ. Το UPDDATE γράφεται από τον SQL Server του SoftOne σε ΑΛΛΗ ζώνη από το INSDATE (μετρημένο
// στο atelier 2026-10-16: INSDATE 12:00, UPDDATE 09:31 για το ίδιο παραστατικό). Γι' αυτό το watermark
// είναι ΠΑΝΤΑ η μεγαλύτερη τιμή UPDDATE που μας έδωσε ο ίδιος ο SoftOne — ποτέ το δικό μας «τώρα» —
// και κάθε ερώτημα ξεκινά λίγο ΠΙΟ ΠΙΣΩ (overlap), ώστε μια εγγραφή που αποθηκεύτηκε με λίγο
// παλαιότερο UPDDATE από τη στιγμή που ρωτήσαμε να μη χαθεί. Τα διπλά δεν πειράζουν: γίνεται upsert.

/** «yyyy-mm-dd hh:mm:ss» — η μορφή που επιστρέφει το GetTable για datetime. */
const S1_TS = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/;

/** Κανονικοποιεί μια τιμή datetime του SoftOne σε «yyyy-mm-dd hh:mm:ss» (λεξικογραφικά συγκρίσιμη) ή null. */
export function s1Stamp(v: unknown): string | null {
  const m = S1_TS.exec(String(v ?? '').trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4] ?? '00'}:${m[5] ?? '00'}:${m[6] ?? '00'}`;
}

/** Ώρα SoftOne (χωρίς ζώνη) → Date με τα ίδια ψηφία σε UTC. Αντίστροφο: {@link stampOf}. */
export function s1DateTime(v: unknown): Date | null {
  const s = s1Stamp(v);
  if (!s) return null;
  const d = new Date(`${s.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date (ψηφία SoftOne σε UTC) → «yyyy-mm-dd hh:mm:ss», όπως θα το έδινε το GetTable. */
export function stampOf(d: Date | null | undefined): string {
  if (!d) return '';
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** Το μεγαλύτερο από δύο watermarks (null = «τίποτα ακόμη»). */
export function maxStamp(a: string | null | undefined, b: string | null | undefined): string | null {
  const x = s1Stamp(a);
  const y = s1Stamp(b);
  if (!x) return y;
  if (!y) return x;
  return x >= y ? x : y;
}

/** Πόσο πίσω από το watermark ξαναρωτάμε. Φτηνό (upsert) και καλύπτει μικρές αποκλίσεις ρολογιού. */
export const DEFAULT_OVERLAP_MIN = 60;

/**
 * Από πότε ρωτάμε: watermark − overlap, σε ISO-8601 («yyyy-mm-ddThh:mm:ss») για `CONVERT(…,126)`.
 * Η μορφή με κενό διαβάζεται dmy από τον SQL Server — γι' αυτό ΠΑΝΤΑ ISO. `null` = πλήρης φόρτωση.
 */
export function sinceOf(watermark: string | null | undefined, overlapMin = DEFAULT_OVERLAP_MIN): string | null {
  const d = s1DateTime(watermark);
  if (!d) return null;
  return new Date(d.getTime() - overlapMin * 60_000).toISOString().slice(0, 19);
}

/**
 * Φίλτρο GetTable «άλλαξε ή γράφτηκε από τότε». Το INSDATE μπαίνει ως δίχτυ για εγγραφές με κενό
 * UPDDATE· επειδή είναι σε ζώνη ΜΠΡΟΣΤΑ από το UPDDATE, φέρνει απλώς λίγα παραπάνω — ποτέ λιγότερα.
 */
export function changedSinceFilter(since: string, withInsDate = true): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(since)) throw new Error(`Μη έγκυρη ημερομηνία φίλτρου: ${since}`);
  const c = `CONVERT(datetime,'${since}',126)`;
  return withInsDate ? `(UPDDATE >= ${c} OR INSDATE >= ${c})` : `UPDDATE >= ${c}`;
}

/** Το νέο watermark μετά από έναν κύκλο: το μέγιστο UPDDATE των γραμμών που ήρθαν (ή το παλιό). */
export function nextWatermark(prev: string | null | undefined, rows: { UPDDATE?: string }[]): string | null {
  let wm = s1Stamp(prev);
  for (const r of rows) wm = maxStamp(wm, r.UPDDATE);
  return wm;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Πεδία GetTable (επιβεβαιωμένα ζωντανά — βλ. lib/document-detail.ts, lib/project-profit). ΠΡΟΣΟΧΗ: το
// GetTable παραλείπει ΣΙΩΠΗΛΑ πεδίο που δεν υπάρχει και μετατοπίζει τα επόμενα — μην προσθέτεις
// πεδίο εδώ χωρίς να το δεις να επιστρέφει.
// ─────────────────────────────────────────────────────────────────────────────

export const FINDOC_FIELDS = ['FINDOC', 'FINCODE', 'TRNDATE', 'SERIES', 'SOSOURCE', 'TRDR', 'PRJC', 'NETAMNT', 'VATAMNT', 'SUMAMNT', 'DISC1PRC', 'DISC1VAL', 'ISCANCEL', 'COMMENTS', 'COMMENTS1', 'REMARKS', 'INSDATE', 'UPDDATE'];
export const MTRLINE_FIELDS = ['FINDOC', 'MTRLINES', 'LINENUM', 'MTRL', 'QTY1', 'QTY', 'MTRUNIT', 'PRICE', 'DISC1PRC', 'DISC2PRC', 'DISC1VAL', 'LINEVAL', 'NETLINEVAL', 'VAT', 'VATAMNT', 'COMMENTS', 'COMMENTS1', 'PRJC', 'SODTYPE', 'FINDOCS'];
export const TRDLINE_FIELDS = ['FINDOC', 'TRDTLINES', 'TRDR', 'LINENUM', 'LINEVAL', 'PRJC'];
export const MYDATA_FIELDS = ['MYDATAHEADER', 'SOSOURCE', 'SOID', 'MARK', 'QRURL', 'INVOICEURL', 'ISCANCEL', 'UPDDATE'];
export const BALANCE_FIELDS = ['TRDR', 'FISCPRD', 'PERIOD', 'LDEBIT', 'LCREDIT'];

type Row = Record<string, string>;

const num = (v: string | undefined): number => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
/** Θετικός ακέραιος id ή null (κενό / 0 = «χωρίς»). */
const idOrNull = (v: string | undefined): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const intOrNull = (v: string | undefined): number | null => {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};
const text = (v: string | undefined): string | null => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};

export function mapFindoc(r: Row) {
  const findoc = idOrNull(r.FINDOC);
  if (findoc == null) return null;
  return {
    findoc,
    fincode: r.FINCODE ?? '',
    trnDate: s1DateTime(s1Stamp(r.TRNDATE)?.slice(0, 10)),
    series: r.SERIES ?? '',
    sosource: num(r.SOSOURCE),
    trdr: idOrNull(r.TRDR),
    prjc: idOrNull(r.PRJC),
    net: num(r.NETAMNT),
    vat: num(r.VATAMNT),
    total: num(r.SUMAMNT),
    disc1Prc: num(r.DISC1PRC),
    disc1Val: num(r.DISC1VAL),
    isCancel: num(r.ISCANCEL),
    comments: text(r.COMMENTS),
    comments1: text(r.COMMENTS1),
    remarks: text(r.REMARKS),
    insDate: s1DateTime(r.INSDATE),
    updRaw: s1Stamp(r.UPDDATE),
  };
}
export type FindocData = NonNullable<ReturnType<typeof mapFindoc>>;

export function mapMtrLine(r: Row) {
  const findoc = idOrNull(r.FINDOC);
  const mtrlines = intOrNull(r.MTRLINES);
  if (findoc == null || mtrlines == null) return null;
  return {
    findoc, mtrlines,
    lineNum: intOrNull(r.LINENUM),
    mtrl: idOrNull(r.MTRL),
    qty1: num(r.QTY1), qty: num(r.QTY),
    mtrUnit: text(r.MTRUNIT),
    price: num(r.PRICE), disc1Prc: num(r.DISC1PRC), disc2Prc: num(r.DISC2PRC), disc1Val: num(r.DISC1VAL),
    lineVal: num(r.LINEVAL), netLineVal: num(r.NETLINEVAL),
    vat: text(r.VAT), vatAmnt: num(r.VATAMNT),
    comments: text(r.COMMENTS), comments1: text(r.COMMENTS1),
    prjc: idOrNull(r.PRJC), sodtype: intOrNull(r.SODTYPE), findocs: idOrNull(r.FINDOCS),
  };
}
export type MtrLineData = NonNullable<ReturnType<typeof mapMtrLine>>;

export function mapTrdLine(r: Row) {
  const findoc = idOrNull(r.FINDOC);
  const trdtlines = intOrNull(r.TRDTLINES);
  if (findoc == null || trdtlines == null) return null;
  return { findoc, trdtlines, trdr: idOrNull(r.TRDR), lineNum: intOrNull(r.LINENUM), lineVal: num(r.LINEVAL), prjc: idOrNull(r.PRJC) };
}
export type TrdLineData = NonNullable<ReturnType<typeof mapTrdLine>>;

export function mapMyData(r: Row) {
  const id = idOrNull(r.MYDATAHEADER);
  const soid = idOrNull(r.SOID);
  if (id == null || soid == null) return null;
  return {
    id, soid, sosource: num(r.SOSOURCE), mark: text(r.MARK), qrUrl: text(r.QRURL), invoiceUrl: text(r.INVOICEURL),
    isCancel: num(r.ISCANCEL), updRaw: s1Stamp(r.UPDDATE),
  };
}
export type MyDataData = NonNullable<ReturnType<typeof mapMyData>>;

export function mapBalance(r: Row) {
  const trdr = idOrNull(r.TRDR);
  if (trdr == null) return null;
  return { trdr, fiscPrd: num(r.FISCPRD), period: num(r.PERIOD), debit: num(r.LDEBIT), credit: num(r.LCREDIT) };
}

export function compact<T>(xs: (T | null)[]): T[] {
  return xs.filter((x): x is T => x != null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Καθρέφτης → γραμμές «σαν GetTable». Οι αναγνώστες (καρτέλα, έργα, κερδοφορία) δουλεύουν πάνω σε
// `Record<string,string>` όπως τα δίνει το SoftOne· ο καθρέφτης τους τα σερβίρει στο ΙΔΙΟ σχήμα, ώστε η
// λογική τους να μείνει ακριβώς ίδια ανεξάρτητα από την πηγή.
// ─────────────────────────────────────────────────────────────────────────────

const s = (v: number | string | null | undefined): string => (v == null ? '' : String(v));

export function findocRow(d: {
  findoc: number; fincode: string; trnDate: Date | null; series: string; sosource: number; trdr: number | null; prjc: number | null;
  net: number; vat: number; total: number; disc1Prc: number; disc1Val: number; isCancel: number;
  comments: string | null; comments1: string | null; remarks: string | null; insDate: Date | null; updRaw: string | null;
}): Row {
  return {
    FINDOC: s(d.findoc), FINCODE: d.fincode, TRNDATE: stampOf(d.trnDate), SERIES: d.series, SOSOURCE: s(d.sosource),
    TRDR: s(d.trdr), PRJC: s(d.prjc), NETAMNT: s(d.net), VATAMNT: s(d.vat), SUMAMNT: s(d.total),
    DISC1PRC: s(d.disc1Prc), DISC1VAL: s(d.disc1Val), ISCANCEL: s(d.isCancel),
    COMMENTS: d.comments ?? '', COMMENTS1: d.comments1 ?? '', REMARKS: d.remarks ?? '',
    INSDATE: stampOf(d.insDate), UPDDATE: d.updRaw ?? '',
  };
}

export function mtrLineRow(l: MtrLineData): Row {
  return {
    FINDOC: s(l.findoc), MTRLINES: s(l.mtrlines), LINENUM: s(l.lineNum), MTRL: s(l.mtrl), QTY1: s(l.qty1), QTY: s(l.qty),
    MTRUNIT: l.mtrUnit ?? '', PRICE: s(l.price), DISC1PRC: s(l.disc1Prc), DISC2PRC: s(l.disc2Prc), DISC1VAL: s(l.disc1Val),
    LINEVAL: s(l.lineVal), NETLINEVAL: s(l.netLineVal), VAT: l.vat ?? '', VATAMNT: s(l.vatAmnt),
    COMMENTS: l.comments ?? '', COMMENTS1: l.comments1 ?? '', PRJC: s(l.prjc), SODTYPE: s(l.sodtype), FINDOCS: s(l.findocs),
  };
}

export function trdLineRow(l: TrdLineData): Row {
  return { FINDOC: s(l.findoc), TRDTLINES: s(l.trdtlines), TRDR: s(l.trdr), LINENUM: s(l.lineNum), LINEVAL: s(l.lineVal), PRJC: s(l.prjc) };
}

export function myDataRow(m: MyDataData): Row {
  return {
    MYDATAHEADER: s(m.id), SOSOURCE: s(m.sosource), SOID: s(m.soid), MARK: m.mark ?? '', QRURL: m.qrUrl ?? '',
    INVOICEURL: m.invoiceUrl ?? '', ISCANCEL: s(m.isCancel), UPDDATE: m.updRaw ?? '',
  };
}

export function balanceRow(b: { trdr: number; fiscPrd: number; period: number; debit: number; credit: number }): Row {
  return { TRDR: s(b.trdr), FISCPRD: s(b.fiscPrd), PERIOD: s(b.period), LDEBIT: s(b.debit), LCREDIT: s(b.credit) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Νυχτερινή συμφωνία
// ─────────────────────────────────────────────────────────────────────────────

export type ReconcilePlan = {
  /** Υπάρχουν τοπικά, όχι πια στο SoftOne ⇒ σβήνονται (μαζί με τις γραμμές τους). */
  toDelete: number[];
  /** Λείπουν τοπικά ή έχουν άλλο UPDDATE ⇒ ξανακατεβαίνουν ολόκληρα. */
  toFetch: number[];
  /** Αν δεν είναι null, ΔΕΝ εφαρμόζεται τίποτα (ύποπτη απάντηση). */
  abort: string | null;
};

/**
 * Σύγκριση «τι έχει το SoftOne» με «τι έχουμε». Άμυνα: μια άδεια ή κουτσουρεμένη απάντηση του ERP
 * δεν επιτρέπεται να αδειάσει τον καθρέφτη — πάνω από `maxDeleteRatio` διαγραφές ⇒ ακύρωση.
 */
export function planReconcile(
  remote: { id: number; upd: string | null }[],
  local: { id: number; upd: string | null }[],
  opts: { maxDeleteRatio?: number } = {},
): ReconcilePlan {
  const maxRatio = opts.maxDeleteRatio ?? 0.2;
  const remoteBy = new Map(remote.map((r) => [r.id, s1Stamp(r.upd)]));
  const localBy = new Map(local.map((r) => [r.id, s1Stamp(r.upd)]));
  if (remote.length === 0 && local.length > 0) {
    return { toDelete: [], toFetch: [], abort: 'Το SoftOne δεν επέστρεψε καμία εγγραφή — ο καθρέφτης δεν αδειάζει.' };
  }
  const toDelete = [...localBy.keys()].filter((id) => !remoteBy.has(id)).sort((a, b) => a - b);
  const toFetch = [...remoteBy.entries()].filter(([id, upd]) => !localBy.has(id) || localBy.get(id) !== upd).map(([id]) => id).sort((a, b) => a - b);
  if (local.length >= 20 && toDelete.length > local.length * maxRatio) {
    return {
      toDelete: [], toFetch: [],
      abort: `Θα διαγράφονταν ${toDelete.length} από ${local.length} εγγραφές — πάνω από το όριο ασφαλείας· τίποτα δεν άλλαξε.`,
    };
  }
  return { toDelete, toFetch, abort: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Φρεσκάδα
// ─────────────────────────────────────────────────────────────────────────────

/** Μετά από τόση ώρα χωρίς επιτυχημένο κύκλο, οι οθόνες ξαναπάνε ζωντανά στο SoftOne. */
export const STALE_MS = 30 * 60_000;

export type MirrorStateLike = { tenantKey: string; rows: number; lastOkAt: Date | null; watermark: string | null } | null;

/** Ο καθρέφτης αξίζει να διαβαστεί: έχει δεδομένα, είναι της τωρινής εγκατάστασης και φρέσκος. */
export function mirrorUsable(state: MirrorStateLike, currentTenant: string | null, now = Date.now(), maxAgeMs = STALE_MS): 'fresh' | 'stale' | 'none' {
  if (!state || !state.lastOkAt || state.rows <= 0) return 'none';
  if (currentTenant && state.tenantKey !== currentTenant) return 'none';
  return now - state.lastOkAt.getTime() <= maxAgeMs ? 'fresh' : 'stale';
}

/**
 * Από όσα γύρισε το «άλλαξε από τότε», κρατά ΜΟΝΟ όσα όντως διαφέρουν από τον καθρέφτη (νέα ή άλλο
 * UPDDATE). Το overlap φέρνει ξανά τα ίδια σε κάθε κύκλο· χωρίς αυτό το φίλτρο θα ξανακατεβάζαμε τις
 * γραμμές τους και θα ξαναϋπολογίζαμε τα έργα κάθε τρία λεπτά για τίποτα.
 */
export function onlyChanged<T extends { updRaw: string | null }>(rows: T[], local: Map<number, string | null>, idOf: (r: T) => number): T[] {
  return rows.filter((r) => {
    const id = idOf(r);
    return !local.has(id) || (local.get(id) ?? null) !== (r.updRaw ?? null);
  });
}

/** Ώρα Αθήνας (0–23) — η νυχτερινή συμφωνία τρέχει όταν δεν δουλεύει κανείς. */
export function athensHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Athens' }).format(now)) % 24;
}

/** Χρειάζεται συμφωνία; Ποτέ δεν έγινε ⇒ ναι. Αλλιώς μία φορά τη νύχτα (02–05), ή αν πέρασαν 36 ώρες. */
export function reconcileDue(reconciledAt: Date | null | undefined, now = new Date()): boolean {
  if (!reconciledAt) return true;
  const age = now.getTime() - reconciledAt.getTime();
  if (age > 36 * 3600_000) return true;
  const h = athensHour(now);
  return age > 20 * 3600_000 && h >= 2 && h < 5;
}

const norm = (v: unknown): unknown => (v instanceof Date ? v.getTime() : v === undefined ? null : v);

/** Ίδια δεδομένα; (μόνο τα πεδία του `data` — ό,τι άλλο έχει η τοπική γραμμή δεν μετρά). */
export function sameData(local: Record<string, unknown> | undefined, data: Record<string, unknown>): boolean {
  if (!local) return false;
  return Object.keys(data).every((k) => norm(local[k]) === norm(data[k]));
}

/** Σχέδιο εγγραφής: νέα (createMany) και αλλαγμένα (update ανά γραμμή) — τα ίδια δεν αγγίζονται. */
export function planWrites<K, D extends Record<string, unknown>>(
  incoming: { key: K; data: D }[],
  local: Map<K, Record<string, unknown>>,
): { create: { key: K; data: D }[]; update: { key: K; data: D }[]; same: number } {
  const create: { key: K; data: D }[] = [];
  const update: { key: K; data: D }[] = [];
  let same = 0;
  for (const r of incoming) {
    const l = local.get(r.key);
    if (!l) create.push(r);
    else if (sameData(l, r.data)) same++;
    else update.push(r);
  }
  return { create, update, same };
}
