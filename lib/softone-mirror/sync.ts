// lib/softone-mirror/sync.ts — SERVER. Ο συγχρονισμός του καθρέφτη SoftOne — ΟΛΟ το σύνολο δεδομένων:
//  • παραστατικά: FINDOC (όλες οι ενότητες, όλο το ιστορικό) + παιδιά MTRLINES, TRDTLINES, FINPAYTERMS,
//    EXPANAL, VATANAL + MYDATAHEADER (και όσα ήρθαν από την ΑΑΔΕ χωρίς αντιστοίχιση) + TRDBALSHEET·
//  • μητρώα: TRDR (+ TRDEXTRA, TRDPRSN), PRSN, MTRL, PRJC, SERIES, βοηθητικοί πίνακες, υπόλοιπα αποθήκης.
//
// ΓΙΑΤΙ. Το SoftOne απαντά 3–10″ ανά κλήση τις κακές μέρες· οι οθόνες και ο Air Jordan διαβάζουν πλέον από
// τη δική μας βάση και το SoftOne ρωτιέται ΜΟΝΟ για ό,τι άλλαξε.
//
// ΠΩΣ.
//  • Αυξητικά: `UPDDATE ≥ wU − overlap OR INSDATE ≥ wI − overlap`, με ΔΥΟ watermarks (βλ. core.ts:
//    το INSDATE είναι σε άλλη ζώνη από το UPDDATE). Εφαρμόζονται μόνο όσα όντως διαφέρουν. Πίνακες χωρίς
//    UPDDATE (γραμμές, λήξεις, αναλύσεις, TRDEXTRA…) ξανακατεβαίνουν ολόκληροι για κάθε γονέα που άλλαξε.
//  • Κάθε πίνακας έχει δικό του ρυθμό (παραστατικά 3′, μητρώα 60′, βοηθητικοί 1×/ημέρα — αλλάζει από την
//    οθόνη) και μπορεί να τρέξει και μόνος του («Συγχρονισμός τώρα» ανά πίνακα).
//  • Νυχτερινή συμφωνία (02–05): σύγκριση όλων των ids — σβήνει ό,τι διαγράφηκε στο SoftOne (οι διαγραφές δεν
//    αφήνουν UPDDATE), ξαναφέρνει ό,τι αποκλίνει. Ακυρώσεις έρχονται ήδη με το ISCANCEL + UPDDATE.
//  • Αρχική φόρτωση (backfill): σε κομμάτια id με παύση ανάμεσα, με χρονικό όριο ανά κύκλο — συνεχίζει από
//    εκεί που έμεινε (πρόοδος στο SoftoneMirrorState.progress).
//
// ΚΑΝΟΝΕΣ. ΜΟΝΟ ανάγνωση (GetTable) — καμία εγγραφή προς το SoftOne από εδώ. Ιδιωτική συνεδρία SoftOne
// (`withSoftoneSession`) — ποτέ στην ουρά των σελίδων. Ένας τη φορά σε όλα τα instances (μίσθωση).
import 'server-only';
import os from 'node:os';
import { prisma } from '@/lib/db';
import {
  softoneGetTable, softoneFetchTradersWhere, softoneFetchItemsWhere, softoneFetchProjects, softoneFetchStock,
  isHiddenTrader, withSoftoneSession, SoftoneTransportError, type TrdrRow, type ItemRow, type ProjectRow,
} from '@/lib/softone';
import { knownTenantKey, probeConnection } from '@/lib/softone-sync/connection';
import { replaceLookups } from '@/lib/softone-sync/resync';
import {
  BALANCE_FIELDS, FINDOC_FIELDS, MTRLINE_FIELDS, MYDATA_FIELDS, RECORD_SPECS, TRDLINE_FIELDS,
  changedSinceFilter, chunk, compact, mapBalance, mapFindoc, mapMtrLine, mapMyData, mapRecord, mapTrdLine,
  nextWatermark, onlyChanged, planReconcile, planWrites, reconcileDue, s1Stamp, sinceOf,
  type FindocData, type MtrLineData, type RecordData, type RecordSpec, type TrdLineData,
} from './core';
import { acquireLease, releaseLease, renewLease } from './lock';

export const MIRROR_LEASE = 'softone-mirror';
const LEASE_TTL_MS = 15 * 60_000;
const SESSION = 'mirror-sync';
const TEST = !!process.env.VITEST;
/** Ελάχιστο κενό ανάμεσα σε δύο κλήσεις — μετρημένο: ριπές κλήσεων παίρνουν HTTP 503 από το oncloud. */
const CALL_GAP_MS = TEST ? 0 : 250;
/** Επανάληψη ανάγνωσης όταν το SoftOne απαντά 503 / κόβεται (ΜΟΝΟ αναγνώσεις — ασφαλές). */
const RETRY_WAIT_MS = TEST ? [0, 0] : [3_000, 10_000, 30_000];
const IN_CHUNK = 200;
/** Έως τόσα παραστατικά, η πλήρης ανάγνωση ενός πίνακα-παιδιού γίνεται με ΜΙΑ κλήση· πάνω από αυτό, σε κομμάτια. */
const BULK_LIMIT = 5_000;
/** Αρχική φόρτωση: ids ανά κομμάτι, παύση ανάμεσα, και πόσο χρόνο «τρώει» το πολύ ανά κύκλο. */
const BACKFILL_CHUNK = 250;
const BACKFILL_PAUSE_MS = TEST ? 0 : 1_000;
const BACKFILL_BUDGET_MS = 90_000;
/** Ενότητες που κινούν αποθήκη: αν άλλαξε παραστατικό τους, ξαναγράφονται τα υπόλοιπα. */
const STOCK_SOURCES = new Set([1151, 1251, 1351]);
const RESYNC_RUN_KEY = 'integrations.softoneResyncRun';
const DOC_RECORDS = [RECORD_SPECS.FINPAYTERMS, RECORD_SPECS.EXPANAL, RECORD_SPECS.VATANAL];
const TRADER_RECORDS = [RECORD_SPECS.TRDEXTRA, RECORD_SPECS.TRDPRSN];

export type MirrorTable = 'docs' | 'mydata' | 'traders' | 'contacts' | 'items' | 'projects' | 'series' | 'lookups' | 'stock';
export const MIRROR_TABLES: MirrorTable[] = ['docs', 'mydata', 'traders', 'contacts', 'items', 'projects', 'series', 'lookups', 'stock'];
export const MIRROR_TABLE_LABEL: Record<MirrorTable, string> = {
  docs: 'Παραστατικά (κεφαλές, γραμμές, λήξεις, αναλύσεις)',
  mydata: 'myDATA (ΜΑΡΚ/QR, ΑΑΔΕ)',
  traders: 'Συναλλασσόμενοι (+ επιπλέον στοιχεία, επαφές)',
  contacts: 'Πρόσωπα / επαφές (PRSN)',
  items: 'Είδη & υπηρεσίες',
  projects: 'Έργα',
  series: 'Σειρές παραστατικών',
  lookups: 'Βοηθητικοί πίνακες',
  stock: 'Υπόλοιπα αποθηκών',
};
/** Προεπιλεγμένος ρυθμός (λεπτά). Οι συναλλασσόμενοι αλλάζουν σπάνια — ανά ώρα (οδηγία χρήστη). */
export const DEFAULT_EVERY_MIN: Record<MirrorTable, number> = {
  docs: 3, mydata: 3, traders: 60, contacts: 60, items: 60, projects: 60, series: 1440, lookups: 1440, stock: 60,
};

export type StepReport = { table: MirrorTable; ok: boolean; changed: number; ms: number; error: string | null; note?: string; full?: boolean };
export type CycleReport = {
  mode: 'incremental' | 'reconcile' | 'auto';
  trigger: string;
  ok: boolean;
  skipped: string | null;
  steps: StepReport[];
  ms: number;
  finishedAt: string;
};

type Row = Record<string, string>;
type State = Awaited<ReturnType<typeof stateOf>>;

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

let lastCall = 0;
/** GetTable με κενό ανάμεσα στις κλήσεις και επανάληψη σε 503 / κομμένη απάντηση. */
async function gt(table: string, fields: string[], filter: string): Promise<Row[]> {
  for (let attempt = 0; ; attempt++) {
    await sleep(lastCall + CALL_GAP_MS - Date.now());
    try {
      return await softoneGetTable(table, fields, filter);
    } catch (e) {
      const retryable = e instanceof SoftoneTransportError && (e.httpStatus == null || e.httpStatus >= 500);
      if (!retryable || attempt >= RETRY_WAIT_MS.length) throw e;
      console.warn(`[softone-mirror] ${table}: ${(e as Error).message.slice(0, 80)} — νέα προσπάθεια σε ${RETRY_WAIT_MS[attempt] / 1000}″`);
      await sleep(RETRY_WAIT_MS[attempt]);
    } finally {
      lastCall = Date.now();
    }
  }
}

async function gtIn(table: string, fields: string[], key: string, ids: number[]): Promise<Row[]> {
  const out: Row[] = [];
  for (const c of chunk(ids, IN_CHUNK)) out.push(...await gt(table, fields, `${key} IN (${c.join(',')})`));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Κατάσταση ανά πίνακα (SoftoneMirrorState)
// ─────────────────────────────────────────────────────────────────────────────

async function stateOf(table: MirrorTable) {
  return prisma.softoneMirrorState.findUnique({ where: { table } });
}

type OkPatch = { rows: number; changed: number; ms: number; watermark?: string | null; watermarkIns?: string | null; reconciled?: boolean };

async function saveOk(table: MirrorTable, tenantKey: string, p: OkPatch) {
  const now = new Date();
  const data = {
    tenantKey, syncedAt: now, rows: p.rows, lastRunAt: now, lastOkAt: now, lastError: null, lastMs: p.ms, lastChanged: p.changed,
    ...(p.watermark !== undefined ? { watermark: p.watermark } : {}),
    ...(p.watermarkIns !== undefined ? { watermarkIns: p.watermarkIns } : {}),
    ...(p.reconciled ? { reconciledAt: now } : {}),
  };
  await prisma.softoneMirrorState.upsert({ where: { table }, update: data, create: { table, ...data } });
}

async function saveError(table: MirrorTable, tenantKey: string, error: string, ms: number) {
  const now = new Date();
  // Δεν πειράζουμε watermark/rows/lastOkAt: ο καθρέφτης μένει όπως ήταν και ο επόμενος κύκλος ξαναδοκιμάζει.
  await prisma.softoneMirrorState.upsert({
    where: { table },
    update: { lastRunAt: now, lastError: error.slice(0, 1000), lastMs: ms },
    create: { table, tenantKey, syncedAt: new Date(0), rows: 0, lastRunAt: now, lastError: error.slice(0, 1000), lastMs: ms },
  }).catch(() => {});
}

/** Ο καθρέφτης ανήκει σε άλλη εγκατάσταση ⇒ ΔΕΝ τον «συμπληρώνουμε» με δεδομένα της τωρινής. */
function assertSameTenant(state: { tenantKey: string; rows: number } | null, tenantKey: string, table: MirrorTable) {
  if (state && state.rows > 0 && state.tenantKey !== tenantKey && state.tenantKey !== 'unknown') {
    throw new Error(`Ο καθρέφτης «${MIRROR_TABLE_LABEL[table]}» είναι άλλης εγκατάστασης SoftOne — χρειάζεται πλήρης συγχρονισμός από τις Ρυθμίσεις.`);
  }
}

/** Φίλτρο «από τότε» με τα δύο watermarks της κατάστασης· null = δεν υπάρχει watermark ⇒ πλήρης φόρτωση. */
function changedFilterOf(state: State): string | null {
  const since = sinceOf(state?.watermark);
  if (!since) return null;
  return changedSinceFilter(since, sinceOf(state?.watermarkIns) ?? since);
}

/** Τα επόμενα watermarks από τις γραμμές που ήρθαν (κάθε στήλη χωριστά). */
function nextMarks(state: State, rows: { UPDDATE?: string | null; INSDATE?: string | null }[], incremental: boolean) {
  return {
    watermark: nextWatermark(incremental ? state?.watermark : null, rows, 'UPDDATE'),
    watermarkIns: nextWatermark(incremental ? state?.watermarkIns : null, rows, 'INSDATE'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Γενικοί πίνακες (SoftoneRecord)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Αντικαθιστά ΟΛΑ τα παιδιά των `parents` στους πίνακες `tables` με τα `rows` (που πρέπει να είναι
 * ΟΛΑ τα παιδιά τους). `parents = null` ⇒ ολόκληροι οι πίνακες (πλήρης ανάγνωση).
 */
async function replaceRecordsTx(
  tx: Pick<typeof prisma, 'softoneRecord'>, tables: string[], parents: number[] | null, rows: RecordData[], now: Date,
) {
  if (parents === null) await tx.softoneRecord.deleteMany({ where: { table: { in: tables } } });
  else for (const c of chunk(parents, 1000)) await tx.softoneRecord.deleteMany({ where: { table: { in: tables }, parent: { in: c } } });
  for (const c of chunk(rows, 1000)) await tx.softoneRecord.createMany({ data: c.map((r) => ({ ...r, syncedAt: now })), skipDuplicates: true });
}

async function fetchRecords(spec: RecordSpec, parents: number[] | 'all'): Promise<RecordData[]> {
  const raw = parents === 'all' ? await gt(spec.table, spec.fields, spec.all) : await gtIn(spec.table, spec.fields, spec.parentKey!, parents);
  return compact(raw.map((r) => mapRecord(spec, r)));
}

/** Πίνακας-παιδί ολόκληρος: ΜΙΑ κλήση αν οι γονείς είναι λίγοι, αλλιώς σε κομμάτια. */
async function fetchRecordsAll(spec: RecordSpec, parentCount: number, parentIds: () => Promise<number[]>): Promise<RecordData[]> {
  return parentCount <= BULK_LIMIT ? fetchRecords(spec, 'all') : fetchRecords(spec, await parentIds());
}

/**
 * Πίνακας με δικό του UPDDATE/INSDATE (PRSN, SERIES): αυξητικά ή πλήρως, με διαγραφές μόνο στην
 * πλήρη ανάγνωση (και με το όριο ασφαλείας).
 */
async function ownRecordsSync(table: MirrorTable, spec: RecordSpec, tenantKey: string, full: boolean): Promise<number> {
  const t0 = Date.now();
  const state = await stateOf(table);
  assertSameTenant(state, tenantKey, table);
  const filter = full || spec.fullOnly ? null : changedFilterOf(state);
  const raw = await gt(spec.table, spec.fields, filter ? `${spec.all} AND ${filter}` : spec.all);
  const rows = compact(raw.map((r) => mapRecord(spec, r)));
  const local = new Map((await prisma.softoneRecord.findMany({ where: { table: spec.table }, select: { id: true, updRaw: true, insRaw: true, data: true } }))
    .map((r) => [r.id, r as unknown as Record<string, unknown>]));
  let deleted = 0;
  if (!filter) {
    const plan = planReconcile(rows.map((r) => ({ id: Number(r.id) || hashId(r.id), upd: null })), [...local.keys()].map((id) => ({ id: Number(id) || hashId(id), upd: null })));
    if (plan.abort) throw new Error(plan.abort);
    const keep = new Set(rows.map((r) => r.id));
    const gone = [...local.keys()].filter((id) => !keep.has(id));
    if (gone.length) deleted = (await prisma.softoneRecord.deleteMany({ where: { table: spec.table, id: { in: gone } } })).count;
  }
  const w = planWrites(rows.map((r) => ({ key: r.id, data: { updRaw: r.updRaw, insRaw: r.insRaw, data: r.data } as Record<string, unknown> })), local);
  const now = new Date();
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const c of chunk(w.create, 1000)) await prisma.softoneRecord.createMany({ data: c.map((x) => ({ ...byId.get(x.key)!, syncedAt: now })), skipDuplicates: true });
  for (const x of w.update) await prisma.softoneRecord.update({ where: { table_id: { table: spec.table, id: x.key } }, data: { ...byId.get(x.key)!, syncedAt: now } });
  const changed = w.create.length + w.update.length + deleted;
  await saveOk(table, tenantKey, {
    rows: await prisma.softoneRecord.count({ where: { table: spec.table } }), changed, ms: Date.now() - t0,
    ...nextMarks(state, raw, !!filter), ...(filter ? {} : { reconciled: true }),
  });
  return changed;
}

/** planReconcile δουλεύει με αριθμητικά ids· για σύνθετα κλειδιά αρκεί ένας σταθερός αριθμός. */
function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Παραστατικά
// ─────────────────────────────────────────────────────────────────────────────

type DocChildren = { lines: MtrLineData[]; tlines: TrdLineData[]; records: RecordData[] };

/**
 * Γράφει κεφαλές + ΟΛΑ τα παιδιά τους σε μία συναλλαγή: κανείς αναγνώστης δεν βλέπει ποτέ κεφαλή με
 * μισές γραμμές. Τα παιδιά αυτών των κεφαλών αντικαθίστανται ολόκληρα (μια γραμμή που σβήστηκε στο
 * SoftOne δεν έχει πώς να έρθει αλλιώς).
 */
export async function applyDocs(heads: FindocData[], ch: DocChildren): Promise<void> {
  if (heads.length === 0) return;
  const ids = heads.map((h) => h.findoc);
  const idSet = new Set(ids);
  const now = new Date();
  const existing = new Set<number>();
  for (const c of chunk(ids, 1000)) {
    for (const r of await prisma.softoneFindoc.findMany({ where: { findoc: { in: c } }, select: { findoc: true } })) existing.add(r.findoc);
  }
  await prisma.$transaction(async (tx) => {
    for (const c of chunk(ids, 1000)) {
      await tx.softoneMtrLine.deleteMany({ where: { findoc: { in: c } } });
      await tx.softoneTrdLine.deleteMany({ where: { findoc: { in: c } } });
    }
    const fresh = heads.filter((h) => !existing.has(h.findoc)).map((h) => ({ ...h, syncedAt: now }));
    for (const c of chunk(fresh, 1000)) await tx.softoneFindoc.createMany({ data: c, skipDuplicates: true });
    for (const h of heads) {
      if (existing.has(h.findoc)) await tx.softoneFindoc.update({ where: { findoc: h.findoc }, data: { ...h, syncedAt: now } });
    }
    for (const c of chunk(ch.lines.filter((l) => idSet.has(l.findoc)), 1000)) await tx.softoneMtrLine.createMany({ data: c, skipDuplicates: true });
    for (const c of chunk(ch.tlines.filter((l) => idSet.has(l.findoc)), 1000)) await tx.softoneTrdLine.createMany({ data: c, skipDuplicates: true });
    await replaceRecordsTx(tx, DOC_RECORDS.map((s) => s.table), ids, ch.records.filter((r) => r.parent != null && idSet.has(r.parent)), now);
  }, { timeout: 120_000 });
}

/** Κεφαλές + όλα τα παιδιά για συγκεκριμένα ids (σε κομμάτια `IN`). */
async function fetchDocsFull(ids: number[]) {
  const want = new Set(ids);
  const heads = compact((await gtIn('FINDOC', FINDOC_FIELDS, 'FINDOC', ids)).map(mapFindoc)).filter((x) => want.has(x.findoc));
  const lines = compact((await gtIn('MTRLINES', MTRLINE_FIELDS, 'FINDOC', ids)).map(mapMtrLine));
  const tlines = compact((await gtIn('TRDTLINES', TRDLINE_FIELDS, 'FINDOC', ids)).map(mapTrdLine));
  const records: RecordData[] = [];
  for (const spec of DOC_RECORDS) records.push(...await fetchRecords(spec, ids));
  return { heads, children: { lines, tlines, records } };
}

/** Επίσημα υπόλοιπα (TRDBALSHEET): `trdrs` = μόνο αυτοί, αλλιώς ΟΛΟΣ ο πίνακας. */
async function refreshBalances(trdrs: number[] | null): Promise<number> {
  if (trdrs && trdrs.length === 0) return 0;
  const rows = compact((trdrs ? await gtIn('TRDBALSHEET', BALANCE_FIELDS, 'TRDR', trdrs) : await gt('TRDBALSHEET', BALANCE_FIELDS, 'TRDR>0')).map(mapBalance));
  if (!trdrs && rows.length === 0 && (await prisma.softoneTrdBalance.count()) > 0) throw new Error('Το SoftOne δεν επέστρεψε υπόλοιπα καρτέλας — κρατάμε τα προηγούμενα.');
  await prisma.$transaction(async (tx) => {
    if (trdrs) for (const c of chunk(trdrs, 1000)) await tx.softoneTrdBalance.deleteMany({ where: { trdr: { in: c } } });
    else await tx.softoneTrdBalance.deleteMany({});
    for (const c of chunk(rows, 1000)) await tx.softoneTrdBalance.createMany({ data: c });
  }, { timeout: 60_000 });
  return rows.length;
}

type DocsResult = { changed: number; stockTouched: boolean; note?: string };

type Backfill = { phase: 'backfill'; ids: number[]; done: number; total: number; wmU: string | null; wmI: string | null; startedAt: string };

/**
 * Αρχική φόρτωση ΟΛΟΥ του ιστορικού, ΣΥΝΕΧΙΖΟΜΕΝΗ: λίστα ids (μία φθηνή κλήση) και μετά κομμάτια των
 * 250 με παύση ανάμεσα, ως `BACKFILL_BUDGET_MS` ανά κύκλο. Η πρόοδος γράφεται μετά από κάθε κομμάτι·
 * αν πέσει ο server, ο επόμενος κύκλος συνεχίζει. Μέχρι να τελειώσει, οι οθόνες διαβάζουν ζωντανά
 * (η κατάσταση δεν παίρνει lastOkAt). Τα watermarks κρατιούνται από την ΑΡΧΗ της φόρτωσης, ώστε
 * ό,τι άλλαξε όσο διαρκούσε να έρθει με τον πρώτο αυξητικό κύκλο.
 */
async function docsBackfill(tenantKey: string, state: State): Promise<DocsResult> {
  const t0 = Date.now();
  let bf = state?.progress as unknown as Backfill | null;
  if (!bf || bf.phase !== 'backfill') {
    const list = await gt('FINDOC', ['FINDOC', 'UPDDATE', 'INSDATE'], 'FINDOC>0');
    const ids = compact(list.map((r) => (Number(r.FINDOC) > 0 ? Number(r.FINDOC) : null))).sort((a, b) => a - b);
    bf = { phase: 'backfill', ids, done: 0, total: ids.length, wmU: nextWatermark(null, list, 'UPDDATE'), wmI: nextWatermark(null, list, 'INSDATE'), startedAt: new Date().toISOString() };
    await prisma.softoneMirrorState.upsert({
      where: { table: 'docs' },
      update: { progress: bf as never, tenantKey, lastRunAt: new Date() },
      create: { table: 'docs', tenantKey, syncedAt: new Date(0), rows: 0, progress: bf as never, lastRunAt: new Date() },
    });
  }
  let changed = 0;
  while (bf.done < bf.total && Date.now() - t0 < BACKFILL_BUDGET_MS) {
    const ids = bf.ids.slice(bf.done, bf.done + BACKFILL_CHUNK);
    const { heads, children } = await fetchDocsFull(ids);
    await applyDocs(heads, children);
    changed += heads.length;
    bf = { ...bf, done: bf.done + ids.length };
    await prisma.softoneMirrorState.update({ where: { table: 'docs' }, data: { progress: bf as never, lastRunAt: new Date(), lastError: null } });
    if (bf.done < bf.total) await sleep(BACKFILL_PAUSE_MS);
  }
  if (bf.done < bf.total) return { changed, stockTouched: false, note: `Αρχική φόρτωση ${bf.done}/${bf.total} — συνεχίζει στον επόμενο κύκλο.` };

  await refreshBalances(null);
  await prisma.softoneMirrorState.update({ where: { table: 'docs' }, data: { progress: null as never } });
  await saveOk('docs', tenantKey, {
    rows: await prisma.softoneFindoc.count(), changed, ms: Date.now() - t0, watermark: bf.wmU, watermarkIns: bf.wmI, reconciled: true,
  });
  return { changed, stockTouched: true, note: `Αρχική φόρτωση ολοκληρώθηκε (${bf.total} παραστατικά).` };
}

async function docsIncremental(tenantKey: string): Promise<DocsResult> {
  const t0 = Date.now();
  const state = await stateOf('docs');
  assertSameTenant(state, tenantKey, 'docs');
  const filter = changedFilterOf(state);
  if (!filter || state?.progress) return docsBackfill(tenantKey, state);

  const raw = await gt('FINDOC', ['FINDOC', 'SOSOURCE', 'UPDDATE', 'INSDATE'], `FINDOC>0 AND ${filter}`);
  const seen = compact(raw.map((r) => {
    const findoc = Number(r.FINDOC);
    return Number.isInteger(findoc) && findoc > 0 ? { findoc, updRaw: s1Stamp(r.UPDDATE), sosource: Number(r.SOSOURCE) } : null;
  }));
  const local = new Map((await prisma.softoneFindoc.findMany({
    where: { findoc: { in: seen.map((s) => s.findoc) } }, select: { findoc: true, updRaw: true, trdr: true },
  })).map((r) => [r.findoc, r]));
  const changed = onlyChanged(seen, new Map([...local].map(([k, v]) => [k, v.updRaw])), (r) => r.findoc);

  let stockTouched = false;
  if (changed.length) {
    const { heads, children } = await fetchDocsFull(changed.map((c) => c.findoc));
    await applyDocs(heads, children);
    // Υπόλοιπα των συναλλασσομένων που αγγίχτηκαν (και του ΠΡΟΗΓΟΥΜΕΝΟΥ, αν άλλαξε ο συναλλασσόμενος).
    const trdrs = new Set<number>();
    for (const h of heads) if (h.trdr) trdrs.add(h.trdr);
    for (const l of children.tlines) if (l.trdr) trdrs.add(l.trdr);
    for (const c of changed) { const p = local.get(c.findoc)?.trdr; if (p) trdrs.add(p); }
    await refreshBalances([...trdrs]);
    stockTouched = changed.some((c) => STOCK_SOURCES.has(c.sosource));
  }
  await saveOk('docs', tenantKey, { rows: await prisma.softoneFindoc.count(), changed: changed.length, ms: Date.now() - t0, ...nextMarks(state, raw, true) });
  return { changed: changed.length, stockTouched };
}

/**
 * Νυχτερινή συμφωνία: διαγραφές + ό,τι αποκλίνει στις κεφαλές, και ΟΛΑ τα παιδιά ξαναγράφονται (έτσι
 * διορθώνεται και ό,τι άλλαξε σε γραμμή χωρίς να αλλάξει η κεφαλή). Κάθε πίνακας-παιδί έχει φύλακα: αν
 * το SoftOne δώσει πολύ λιγότερα από όσα έχουμε, ο πίνακας ΔΕΝ αντικαθίσταται.
 */
async function docsReconcile(tenantKey: string): Promise<DocsResult> {
  const t0 = Date.now();
  const state = await stateOf('docs');
  assertSameTenant(state, tenantKey, 'docs');
  if (!state?.watermark || state.progress) return docsBackfill(tenantKey, state);

  const remote = await gt('FINDOC', ['FINDOC', 'UPDDATE', 'INSDATE'], 'FINDOC>0');
  const local = await prisma.softoneFindoc.findMany({ select: { findoc: true, updRaw: true } });
  const plan = planReconcile(
    compact(remote.map((r) => (Number(r.FINDOC) > 0 ? { id: Number(r.FINDOC), upd: r.UPDDATE } : null))),
    local.map((l) => ({ id: l.findoc, upd: l.updRaw })),
  );
  if (plan.abort) throw new Error(plan.abort);

  if (plan.toDelete.length) {
    await prisma.$transaction(async (tx) => {
      for (const c of chunk(plan.toDelete, 1000)) {
        await tx.softoneMtrLine.deleteMany({ where: { findoc: { in: c } } });
        await tx.softoneTrdLine.deleteMany({ where: { findoc: { in: c } } });
        await tx.softoneRecord.deleteMany({ where: { table: { in: DOC_RECORDS.map((s) => s.table) }, parent: { in: c } } });
        await tx.softoneFindoc.deleteMany({ where: { findoc: { in: c } } });
      }
    });
  }
  if (plan.toFetch.length) {
    const { heads, children } = await fetchDocsFull(plan.toFetch);
    await applyDocs(heads, children);
  }

  // Όλα τα παιδιά, ολόκληρα.
  const all = compact(remote.map((r) => (Number(r.FINDOC) > 0 ? Number(r.FINDOC) : null)));
  const allSet = new Set(all);
  const bulk = all.length <= BULK_LIMIT;
  const lines = compact((bulk ? await gt('MTRLINES', MTRLINE_FIELDS, 'FINDOC>0') : await gtIn('MTRLINES', MTRLINE_FIELDS, 'FINDOC', all)).map(mapMtrLine)).filter((l) => allSet.has(l.findoc));
  const tlines = compact((bulk ? await gt('TRDTLINES', TRDLINE_FIELDS, 'FINDOC>0') : await gtIn('TRDTLINES', TRDLINE_FIELDS, 'FINDOC', all)).map(mapTrdLine)).filter((l) => allSet.has(l.findoc));
  const recs = new Map<string, RecordData[]>();
  for (const spec of DOC_RECORDS) recs.set(spec.table, (await fetchRecordsAll(spec, all.length, async () => all)).filter((r) => r.parent != null && allSet.has(r.parent)));
  const now = new Date();
  const guard = (fresh: number, had: number, what: string) => {
    if (had >= 20 && fresh < had * 0.5) throw new Error(`Το SoftOne έδωσε ${fresh} ${what} ενώ έχουμε ${had} — δεν αντικαταστάθηκαν (όριο ασφαλείας).`);
  };
  guard(lines.length, await prisma.softoneMtrLine.count(), 'γραμμές ειδών');
  guard(tlines.length, await prisma.softoneTrdLine.count(), 'γραμμές εμβασμάτων');
  for (const spec of DOC_RECORDS) guard(recs.get(spec.table)!.length, await prisma.softoneRecord.count({ where: { table: spec.table } }), spec.table);
  await prisma.$transaction(async (tx) => {
    await tx.softoneMtrLine.deleteMany({});
    for (const c of chunk(lines, 1000)) await tx.softoneMtrLine.createMany({ data: c, skipDuplicates: true });
    await tx.softoneTrdLine.deleteMany({});
    for (const c of chunk(tlines, 1000)) await tx.softoneTrdLine.createMany({ data: c, skipDuplicates: true });
    await replaceRecordsTx(tx, DOC_RECORDS.map((s) => s.table), null, [...recs.values()].flat(), now);
  }, { timeout: 180_000 });

  await refreshBalances(null);
  const n = plan.toFetch.length + plan.toDelete.length;
  await saveOk('docs', tenantKey, { rows: await prisma.softoneFindoc.count(), changed: n, ms: Date.now() - t0, ...nextMarks(state, remote, false), reconciled: true });
  return { changed: n, stockTouched: n > 0 };
}

async function myDataSync(tenantKey: string, full: boolean): Promise<number> {
  const t0 = Date.now();
  const state = await stateOf('mydata');
  assertSameTenant(state, tenantKey, 'mydata');
  const filter = full ? null : changedFilterOf(state);
  // ΟΛΕΣ οι γραμμές — και όσες ήρθαν από την ΑΑΔΕ χωρίς SOID (μη αντιστοιχισμένα παραστατικά).
  const raw = await gt('MYDATAHEADER', MYDATA_FIELDS, filter ? `MYDATAHEADER>0 AND ${filter}` : 'MYDATAHEADER>0');
  const rows = compact(raw.map(mapMyData));
  const local = new Map((await prisma.softoneMyData.findMany({ where: filter ? { id: { in: rows.map((r) => r.id) } } : undefined }))
    .map((r) => [r.id, r as unknown as Record<string, unknown>]));
  let deleted = 0;
  if (!filter) {
    const plan = planReconcile(rows.map((r) => ({ id: r.id, upd: r.updRaw })), [...local.values()].map((r) => ({ id: r.id as number, upd: r.updRaw as string | null })));
    if (plan.abort) throw new Error(plan.abort);
    if (plan.toDelete.length) deleted = (await prisma.softoneMyData.deleteMany({ where: { id: { in: plan.toDelete } } })).count;
  }
  const w = planWrites(rows.map(({ id, ...data }) => ({ key: id, data: data as Record<string, unknown> })), local);
  for (const c of chunk(w.create, 1000)) await prisma.softoneMyData.createMany({ data: c.map((x) => ({ id: x.key, ...(x.data as object) })) as never, skipDuplicates: true });
  for (const x of w.update) await prisma.softoneMyData.update({ where: { id: x.key }, data: x.data as never });
  const changed = w.create.length + w.update.length + deleted;
  await saveOk('mydata', tenantKey, {
    rows: await prisma.softoneMyData.count(), changed, ms: Date.now() - t0, ...nextMarks(state, raw, !!filter), ...(filter ? {} : { reconciled: true }),
  });
  return changed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Μητρώα
// ─────────────────────────────────────────────────────────────────────────────

const traderData = (r: TrdrRow) => ({
  sodtype: r.sodtype, kind: r.kind, code: r.code, name: r.name || r.code,
  afm: r.afm, doy: r.doy, profession: r.profession,
  address: r.address, district: r.district, zip: r.zip, city: r.city,
  phone: r.phone, phone2: r.phone2, fax: r.fax, email: r.email, webpage: r.webpage, isActive: r.isActive,
  lat: r.lat ?? null, lng: r.lng ?? null,
});

const itemData = (r: ItemRow) => ({
  code: r.code, code1: r.code1, code2: r.code2, name: r.name || r.code, name2: r.name2,
  price: r.price, isService: r.isService, isActive: r.isActive, myDataCode: r.myDataCode,
  unit1: r.unit1, unitBuy: r.unitBuy, buyRatio: r.buyRatio, unitSell: r.unitSell, sellRatio: r.sellRatio,
});

const projectData = (r: ProjectRow) => ({
  code: r.code, name: r.name, trdr: r.trdr, prjType: r.prjType, isActive: true,
  actStatus: r.actStatus, trdrSu: r.trdrSu, remarks: r.remarks,
  crdDate: r.crdDate, fromDate: r.fromDate, finalDate: r.finalDate, closeDate: r.closeDate,
});

/** Οι στήλες watermark όπως τις θέλει το `nextMarks`. */
const marksOf = (rows: { updDate?: string | null; insDate?: string | null }[]) => rows.map((r) => ({ UPDDATE: r.updDate ?? '', INSDATE: r.insDate ?? '' }));

async function tradersSync(tenantKey: string, full: boolean): Promise<number> {
  const t0 = Date.now();
  const state = await stateOf('traders');
  assertSameTenant(state, tenantKey, 'traders');
  const filter = full ? null : changedFilterOf(state);
  const rows = await softoneFetchTradersWhere(filter ?? '');
  const hidden = rows.filter((r) => isHiddenTrader(r.name)).map((r) => r.trdr);
  const visible = rows.filter((r) => !isHiddenTrader(r.name));
  let deleted = 0;
  if (!filter) {
    // Αρνητικά TRDR = demo εγγραφές μόνο στη βάση μας (δεν υπάρχουν στο SoftOne) — δεν τις σβήνει ο συγχρονισμός.
    const local = (await prisma.softoneTrader.findMany({ where: { trdr: { gt: 0 } }, select: { trdr: true } })).map((t) => ({ id: t.trdr, upd: null }));
    const plan = planReconcile(visible.map((r) => ({ id: r.trdr, upd: null })), local);
    if (plan.abort) throw new Error(plan.abort);
    deleted = plan.toDelete.length ? (await prisma.softoneTrader.deleteMany({ where: { trdr: { in: plan.toDelete } } })).count : 0;
  } else if (hidden.length) {
    deleted = (await prisma.softoneTrader.deleteMany({ where: { trdr: { in: hidden } } })).count;
  }
  const local = new Map((await prisma.softoneTrader.findMany({ where: { trdr: { in: visible.map((r) => r.trdr) } } })).map((t) => [t.trdr, t as Record<string, unknown>]));
  const w = planWrites(visible.map((r) => ({ key: r.trdr, data: traderData(r) })), local);
  for (const c of chunk(w.create, 1000)) await prisma.softoneTrader.createMany({ data: c.map((x) => ({ trdr: x.key, ...x.data })), skipDuplicates: true });
  for (const x of w.update) await prisma.softoneTrader.update({ where: { trdr: x.key }, data: x.data });

  // Παιδιά (TRDEXTRA, TRDPRSN): πλήρως στη συμφωνία, αλλιώς για όσους ήρθαν στο παράθυρο.
  const now = new Date();
  const parents = filter ? rows.map((r) => r.trdr) : null;
  if (!parents || parents.length) {
    const recs: RecordData[] = [];
    for (const spec of TRADER_RECORDS) recs.push(...(parents ? await fetchRecords(spec, parents) : await fetchRecords(spec, 'all')));
    if (!parents) for (const spec of TRADER_RECORDS) {
      const had = await prisma.softoneRecord.count({ where: { table: spec.table } });
      const got = recs.filter((r) => r.table === spec.table).length;
      if (had >= 20 && got < had * 0.5) throw new Error(`Το SoftOne έδωσε ${got} ${spec.table} ενώ έχουμε ${had} — δεν αντικαταστάθηκαν.`);
    }
    await prisma.$transaction(async (tx) => replaceRecordsTx(tx, TRADER_RECORDS.map((s) => s.table), parents, recs, now), { timeout: 60_000 });
  }

  const changed = w.create.length + w.update.length + deleted;
  await saveOk('traders', tenantKey, {
    rows: await prisma.softoneTrader.count(), changed, ms: Date.now() - t0, ...nextMarks(state, marksOf(rows), !!filter), ...(filter ? {} : { reconciled: true }),
  });
  return changed;
}

async function itemsSync(tenantKey: string, full: boolean): Promise<number> {
  const t0 = Date.now();
  const state = await stateOf('items');
  assertSameTenant(state, tenantKey, 'items');
  const filter = full ? null : changedFilterOf(state);
  const rows = await softoneFetchItemsWhere(filter ?? '');
  let deleted = 0;
  if (!filter) {
    const plan = planReconcile(rows.map((r) => ({ id: r.mtrl, upd: null })), (await prisma.softoneItem.findMany({ select: { mtrl: true } })).map((r) => ({ id: r.mtrl, upd: null })));
    if (plan.abort) throw new Error(plan.abort);
    deleted = plan.toDelete.length ? (await prisma.softoneItem.deleteMany({ where: { mtrl: { in: plan.toDelete } } })).count : 0;
  }
  const local = new Map((await prisma.softoneItem.findMany({ where: { mtrl: { in: rows.map((r) => r.mtrl) } } })).map((t) => [t.mtrl, t as Record<string, unknown>]));
  const w = planWrites(rows.map((r) => ({ key: r.mtrl, data: itemData(r) })), local);
  for (const c of chunk(w.create, 1000)) await prisma.softoneItem.createMany({ data: c.map((x) => ({ mtrl: x.key, ...x.data })), skipDuplicates: true });
  for (const x of w.update) await prisma.softoneItem.update({ where: { mtrl: x.key }, data: x.data });
  const changed = w.create.length + w.update.length + deleted;
  await saveOk('items', tenantKey, {
    rows: await prisma.softoneItem.count(), changed, ms: Date.now() - t0, ...nextMarks(state, marksOf(rows), !!filter), ...(filter ? {} : { reconciled: true }),
  });
  return changed;
}

async function projectsSync(tenantKey: string, full: boolean): Promise<number> {
  const t0 = Date.now();
  const state = await stateOf('projects');
  assertSameTenant(state, tenantKey, 'projects');
  const filter = full ? null : changedFilterOf(state);
  const rows = await softoneFetchProjects(filter ?? '');
  const now = new Date();
  const local = new Map((await prisma.softoneProject.findMany({ where: { prjc: { in: rows.map((r) => r.prjc) } } })).map((p) => [p.prjc, p as Record<string, unknown>]));
  const w = planWrites(rows.map((r) => ({ key: r.prjc, data: projectData(r) })), local);
  for (const c of chunk(w.create, 1000)) await prisma.softoneProject.createMany({ data: c.map((x) => ({ prjc: x.key, ...x.data, syncedAt: now })), skipDuplicates: true });
  for (const x of w.update) await prisma.softoneProject.update({ where: { prjc: x.key }, data: { ...x.data, syncedAt: now } });
  let deactivated = 0;
  // Το GetTable στο PRJC δίνει ΜΟΝΟ ενεργά έργα: όσα λείπουν από ΠΛΗΡΗ ανάγνωση απενεργοποιούνται
  // (όχι διαγραφή — τα έργα τα δείχνουν παραστατικά, εργασίες, προϋπολογισμοί).
  if (!filter && rows.length > 0) {
    deactivated = (await prisma.softoneProject.updateMany({
      where: { prjc: { notIn: rows.map((r) => r.prjc) }, isActive: true }, data: { isActive: false },
    })).count;
  }
  const changed = w.create.length + w.update.length + deactivated;
  await saveOk('projects', tenantKey, {
    rows: await prisma.softoneProject.count(), changed, ms: Date.now() - t0, ...nextMarks(state, marksOf(rows), !!filter), ...(filter ? {} : { reconciled: true }),
  });
  return changed;
}

async function lookupsSync(tenantKey: string): Promise<number> {
  const t0 = Date.now();
  const r = await replaceLookups();
  await saveOk('lookups', tenantKey, { rows: r.total, changed: r.total, ms: Date.now() - t0, reconciled: true });
  return r.total;
}

async function stockSync(tenantKey: string): Promise<number> {
  const t0 = Date.now();
  const rows = await softoneFetchStock();
  // Άδεια απάντηση ενώ έχουμε υπόλοιπα = ύποπτη: δεν αδειάζουμε την αποθήκη.
  if (rows.length === 0 && (await prisma.softoneStock.count()) > 0) throw new Error('Το SoftOne δεν επέστρεψε υπόλοιπα αποθήκης — κρατάμε τα προηγούμενα.');
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.softoneStock.deleteMany({});
    for (const c of chunk(rows, 1000)) await tx.softoneStock.createMany({ data: c.map((r) => ({ ...r, syncedAt: now })) });
  });
  await saveOk('stock', tenantKey, { rows: rows.length, changed: rows.length, ms: Date.now() - t0, reconciled: true });
  return rows.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ο κύκλος
// ─────────────────────────────────────────────────────────────────────────────

async function resyncRunning(): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({ where: { key: RESYNC_RUN_KEY }, select: { key: true } }).catch(() => null);
  return !!row;
}

export function everyMinOf(table: MirrorTable, state: { everyMin: number | null } | null | undefined): number {
  return state?.everyMin && state.everyMin > 0 ? state.everyMin : DEFAULT_EVERY_MIN[table];
}

/** Πρέπει να τρέξει τώρα ο πίνακας (στον αυτόματο κύκλο); */
export function tableDue(table: MirrorTable, state: { everyMin: number | null; lastRunAt: Date | null; progress?: unknown } | null | undefined, now = Date.now()): boolean {
  if (table === 'docs' && state?.progress) return true; // αρχική φόρτωση σε εξέλιξη — συνεχίζει
  if (!state?.lastRunAt) return true;
  // 10″ ανοχή: ο worker χτυπά ανά λεπτό, να μη χάνει τον κύκλο του για ένα δευτερόλεπτο.
  return now - state.lastRunAt.getTime() >= everyMinOf(table, state) * 60_000 - 10_000;
}

const g = globalThis as unknown as { __softoneMirrorRun?: Promise<CycleReport> | null };

/**
 * ΕΝΑΣ κύκλος συγχρονισμού. Ασφαλής να καλείται από οπουδήποτε (worker, cron, κουμπί): στο ίδιο
 * process οι ταυτόχρονες κλήσεις μοιράζονται τον ίδιο κύκλο, ανάμεσα σε processes αποφασίζει η μίσθωση.
 * ΔΕΝ πετά ποτέ — τα σφάλματα γράφονται ανά πίνακα στο SoftoneMirrorState και στην αναφορά.
 *
 *  • `mode: 'auto'` (worker): όποιος πίνακας είναι «της ώρας του» κατά τον ρυθμό του· συμφωνία όταν είναι νύχτα.
 *  • `mode: 'incremental' | 'reconcile'`: όλοι (ή οι `only`) ΤΩΡΑ, με αυτόν τον τρόπο.
 */
export function runMirrorCycle(opts: { mode?: 'incremental' | 'reconcile' | 'auto'; only?: MirrorTable[]; trigger?: string } = {}): Promise<CycleReport> {
  if (g.__softoneMirrorRun) return g.__softoneMirrorRun;
  g.__softoneMirrorRun = cycle(opts.mode ?? 'auto', opts.only ?? null, opts.trigger ?? 'manual').finally(() => { g.__softoneMirrorRun = null; });
  return g.__softoneMirrorRun;
}

export function mirrorCycleRunning(): boolean {
  return !!g.__softoneMirrorRun;
}

async function cycle(mode: 'incremental' | 'reconcile' | 'auto', only: MirrorTable[] | null, trigger: string): Promise<CycleReport> {
  const started = Date.now();
  const owner = `${os.hostname()}:${process.env.PORT ?? ''}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;
  const report = (steps: StepReport[], skipped: string | null): CycleReport => ({
    mode, trigger, ok: !skipped && steps.every((s) => s.ok), skipped, steps, ms: Date.now() - started, finishedAt: new Date().toISOString(),
  });

  if (!(await acquireLease(MIRROR_LEASE, owner, LEASE_TTL_MS).catch(() => false))) {
    return report([], 'Τρέχει ήδη συγχρονισμός από άλλο instance.');
  }
  const beat = setInterval(() => { void renewLease(MIRROR_LEASE, owner, LEASE_TTL_MS).catch(() => {}); }, 60_000);
  beat.unref?.();

  try {
    return await withSoftoneSession(SESSION, async () => {
      const tenantKey = (await knownTenantKey()) ?? (await probeConnection().catch(() => null))?.tenantKey ?? null;
      if (!tenantKey) return report([], 'Δεν υπάρχει επιβεβαιωμένη σύνδεση SoftOne (Ρυθμίσεις → Δοκιμή σύνδεσης).');

      const states = new Map((await prisma.softoneMirrorState.findMany({ where: { table: { in: MIRROR_TABLES } } })).map((s) => [s.table as MirrorTable, s]));
      const now = Date.now();
      const wanted = (t: MirrorTable) => (only ? only.includes(t) : mode !== 'auto' || tableDue(t, states.get(t), now));
      const fullOf = (t: MirrorTable) => mode === 'reconcile' || (mode === 'auto' && !only && reconcileDue(states.get(t)?.reconciledAt));

      const steps: StepReport[] = [];
      const step = async (table: MirrorTable, full: boolean, fn: () => Promise<number | DocsResult>) => {
        const t0 = Date.now();
        try {
          const r = await fn();
          const changed = typeof r === 'number' ? r : r.changed;
          steps.push({ table, ok: true, changed, ms: Date.now() - t0, error: null, full, ...(typeof r === 'object' && r.note ? { note: r.note } : {}) });
          return r;
        } catch (e) {
          const msg = (e as Error).message || 'άγνωστο σφάλμα';
          await saveError(table, tenantKey, msg, Date.now() - t0);
          steps.push({ table, ok: false, changed: 0, ms: Date.now() - t0, error: msg, full });
          return null;
        }
      };

      let docs: DocsResult = { changed: 0, stockTouched: false };
      if (wanted('docs')) {
        const full = fullOf('docs');
        const r = await step('docs', full, () => (full ? docsReconcile(tenantKey) : docsIncremental(tenantKey)));
        if (r && typeof r === 'object') docs = r;
      }
      if (wanted('mydata')) { const full = fullOf('mydata'); await step('mydata', full, () => myDataSync(tenantKey, full)); }

      // Τα μητρώα τα ξαναγράφει ΟΛΟΚΛΗΡΑ ο χειροκίνητος «Συγχρονισμός όλων»: όσο τρέχει, δεν μπαίνουμε στη μέση.
      const masters: MirrorTable[] = ['traders', 'contacts', 'items', 'projects', 'series', 'lookups', 'stock'];
      if (masters.some(wanted) && await resyncRunning()) {
        steps.push({ table: 'traders', ok: true, changed: 0, ms: 0, error: null, note: 'Μητρώα: παραλείφθηκαν — τρέχει χειροκίνητος συγχρονισμός.' });
      } else {
        if (wanted('traders')) { const f = fullOf('traders'); await step('traders', f, () => tradersSync(tenantKey, f)); }
        if (wanted('contacts')) { const f = fullOf('contacts'); await step('contacts', f, () => ownRecordsSync('contacts', RECORD_SPECS.PRSN, tenantKey, f)); }
        if (wanted('items')) { const f = fullOf('items'); await step('items', f, () => itemsSync(tenantKey, f)); }
        if (wanted('projects')) { const f = fullOf('projects'); await step('projects', f, () => projectsSync(tenantKey, f)); }
        if (wanted('series')) { const f = fullOf('series'); await step('series', f, () => ownRecordsSync('series', RECORD_SPECS.SERIES, tenantKey, f)); }
        if (wanted('lookups')) await step('lookups', true, () => lookupsSync(tenantKey));
        if (wanted('stock') || (docs.stockTouched && !only)) await step('stock', true, () => stockSync(tenantKey));
      }

      // Η κερδοφορία έργων διαβάζει από τον καθρέφτη (δευτερόλεπτα): ξαναϋπολογίζεται μόλις αλλάξει κάτι.
      if (docs.changed > 0 && !(await stateOf('docs'))?.progress) {
        void import('@/lib/project-profit')
          .then((m) => m.refreshProjectFinancials())
          .catch((e) => console.warn('[softone-mirror] project financials', (e as Error).message));
      }
      return report(steps, null);
    });
  } catch (e) {
    return report([], `Σφάλμα: ${(e as Error).message}`);
  } finally {
    clearInterval(beat);
    await releaseLease(MIRROR_LEASE, owner).catch(() => {});
  }
}

/** Αλλαγή ρυθμού ενός πίνακα από την οθόνη (λεπτά· null = προεπιλογή). */
export async function setMirrorEvery(table: MirrorTable, everyMin: number | null): Promise<void> {
  const v = everyMin == null ? null : Math.max(1, Math.min(7 * 1440, Math.round(everyMin)));
  const tenantKey = (await knownTenantKey()) ?? 'unknown';
  await prisma.softoneMirrorState.upsert({
    where: { table },
    update: { everyMin: v },
    create: { table, tenantKey, syncedAt: new Date(0), rows: 0, everyMin: v },
  });
}
