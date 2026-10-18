// lib/softone-mirror/sync.ts — SERVER. Ο συγχρονισμός του καθρέφτη SoftOne: παραστατικά (FINDOC +
// MTRLINES + TRDTLINES + MYDATAHEADER + TRDBALSHEET) και μητρώα (συναλλασσόμενοι, είδη, έργα,
// βοηθητικοί πίνακες, υπόλοιπα αποθήκης).
//
// ΓΙΑΤΙ. Το SoftOne απαντά 3–10″ ανά κλήση τις κακές μέρες· οι οθόνες (καρτέλα, έργα, κερδοφορία,
// expand παραστατικού) το ρωτούσαν ζωντανά σε κάθε άνοιγμα. Τώρα διαβάζουν από τη δική μας βάση και
// το SoftOne ρωτιέται ΜΟΝΟ για ό,τι άλλαξε (UPDDATE ≥ watermark − overlap) — συνήθως 0–5 γραμμές.
//
// ΚΥΚΛΟΙ.
//  • incremental (κάθε λίγα λεπτά): ό,τι άλλαξε από το watermark. Οι γραμμές (MTRLINES/TRDTLINES)
//    ΔΕΝ έχουν UPDDATE: ξανακατεβαίνουν ΟΛΕΣ οι γραμμές κάθε κεφαλής που άλλαξε.
//  • reconcile (μία φορά τη νύχτα): σύγκριση ΟΛΩΝ των ids+UPDDATE — σβήνει ό,τι διαγράφηκε στο
//    SoftOne (οι διαγραφές δεν αφήνουν UPDDATE), ξαναφέρνει ό,τι αποκλίνει, ξαναγράφει υπόλοιπα.
//    Οι ακυρώσεις ΔΕΝ χρειάζονται συμφωνία: το ISCANCEL αλλάζει και το UPDDATE.
//
// ΚΑΝΟΝΕΣ. ΜΟΝΟ ανάγνωση (GetTable). Ιδιωτική συνεδρία SoftOne (`withSoftoneSession`) — ο worker δεν
// μπαίνει ποτέ στην ουρά της συνεδρίας των σελίδων. Ένας τη φορά σε όλα τα instances (μίσθωση).
import 'server-only';
import os from 'node:os';
import { prisma } from '@/lib/db';
import {
  softoneGetTable, softoneFetchTradersWhere, softoneFetchItemsChanged, softoneFetchItems, softoneFetchProjects,
  softoneFetchStock, isHiddenTrader, withSoftoneSession, type TrdrRow, type ItemRow, type ProjectRow,
} from '@/lib/softone';
import { knownTenantKey, probeConnection } from '@/lib/softone-sync/connection';
import { replaceLookups } from '@/lib/softone-sync/resync';
import {
  BALANCE_FIELDS, FINDOC_FIELDS, MTRLINE_FIELDS, MYDATA_FIELDS, TRDLINE_FIELDS,
  changedSinceFilter, chunk, compact, mapBalance, mapFindoc, mapMtrLine, mapMyData, mapTrdLine,
  maxStamp, nextWatermark, onlyChanged, planReconcile, planWrites, reconcileDue, s1Stamp, sinceOf,
  type FindocData, type MtrLineData, type TrdLineData,
} from './core';
import { acquireLease, releaseLease, renewLease } from './lock';

export const MIRROR_LEASE = 'softone-mirror';
const LEASE_TTL_MS = 15 * 60_000;
const SESSION = 'mirror-sync';
/** Ελάχιστο κενό ανάμεσα σε δύο κλήσεις του worker — να μη «βομβαρδίζει» ένα ήδη αργό SoftOne. */
const CALL_GAP_MS = process.env.VITEST ? 0 : 150;
const IN_CHUNK = 200;
/** Πάνω από τόσα ids σε συμφωνία, φέρνουμε ΟΛΟΝ τον πίνακα με μία κλήση αντί για δεκάδες `IN (…)`. */
const BULK_FETCH = 300;
/** Ενότητες που κινούν αποθήκη: αν άλλαξε παραστατικό τους, ξαναγράφονται τα υπόλοιπα. */
const STOCK_SOURCES = new Set([1151, 1251, 1351]);
const RESYNC_RUN_KEY = 'integrations.softoneResyncRun';

export type MirrorTable = 'docs' | 'mydata' | 'traders' | 'items' | 'projects' | 'lookups' | 'stock';
export const MIRROR_TABLE_LABEL: Record<MirrorTable, string> = {
  docs: 'Παραστατικά (κεφαλές + γραμμές)',
  mydata: 'myDATA (ΜΑΡΚ/QR)',
  traders: 'Συναλλασσόμενοι',
  items: 'Είδη & υπηρεσίες',
  projects: 'Έργα',
  lookups: 'Βοηθητικοί πίνακες',
  stock: 'Υπόλοιπα αποθηκών',
};

export type StepReport = { table: MirrorTable; ok: boolean; changed: number; ms: number; error: string | null; note?: string };
export type CycleReport = {
  mode: 'incremental' | 'reconcile';
  trigger: string;
  ok: boolean;
  skipped: string | null;
  steps: StepReport[];
  ms: number;
  finishedAt: string;
};

type Mode = 'incremental' | 'reconcile' | 'auto';

let lastCall = 0;
async function gt(table: string, fields: string[], filter: string): Promise<Record<string, string>[]> {
  const wait = lastCall + CALL_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  try {
    return await softoneGetTable(table, fields, filter);
  } finally {
    lastCall = Date.now();
  }
}

async function gtIn(table: string, fields: string[], key: string, ids: number[], extra = ''): Promise<Record<string, string>[]> {
  const out: Record<string, string>[] = [];
  for (const c of chunk(ids, IN_CHUNK)) out.push(...await gt(table, fields, `${key} IN (${c.join(',')})${extra ? ` AND ${extra}` : ''}`));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Κατάσταση ανά πίνακα (SoftoneMirrorState)
// ─────────────────────────────────────────────────────────────────────────────

async function stateOf(table: MirrorTable) {
  return prisma.softoneMirrorState.findUnique({ where: { table } });
}

async function saveOk(table: MirrorTable, tenantKey: string, p: { rows: number; changed: number; ms: number; watermark?: string | null; reconciled?: boolean }) {
  const now = new Date();
  const data = {
    tenantKey, syncedAt: now, rows: p.rows, lastRunAt: now, lastOkAt: now, lastError: null, lastMs: p.ms, lastChanged: p.changed,
    ...(p.watermark !== undefined ? { watermark: p.watermark } : {}),
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

// ─────────────────────────────────────────────────────────────────────────────
// Παραστατικά
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Γράφει κεφαλές + ΟΛΕΣ τις γραμμές τους σε μία συναλλαγή: κανείς αναγνώστης δεν βλέπει ποτέ
 * κεφαλή με μισές γραμμές. Οι γραμμές των κεφαλών αυτών αντικαθίστανται ολόκληρες (μια γραμμή που
 * σβήστηκε στο SoftOne δεν έχει πώς να έρθει αλλιώς).
 */
export async function applyDocs(heads: FindocData[], lines: MtrLineData[], tlines: TrdLineData[]): Promise<void> {
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
    const ls = lines.filter((l) => idSet.has(l.findoc));
    for (const c of chunk(ls, 1000)) await tx.softoneMtrLine.createMany({ data: c, skipDuplicates: true });
    const ts = tlines.filter((l) => idSet.has(l.findoc));
    for (const c of chunk(ts, 1000)) await tx.softoneTrdLine.createMany({ data: c, skipDuplicates: true });
  }, { timeout: 120_000 });
}

/** Κεφαλές (+ γραμμές) για συγκεκριμένα ids. Πολλά ids ⇒ μία κλήση για όλο τον πίνακα. */
async function fetchDocsFull(ids: number[]) {
  const want = new Set(ids);
  const bulk = ids.length > BULK_FETCH;
  const [h, l, t] = bulk
    ? [await gt('FINDOC', FINDOC_FIELDS, 'FINDOC>0'), await gt('MTRLINES', MTRLINE_FIELDS, 'FINDOC>0'), await gt('TRDTLINES', TRDLINE_FIELDS, 'FINDOC>0')]
    : [await gtIn('FINDOC', FINDOC_FIELDS, 'FINDOC', ids), await gtIn('MTRLINES', MTRLINE_FIELDS, 'FINDOC', ids), await gtIn('TRDTLINES', TRDLINE_FIELDS, 'FINDOC', ids)];
  return {
    heads: compact(h.map(mapFindoc)).filter((x) => want.has(x.findoc)),
    lines: compact(l.map(mapMtrLine)).filter((x) => want.has(x.findoc)),
    tlines: compact(t.map(mapTrdLine)).filter((x) => want.has(x.findoc)),
  };
}

/** Επίσημα υπόλοιπα (TRDBALSHEET): `trdrs` = μόνο αυτοί, αλλιώς ΟΛΟΣ ο πίνακας. */
async function refreshBalances(trdrs: number[] | null): Promise<number> {
  if (trdrs && trdrs.length === 0) return 0;
  const rows = compact((trdrs ? await gtIn('TRDBALSHEET', BALANCE_FIELDS, 'TRDR', trdrs) : await gt('TRDBALSHEET', BALANCE_FIELDS, 'TRDR>0')).map(mapBalance));
  await prisma.$transaction(async (tx) => {
    if (trdrs) for (const c of chunk(trdrs, 1000)) await tx.softoneTrdBalance.deleteMany({ where: { trdr: { in: c } } });
    else await tx.softoneTrdBalance.deleteMany({});
    for (const c of chunk(rows, 1000)) await tx.softoneTrdBalance.createMany({ data: c });
  }, { timeout: 60_000 });
  return rows.length;
}

type DocsResult = { changed: number; stockTouched: boolean };

async function docsIncremental(tenantKey: string): Promise<DocsResult> {
  const t0 = Date.now();
  const state = await stateOf('docs');
  assertSameTenant(state, tenantKey, 'docs');
  const since = sinceOf(state?.watermark);
  if (!since) return docsReconcile(tenantKey);

  const raw = await gt('FINDOC', ['FINDOC', 'SOSOURCE', 'UPDDATE'], `FINDOC>0 AND ${changedSinceFilter(since)}`);
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
    const { heads, lines, tlines } = await fetchDocsFull(changed.map((c) => c.findoc));
    await applyDocs(heads, lines, tlines);
    // Υπόλοιπα των συναλλασσομένων που αγγίχτηκαν (και του ΠΡΟΗΓΟΥΜΕΝΟΥ, αν άλλαξε ο συναλλασσόμενος).
    const trdrs = new Set<number>();
    for (const h of heads) if (h.trdr) trdrs.add(h.trdr);
    for (const l of tlines) if (l.trdr) trdrs.add(l.trdr);
    for (const c of changed) { const p = local.get(c.findoc)?.trdr; if (p) trdrs.add(p); }
    await refreshBalances([...trdrs]);
    stockTouched = changed.some((c) => STOCK_SOURCES.has(c.sosource));
  }
  const rows = await prisma.softoneFindoc.count();
  await saveOk('docs', tenantKey, { rows, changed: changed.length, ms: Date.now() - t0, watermark: nextWatermark(state?.watermark, raw) });
  return { changed: changed.length, stockTouched };
}

async function docsReconcile(tenantKey: string): Promise<DocsResult> {
  const t0 = Date.now();
  const state = await stateOf('docs');
  assertSameTenant(state, tenantKey, 'docs');
  const remote = await gt('FINDOC', ['FINDOC', 'UPDDATE'], 'FINDOC>0');
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
        await tx.softoneFindoc.deleteMany({ where: { findoc: { in: c } } });
      }
    });
  }
  if (plan.toFetch.length) {
    const { heads, lines, tlines } = await fetchDocsFull(plan.toFetch);
    await applyDocs(heads, lines, tlines);
  }
  await refreshBalances(null);
  const rows = await prisma.softoneFindoc.count();
  // Watermark = το μέγιστο UPDDATE ΟΛΟΥ του πίνακα, όπως το είδαμε τώρα.
  const wm = remote.reduce<string | null>((m, r) => maxStamp(m, r.UPDDATE), null);
  await saveOk('docs', tenantKey, { rows, changed: plan.toFetch.length + plan.toDelete.length, ms: Date.now() - t0, watermark: wm, reconciled: true });
  return { changed: plan.toFetch.length + plan.toDelete.length, stockTouched: plan.toFetch.length + plan.toDelete.length > 0 };
}

async function myDataSync(tenantKey: string, full: boolean): Promise<number> {
  const t0 = Date.now();
  const state = await stateOf('mydata');
  assertSameTenant(state, tenantKey, 'mydata');
  const since = full ? null : sinceOf(state?.watermark);
  const raw = await gt('MYDATAHEADER', MYDATA_FIELDS, since ? `SOID>0 AND ${changedSinceFilter(since, false)}` : 'SOID>0');
  const rows = compact(raw.map(mapMyData));
  let changed = 0;
  if (!since) {
    const plan = planReconcile(rows.map((r) => ({ id: r.id, upd: r.updRaw })), (await prisma.softoneMyData.findMany({ select: { id: true, updRaw: true } })).map((r) => ({ id: r.id, upd: r.updRaw })));
    if (plan.abort) throw new Error(plan.abort);
    await prisma.$transaction(async (tx) => {
      if (plan.toDelete.length) await tx.softoneMyData.deleteMany({ where: { id: { in: plan.toDelete } } });
      const want = new Set(plan.toFetch);
      const localIds = new Set((await tx.softoneMyData.findMany({ where: { id: { in: plan.toFetch } }, select: { id: true } })).map((r) => r.id));
      const fresh = rows.filter((r) => want.has(r.id) && !localIds.has(r.id));
      for (const c of chunk(fresh, 1000)) await tx.softoneMyData.createMany({ data: c, skipDuplicates: true });
      for (const r of rows) if (want.has(r.id) && localIds.has(r.id)) await tx.softoneMyData.update({ where: { id: r.id }, data: r });
    }, { timeout: 60_000 });
    changed = plan.toFetch.length + plan.toDelete.length;
  } else {
    const local = new Map((await prisma.softoneMyData.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true, updRaw: true } })).map((r) => [r.id, r.updRaw]));
    const ch = onlyChanged(rows, local, (r) => r.id);
    for (const r of ch) await prisma.softoneMyData.upsert({ where: { id: r.id }, update: r, create: r });
    changed = ch.length;
  }
  await saveOk('mydata', tenantKey, {
    rows: await prisma.softoneMyData.count(), changed, ms: Date.now() - t0,
    watermark: nextWatermark(since ? state?.watermark : null, raw), ...(since ? {} : { reconciled: true }),
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

const projectData = (r: ProjectRow, now: Date) => ({
  code: r.code, name: r.name, trdr: r.trdr, prjType: r.prjType, isActive: true, syncedAt: now,
  actStatus: r.actStatus, trdrSu: r.trdrSu, remarks: r.remarks,
  crdDate: r.crdDate, fromDate: r.fromDate, finalDate: r.finalDate, closeDate: r.closeDate,
});

async function tradersSync(tenantKey: string, full: boolean): Promise<number> {
  const t0 = Date.now();
  const state = await stateOf('traders');
  assertSameTenant(state, tenantKey, 'traders');
  const since = full ? null : sinceOf(state?.watermark);
  const rows = await softoneFetchTradersWhere(since ? changedSinceFilter(since) : '');
  const hidden = rows.filter((r) => isHiddenTrader(r.name)).map((r) => r.trdr);
  const visible = rows.filter((r) => !isHiddenTrader(r.name));
  let deleted = 0;
  if (!since) {
    const local = (await prisma.softoneTrader.findMany({ select: { trdr: true } })).map((t) => ({ id: t.trdr, upd: null }));
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
  await saveOk('traders', tenantKey, {
    rows: await prisma.softoneTrader.count(), changed: w.create.length + w.update.length + deleted, ms: Date.now() - t0,
    watermark: rows.reduce<string | null>((m, r) => maxStamp(m, r.updDate), since ? state?.watermark ?? null : null),
    ...(since ? {} : { reconciled: true }),
  });
  return w.create.length + w.update.length + deleted;
}

async function itemsSync(tenantKey: string, full: boolean): Promise<number> {
  const t0 = Date.now();
  const state = await stateOf('items');
  assertSameTenant(state, tenantKey, 'items');
  const since = full ? null : sinceOf(state?.watermark);
  let rows: ItemRow[];
  let deleted = 0;
  if (since) {
    const max = await prisma.softoneItem.aggregate({ _max: { mtrl: true } });
    rows = await softoneFetchItemsChanged(max._max.mtrl ?? 0, since);
  } else {
    rows = await softoneFetchItems();
    const plan = planReconcile(rows.map((r) => ({ id: r.mtrl, upd: null })), (await prisma.softoneItem.findMany({ select: { mtrl: true } })).map((r) => ({ id: r.mtrl, upd: null })));
    if (plan.abort) throw new Error(plan.abort);
    deleted = plan.toDelete.length ? (await prisma.softoneItem.deleteMany({ where: { mtrl: { in: plan.toDelete } } })).count : 0;
  }
  const local = new Map((await prisma.softoneItem.findMany({ where: { mtrl: { in: rows.map((r) => r.mtrl) } } })).map((t) => [t.mtrl, t as Record<string, unknown>]));
  const w = planWrites(rows.map((r) => ({ key: r.mtrl, data: itemData(r) })), local);
  for (const c of chunk(w.create, 1000)) await prisma.softoneItem.createMany({ data: c.map((x) => ({ mtrl: x.key, ...x.data })), skipDuplicates: true });
  for (const x of w.update) await prisma.softoneItem.update({ where: { mtrl: x.key }, data: x.data });
  await saveOk('items', tenantKey, {
    rows: await prisma.softoneItem.count(), changed: w.create.length + w.update.length + deleted, ms: Date.now() - t0,
    watermark: rows.reduce<string | null>((m, r) => maxStamp(m, r.updDate), since ? state?.watermark ?? null : null),
    ...(since ? {} : { reconciled: true }),
  });
  return w.create.length + w.update.length + deleted;
}

async function projectsSync(tenantKey: string, full: boolean): Promise<number> {
  const t0 = Date.now();
  const state = await stateOf('projects');
  assertSameTenant(state, tenantKey, 'projects');
  const since = full ? null : sinceOf(state?.watermark);
  const rows = await softoneFetchProjects(since ? changedSinceFilter(since) : '');
  const now = new Date();
  const local = new Map((await prisma.softoneProject.findMany({ where: { prjc: { in: rows.map((r) => r.prjc) } } })).map((p) => [p.prjc, p as Record<string, unknown>]));
  const w = planWrites(rows.map((r) => { const { syncedAt: _s, ...data } = projectData(r, now); return { key: r.prjc, data }; }), local);
  for (const c of chunk(w.create, 1000)) await prisma.softoneProject.createMany({ data: c.map((x) => ({ prjc: x.key, ...x.data, syncedAt: now })), skipDuplicates: true });
  for (const x of w.update) await prisma.softoneProject.update({ where: { prjc: x.key }, data: { ...x.data, syncedAt: now } });
  let deactivated = 0;
  // Το GetTable στο PRJC δίνει ΜΟΝΟ ενεργά έργα: όσα λείπουν από ΠΛΗΡΗ ανάγνωση απενεργοποιούνται
  // (όχι διαγραφή — τα έργα τα δείχνουν παραστατικά, εργασίες, προϋπολογισμοί).
  if (!since && rows.length > 0) {
    deactivated = (await prisma.softoneProject.updateMany({
      where: { prjc: { notIn: rows.map((r) => r.prjc) }, isActive: true }, data: { isActive: false },
    })).count;
  }
  await saveOk('projects', tenantKey, {
    rows: await prisma.softoneProject.count(), changed: w.create.length + w.update.length + deactivated, ms: Date.now() - t0,
    watermark: rows.reduce<string | null>((m, r) => maxStamp(m, r.updDate), since ? state?.watermark ?? null : null),
    ...(since ? {} : { reconciled: true }),
  });
  return w.create.length + w.update.length + deactivated;
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
  await saveOk('stock', tenantKey, { rows: rows.length, changed: rows.length, ms: Date.now() - t0 });
  return rows.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ο κύκλος
// ─────────────────────────────────────────────────────────────────────────────

async function resyncRunning(): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({ where: { key: RESYNC_RUN_KEY }, select: { key: true } }).catch(() => null);
  return !!row;
}

const g = globalThis as unknown as { __softoneMirrorRun?: Promise<CycleReport> | null };

/**
 * ΕΝΑΣ κύκλος συγχρονισμού. Ασφαλής να καλείται από οπουδήποτε (worker, cron, κουμπί): στο ίδιο
 * process οι ταυτόχρονες κλήσεις μοιράζονται τον ίδιο κύκλο, ανάμεσα σε processes αποφασίζει η μίσθωση.
 * ΔΕΝ πετά ποτέ — τα σφάλματα γράφονται ανά πίνακα στο SoftoneMirrorState και στην αναφορά.
 */
export function runMirrorCycle(opts: { mode?: Mode; trigger?: string } = {}): Promise<CycleReport> {
  if (g.__softoneMirrorRun) return g.__softoneMirrorRun;
  g.__softoneMirrorRun = cycle(opts.mode ?? 'auto', opts.trigger ?? 'manual').finally(() => { g.__softoneMirrorRun = null; });
  return g.__softoneMirrorRun;
}

export function mirrorCycleRunning(): boolean {
  return !!g.__softoneMirrorRun;
}

async function cycle(mode: Mode, trigger: string): Promise<CycleReport> {
  const started = Date.now();
  const owner = `${os.hostname()}:${process.env.PORT ?? ''}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;
  const report = (m: CycleReport['mode'], steps: StepReport[], skipped: string | null): CycleReport => ({
    mode: m, trigger, ok: !skipped && steps.every((s) => s.ok), skipped, steps, ms: Date.now() - started, finishedAt: new Date().toISOString(),
  });

  if (!(await acquireLease(MIRROR_LEASE, owner, LEASE_TTL_MS).catch(() => false))) {
    return report(mode === 'reconcile' ? 'reconcile' : 'incremental', [], 'Τρέχει ήδη συγχρονισμός από άλλο instance.');
  }
  const beat = setInterval(() => { void renewLease(MIRROR_LEASE, owner, LEASE_TTL_MS).catch(() => {}); }, 60_000);
  beat.unref?.();

  try {
    return await withSoftoneSession(SESSION, async () => {
      const tenantKey = (await knownTenantKey()) ?? (await probeConnection().catch(() => null))?.tenantKey ?? null;
      if (!tenantKey) return report('incremental', [], 'Δεν υπάρχει επιβεβαιωμένη σύνδεση SoftOne (Ρυθμίσεις → Δοκιμή σύνδεσης).');

      const docsState = await stateOf('docs');
      const full = mode === 'reconcile' || (mode === 'auto' && reconcileDue(docsState?.reconciledAt));
      const steps: StepReport[] = [];
      const step = async (table: MirrorTable, fn: () => Promise<number>, note?: string) => {
        const t0 = Date.now();
        try {
          const changed = await fn();
          steps.push({ table, ok: true, changed, ms: Date.now() - t0, error: null, ...(note ? { note } : {}) });
          return changed;
        } catch (e) {
          const msg = (e as Error).message || 'άγνωστο σφάλμα';
          await saveError(table, tenantKey, msg, Date.now() - t0);
          steps.push({ table, ok: false, changed: 0, ms: Date.now() - t0, error: msg });
          return 0;
        }
      };

      let docs: DocsResult = { changed: 0, stockTouched: false };
      await step('docs', async () => { docs = full ? await docsReconcile(tenantKey) : await docsIncremental(tenantKey); return docs.changed; });
      await step('mydata', () => myDataSync(tenantKey, full));

      // Τα μητρώα τα ξαναγράφει ΟΛΟΚΛΗΡΑ ο χειροκίνητος «Συγχρονισμός όλων»: όσο τρέχει, δεν μπαίνουμε στη μέση.
      if (await resyncRunning()) {
        steps.push({ table: 'traders', ok: true, changed: 0, ms: 0, error: null, note: 'Παραλείφθηκε: τρέχει χειροκίνητος συγχρονισμός.' });
      } else {
        await step('traders', () => tradersSync(tenantKey, full));
        await step('items', () => itemsSync(tenantKey, full));
        await step('projects', () => projectsSync(tenantKey, full));
        if (full) await step('lookups', () => lookupsSync(tenantKey));
        if (full || docs.stockTouched) await step('stock', () => stockSync(tenantKey));
      }

      // Η κερδοφορία έργων διαβάζει πλέον από τον καθρέφτη (δευτερόλεπτα): ξαναϋπολογίζεται μόλις
      // αλλάξει κάτι, ώστε η λίστα έργων να μην περιμένει τα 20′ του στιγμιότυπου.
      if (docs.changed > 0) {
        void import('@/lib/project-profit')
          .then((m) => m.refreshProjectFinancials())
          .catch((e) => console.warn('[softone-mirror] project financials', (e as Error).message));
      }
      return report(full ? 'reconcile' : 'incremental', steps, null);
    });
  } catch (e) {
    return report(mode === 'reconcile' ? 'reconcile' : 'incremental', [], `Σφάλμα: ${(e as Error).message}`);
  } finally {
    clearInterval(beat);
    await releaseLease(MIRROR_LEASE, owner).catch(() => {});
  }
}
