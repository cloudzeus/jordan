// lib/softone-mirror/__tests__/sync.test.ts — ο κύκλος συγχρονισμού πάνω σε ΨΕΥΤΙΚΗ βάση (στη μνήμη) και
// ψεύτικο SoftOne. Ελέγχει: πρώτη φόρτωση, αυξητικό με overlap (μόνο τα αλλαγμένα ξανακατεβαίνουν,
// οι γραμμές τους αντικαθίστανται ολόκληρες), προχώρημα του watermark, νυχτερινή συμφωνία με
// διαγραφές, και ότι δεύτερος κύκλος δεν τρέχει όσο κρατά άλλος τη μίσθωση.
import { describe, it, expect, beforeEach, vi } from 'vitest';

type Rec = Record<string, unknown>;

const { db, s1, leaseState } = vi.hoisted(() => {
  const match = (row: Rec, where: Rec = {}): boolean => Object.entries(where).every(([k, cond]) => {
    if (k === 'OR') return (cond as Rec[]).some((c) => match(row, c));
    const v = row[k];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as { in?: unknown[]; notIn?: unknown[]; gt?: number; not?: unknown };
      if (c.in) return c.in.includes(v);
      if (c.notIn) return !c.notIn.includes(v);
      if (c.gt != null) return typeof v === 'number' && v > c.gt;
      if ('not' in c) return v !== c.not;
      if (!('in' in c) && !('notIn' in c) && !('gt' in c)) return match(row, cond as Rec); // σύνθετο κλειδί (table_id)
    }
    return v === cond;
  });
  const model = (keyOf: (r: Rec) => string) => {
    const rows = new Map<string, Rec>();
    return {
      rows,
      findUnique: vi.fn(async ({ where }: { where: Rec }) => [...rows.values()].find((r) => match(r, where)) ?? null),
      findMany: vi.fn(async ({ where }: { where?: Rec } = {}) => [...rows.values()].filter((r) => match(r, where)).map((r) => ({ ...r }))),
      count: vi.fn(async () => rows.size),
      createMany: vi.fn(async ({ data }: { data: Rec[] }) => { for (const d of data) if (!rows.has(keyOf(d))) rows.set(keyOf(d), { ...d }); return { count: data.length }; }),
      create: vi.fn(async ({ data }: { data: Rec }) => { rows.set(keyOf(data), { ...data }); return data; }),
      update: vi.fn(async ({ where, data }: { where: Rec; data: Rec }) => {
        const r = [...rows.values()].find((x) => match(x, where));
        if (!r) throw new Error('not found');
        Object.assign(r, data);
        return r;
      }),
      upsert: vi.fn(async ({ where, update, create }: { where: Rec; update: Rec; create: Rec }) => {
        const r = [...rows.values()].find((x) => match(x, where));
        if (r) Object.assign(r, update); else rows.set(keyOf(create), { ...create });
        return r ?? create;
      }),
      deleteMany: vi.fn(async ({ where }: { where?: Rec } = {}) => {
        let n = 0;
        for (const [k, r] of rows) if (match(r, where)) { rows.delete(k); n++; }
        return { count: n };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Rec; data: Rec }) => {
        let n = 0;
        for (const r of rows.values()) if (match(r, where)) { Object.assign(r, data); n++; }
        return { count: n };
      }),
      aggregate: vi.fn(async () => ({ _max: { mtrl: 0 } })),
    };
  };
  const leaseState = { holder: null as string | null };
  const db = {
    softoneMirrorState: model((r) => String(r.table)),
    softoneFindoc: model((r) => String(r.findoc)),
    softoneMtrLine: model((r) => `${r.findoc}:${r.mtrlines}`),
    softoneTrdLine: model((r) => `${r.findoc}:${r.trdtlines}`),
    softoneMyData: model((r) => String(r.id)),
    softoneRecord: model((r) => `${r.table}:${r.id}`),
    softoneTrdBalance: model((r) => `${r.trdr}:${r.fiscPrd}:${r.period}`),
    softoneTrader: model((r) => String(r.trdr)),
    softoneItem: model((r) => String(r.mtrl)),
    softoneProject: model((r) => String(r.prjc)),
    softoneStock: model((r) => `${r.mtrl}:${r.whouse}`),
    appSetting: model((r) => String(r.key)),
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
    // Μίσθωση: values = [name, owner, ttl] στο acquire.
    $queryRaw: vi.fn(async (_s: TemplateStringsArray, ...v: unknown[]) => {
      const owner = String(v[1]);
      if (leaseState.holder && leaseState.holder !== owner) return [];
      leaseState.holder = owner;
      return [{ owner }];
    }),
    $executeRaw: vi.fn(async (s: TemplateStringsArray, ...v: unknown[]) => {
      if (s.join('?').startsWith('DELETE') && leaseState.holder === String(v[1])) leaseState.holder = null;
      return 1;
    }),
  };
  const s1 = {
    tables: {} as Record<string, Record<string, string>[]>,
    calls: [] as { table: string; filter: string }[],
    sinces: [] as { table: string; sinceU?: string; sinceI?: string }[],
    softoneGetTable: vi.fn(async (table: string, fields: string[], filter: string) => {
      s1.calls.push({ table, filter });
      const inIds = /FINDOC IN \(([\d,]+)\)/.exec(filter)?.[1]?.split(',');
      const trdrIn = /TRDR IN \(([\d,]+)\)/.exec(filter)?.[1]?.split(',');
      const sinceU = /UPDDATE >= CONVERT\(datetime,'([^']+)'/.exec(filter)?.[1]?.replace('T', ' ');
      const sinceI = /INSDATE >= CONVERT\(datetime,'([^']+)'/.exec(filter)?.[1]?.replace('T', ' ');
      s1.sinces.push({ table, sinceU, sinceI });
      return (s1.tables[table] ?? [])
        .filter((r) => !inIds || inIds.includes(r.FINDOC))
        .filter((r) => !trdrIn || trdrIn.includes(r.TRDR))
        .filter((r) => !sinceU || (r.UPDDATE ?? '') >= sinceU || (!!sinceI && (r.INSDATE ?? '') >= sinceI))
        .map((r) => Object.fromEntries(fields.map((f) => [f, r[f] ?? ''])));
    }),
  };
  return { db, s1, leaseState };
});

vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('@/lib/softone', () => ({
  SoftoneTransportError: class extends Error { httpStatus: number | null = null; },
  softoneGetTable: s1.softoneGetTable,
  softoneFetchTradersWhere: vi.fn(async () => []),
  softoneFetchItemsWhere: vi.fn(async () => []),
  softoneFetchProjects: vi.fn(async () => []),
  softoneFetchStock: vi.fn(async () => []),
  isHiddenTrader: () => false,
  withSoftoneSession: (_n: string, fn: () => Promise<unknown>) => fn(),
}));
vi.mock('@/lib/softone-sync/connection', () => ({ knownTenantKey: vi.fn(async () => 'T'), probeConnection: vi.fn() }));
vi.mock('@/lib/softone-sync/resync', () => ({ replaceLookups: vi.fn(async () => ({ rows: 0, failed: [], total: 0, byKind: {} })) }));
vi.mock('@/lib/project-profit', () => ({ refreshProjectFinancials: vi.fn(async () => ({})) }));

import { runMirrorCycle } from '../sync';

const head = (findoc: number, upd: string, extra: Record<string, string> = {}) => ({
  FINDOC: String(findoc), FINCODE: `ΤΔΑ${findoc}`, TRNDATE: '2026-10-16 00:00:00', SERIES: '7061', SOSOURCE: '1351',
  TRDR: '142', NETAMNT: '100', VATAMNT: '24', SUMAMNT: '124', ISCANCEL: '0', UPDDATE: upd, INSDATE: upd, ...extra,
});
const line = (findoc: number, id: number, mtrl: number, qty = '1') => ({ FINDOC: String(findoc), MTRLINES: String(id), MTRL: String(mtrl), QTY1: qty, LINEVAL: '10' });

beforeEach(() => {
  for (const m of Object.values(db)) if (typeof m === 'object' && 'rows' in m) (m as { rows: Map<string, Rec> }).rows.clear();
  s1.tables = {};
  s1.calls = [];
  s1.sinces = [];
  leaseState.holder = null;
});

describe('κύκλος καθρέφτη', () => {
  it('πρώτη φορά: πλήρης φόρτωση, watermark = μέγιστο UPDDATE, σφραγίδα συμφωνίας', async () => {
    s1.tables.FINDOC = [head(1, '2026-10-16 09:00:00'), head(2, '2026-10-16 10:00:00')];
    s1.tables.MTRLINES = [line(1, 1, 377), line(1, 2, 378), line(2, 1, 377)];
    s1.tables.TRDBALSHEET = [{ TRDR: '142', FISCPRD: '2026', PERIOD: '10', LDEBIT: '248', LCREDIT: '0' }];
    const r = await runMirrorCycle({ mode: 'auto', trigger: 'test' });
    expect(r.ok).toBe(true);
    expect(r.steps.find((x) => x.table === 'docs')).toMatchObject({ ok: true, full: true, changed: 2 });
    expect(db.softoneFindoc.rows.size).toBe(2);
    expect(db.softoneMtrLine.rows.size).toBe(3);
    expect(db.softoneTrdBalance.rows.size).toBe(1);
    const st = db.softoneMirrorState.rows.get('docs')!;
    expect(st).toMatchObject({ watermark: '2026-10-16 10:00:00', rows: 2, tenantKey: 'T', lastError: null });
    expect(st.reconciledAt).toBeInstanceOf(Date);
    expect(leaseState.holder).toBeNull(); // η μίσθωση ελευθερώθηκε
  });

  it('αυξητικό: ρωτά από watermark − 60′, ξανακατεβάζει ΜΟΝΟ τα αλλαγμένα και αντικαθιστά τις γραμμές τους', async () => {
    s1.tables.FINDOC = [head(1, '2026-10-16 09:00:00'), head(2, '2026-10-16 10:00:00')];
    s1.tables.MTRLINES = [line(1, 1, 377), line(2, 1, 377), line(2, 2, 999)];
    await runMirrorCycle({ mode: 'reconcile', trigger: 'test' });
    expect(db.softoneMtrLine.rows.size).toBe(3);

    // Στο SoftOne: το 2 ακυρώθηκε και έχασε τη μία γραμμή του· νέο παραστατικό 3.
    s1.tables.FINDOC = [head(1, '2026-10-16 09:00:00'), head(2, '2026-10-16 10:30:00', { ISCANCEL: '1' }), head(3, '2026-10-16 10:40:00')];
    s1.tables.MTRLINES = [line(1, 1, 377), line(2, 1, 377), line(3, 1, 500)];
    s1.calls = [];
    const r = await runMirrorCycle({ mode: 'incremental', trigger: 'test' });
    expect(r.ok).toBe(true);
    expect(r.steps.find((s) => s.table === 'docs')!.changed).toBe(2);

    const findocCall = s1.calls.find((c) => c.table === 'FINDOC')!;
    expect(findocCall.filter).toContain("CONVERT(datetime,'2026-10-16T09:00:00',126)");
    const linesCall = s1.calls.find((c) => c.table === 'MTRLINES')!;
    expect(linesCall.filter).toBe('FINDOC IN (2,3)'); // όχι το 1 (ήρθε λόγω overlap, αμετάβλητο)
    // Και τα παιδιά χωρίς UPDDATE (λήξεις, αναλύσεις) ξανακατεβαίνουν ΜΟΝΟ για τα αλλαγμένα.
    expect(s1.calls.find((c) => c.table === 'FINPAYTERMS')!.filter).toBe('FINDOC IN (2,3)');

    expect(db.softoneFindoc.rows.get('2')).toMatchObject({ isCancel: 1, updRaw: '2026-10-16 10:30:00' });
    expect(db.softoneMtrLine.rows.has('2:2')).toBe(false); // η σβησμένη γραμμή χάθηκε και από εμάς
    expect(db.softoneMtrLine.rows.has('3:1')).toBe(true);
    expect(db.softoneMirrorState.rows.get('docs')!.watermark).toBe('2026-10-16 10:40:00');
  });

  it('αυξητικό χωρίς αλλαγές: καμία κλήση για γραμμές, watermark ίδιο', async () => {
    s1.tables.FINDOC = [head(1, '2026-10-16 09:00:00')];
    s1.tables.MTRLINES = [line(1, 1, 377)];
    await runMirrorCycle({ mode: 'reconcile', trigger: 'test' });
    s1.calls = [];
    const r = await runMirrorCycle({ mode: 'incremental', trigger: 'test' });
    expect(r.steps.find((s) => s.table === 'docs')!.changed).toBe(0);
    expect(s1.calls.some((c) => c.table === 'MTRLINES')).toBe(false);
    expect(db.softoneMirrorState.rows.get('docs')!.watermark).toBe('2026-10-16 09:00:00');
  });

  it('συμφωνία: ό,τι σβήστηκε στο SoftOne φεύγει μαζί με τις γραμμές του', async () => {
    s1.tables.FINDOC = [head(1, '2026-10-16 09:00:00'), head(2, '2026-10-16 09:00:00')];
    s1.tables.MTRLINES = [line(1, 1, 377), line(2, 1, 377)];
    await runMirrorCycle({ mode: 'reconcile', trigger: 'test' });
    s1.tables.FINDOC = [head(1, '2026-10-16 09:00:00')];
    s1.tables.MTRLINES = [line(1, 1, 377)];
    const r = await runMirrorCycle({ mode: 'reconcile', trigger: 'test' });
    expect(r.ok).toBe(true);
    expect([...db.softoneFindoc.rows.keys()]).toEqual(['1']);
    expect(db.softoneMtrLine.rows.has('2:1')).toBe(false);
  });

  it('το SoftOne απαντά άδεια σε συμφωνία ⇒ σφάλμα βήματος, ο καθρέφτης μένει ανέπαφος', async () => {
    s1.tables.FINDOC = [head(1, '2026-10-16 09:00:00')];
    await runMirrorCycle({ mode: 'reconcile', trigger: 'test' });
    s1.tables.FINDOC = [];
    const r = await runMirrorCycle({ mode: 'reconcile', trigger: 'test' });
    const docs = r.steps.find((s) => s.table === 'docs')!;
    expect(docs.ok).toBe(false);
    expect(db.softoneFindoc.rows.size).toBe(1);
    expect(db.softoneMirrorState.rows.get('docs')!.lastError).toMatch(/καμία εγγραφή/);
  });

  it('νέο παραστατικό με ΚΕΝΟ UPDDATE πιάνεται από το INSDATE (με το δικό του watermark)', async () => {
    s1.tables.FINDOC = [head(1, '2026-10-16 09:00:00', { INSDATE: '2026-10-16 12:00:00' })];
    await runMirrorCycle({ mode: 'reconcile', trigger: 'test' });
    expect(db.softoneMirrorState.rows.get('docs')).toMatchObject({ watermark: '2026-10-16 09:00:00', watermarkIns: '2026-10-16 12:00:00' });
    s1.tables.FINDOC.push(head(2, '', { INSDATE: '2026-10-16 12:30:00' }));
    s1.sinces = [];
    await runMirrorCycle({ mode: 'incremental', trigger: 'test' });
    expect(s1.sinces.find((x) => x.table === 'FINDOC')).toEqual({ table: 'FINDOC', sinceU: '2026-10-16 08:00:00', sinceI: '2026-10-16 11:00:00' });
    expect(db.softoneFindoc.rows.has('2')).toBe(true);
    // Το κενό UPDDATE δεν «γυρίζει» το watermark — το INSDATE προχωρά.
    expect(db.softoneMirrorState.rows.get('docs')).toMatchObject({ watermark: '2026-10-16 09:00:00', watermarkIns: '2026-10-16 12:30:00' });
  });

  it('λήξεις πληρωμής (FINPAYTERMS) αντικαθίστανται μαζί με το παραστατικό', async () => {
    s1.tables.FINDOC = [head(1, '2026-10-16 09:00:00')];
    s1.tables.FINPAYTERMS = [{ FINPAYTERMS: '10', FINDOC: '1', OPNTAMNT: '124' }, { FINPAYTERMS: '11', FINDOC: '1', OPNTAMNT: '0' }];
    await runMirrorCycle({ mode: 'reconcile', trigger: 'test' });
    expect([...db.softoneRecord.rows.keys()].sort()).toEqual(['FINPAYTERMS:10', 'FINPAYTERMS:11']);
    s1.tables.FINDOC = [head(1, '2026-10-16 10:00:00')];
    s1.tables.FINPAYTERMS = [{ FINPAYTERMS: '10', FINDOC: '1', OPNTAMNT: '0' }];
    await runMirrorCycle({ mode: 'incremental', trigger: 'test' });
    expect([...db.softoneRecord.rows.keys()]).toEqual(['FINPAYTERMS:10']);
    expect(db.softoneRecord.rows.get('FINPAYTERMS:10')!.data).toMatchObject({ OPNTAMNT: '0' });
  });

  it('auto: τρέχει μόνο ό,τι είναι «της ώρας του» κατά τον ρυθμό του', async () => {
    s1.tables.FINDOC = [head(1, '2026-10-16 09:00:00')];
    await runMirrorCycle({ mode: 'reconcile', trigger: 'test' });
    const recent = new Date();
    for (const t of ['docs', 'mydata', 'traders', 'contacts', 'items', 'projects', 'series', 'lookups', 'stock']) {
      db.softoneMirrorState.rows.set(t, { ...(db.softoneMirrorState.rows.get(t) ?? { table: t, tenantKey: 'T', rows: 1 }), lastRunAt: recent, reconciledAt: recent });
    }
    // Οι συναλλασσόμενοι έτρεξαν πριν από 61′ (ρυθμός 60′), τα παραστατικά πριν από 1′ (ρυθμός 3′).
    db.softoneMirrorState.rows.get('traders')!.lastRunAt = new Date(Date.now() - 61 * 60_000);
    const r = await runMirrorCycle({ mode: 'auto', trigger: 'test' });
    expect(r.steps.map((x) => x.table)).toEqual(['traders']);
  });

  it('άλλος κρατά τη μίσθωση ⇒ ο κύκλος παραλείπεται χωρίς καμία κλήση στο SoftOne', async () => {
    leaseState.holder = 'άλλο-instance';
    const r = await runMirrorCycle({ mode: 'incremental', trigger: 'test' });
    expect(r.skipped).toMatch(/άλλο instance/);
    expect(s1.calls).toHaveLength(0);
  });
});
