// lib/softone-mirror/status.ts — SERVER. Η κατάσταση του καθρέφτη για την οθόνη «Τοπικό αντίγραφο SoftOne».
import 'server-only';
import { prisma } from '@/lib/db';
import { knownTenantKey } from '@/lib/softone-sync/connection';
import { leaseHolder } from './lock';
import { DEFAULT_EVERY_MIN, MIRROR_LEASE, MIRROR_TABLES, MIRROR_TABLE_LABEL, everyMinOf, mirrorCycleRunning, type MirrorTable } from './sync';
import { mirrorUsable, s1DateTime, STALE_MS } from './core';
import { mirrorIntervalMs, mirrorWorkerDisabled } from './worker';

export type MirrorTableStatus = {
  table: MirrorTable;
  label: string;
  rows: number;
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  lastMs: number | null;
  lastChanged: number | null;
  reconciledAt: string | null;
  /** Το τελευταίο UPDDATE που είδαμε (ώρα SoftOne). */
  watermark: string | null;
  /** Ρυθμός (λεπτά) — `custom` όταν διαφέρει από την προεπιλογή. */
  everyMin: number;
  defaultEveryMin: number;
  nextRunAt: string | null;
  /** Αρχική φόρτωση σε εξέλιξη. */
  progress: { done: number; total: number; startedAt: string } | null;
  freshness: 'fresh' | 'stale' | 'none';
};

export type MirrorStatus = {
  /** Πότε φτιάχτηκε (για να αποδοθεί ίδια η πρώτη εικόνα σε server και browser). */
  generatedAt: string;
  tables: MirrorTableStatus[];
  running: { owner: string; expiresAt: string } | null;
  worker: { enabled: boolean; intervalSec: number };
  counts: { docs: number; lines: number; remittanceLines: number; mydata: number; balances: number; records: Record<string, number> };
};

export async function mirrorStatus(): Promise<MirrorStatus> {
  const [states, tenant, holder, docs, lines, remittanceLines, mydata, balances, recs] = await Promise.all([
    prisma.softoneMirrorState.findMany({ where: { table: { in: MIRROR_TABLES } } }),
    knownTenantKey(),
    leaseHolder(MIRROR_LEASE),
    prisma.softoneFindoc.count(), prisma.softoneMtrLine.count(), prisma.softoneTrdLine.count(),
    prisma.softoneMyData.count(), prisma.softoneTrdBalance.count(),
    prisma.softoneRecord.groupBy({ by: ['table'], _count: { _all: true } }),
  ]);
  const by = new Map(states.map((s) => [s.table, s]));
  return {
    generatedAt: new Date().toISOString(),
    tables: MIRROR_TABLES.map((table) => {
      const s = by.get(table);
      const every = everyMinOf(table, s);
      const p = s?.progress as { done?: number; total?: number; startedAt?: string } | null | undefined;
      return {
        table, label: MIRROR_TABLE_LABEL[table], rows: s?.rows ?? 0,
        lastRunAt: s?.lastRunAt?.toISOString() ?? null,
        lastOkAt: s?.lastOkAt?.toISOString() ?? null,
        lastError: s?.lastError ?? null,
        lastMs: s?.lastMs ?? null,
        lastChanged: s?.lastChanged ?? null,
        reconciledAt: s?.reconciledAt?.toISOString() ?? null,
        watermark: s?.watermark ? s1DateTime(s.watermark)?.toISOString() ?? null : null,
        everyMin: every,
        defaultEveryMin: DEFAULT_EVERY_MIN[table],
        nextRunAt: s?.lastRunAt ? new Date(s.lastRunAt.getTime() + every * 60_000).toISOString() : null,
        progress: p && typeof p.total === 'number' ? { done: p.done ?? 0, total: p.total, startedAt: p.startedAt ?? '' } : null,
        // Η φρεσκάδα κρίνεται με το ΔΙΚΟ του ρυθμό: ένας ωριαίος πίνακας δεν είναι «παλιός» στα 31′.
        freshness: mirrorUsable(s ? { tenantKey: s.tenantKey, rows: s.rows, lastOkAt: s.lastOkAt, watermark: s.watermark } : null, tenant, Date.now(), Math.max(STALE_MS, every * 2 * 60_000)),
      };
    }),
    running: holder ? { owner: holder.owner, expiresAt: holder.expiresAt.toISOString() } : mirrorCycleRunning() ? { owner: 'this', expiresAt: new Date().toISOString() } : null,
    worker: { enabled: !mirrorWorkerDisabled(), intervalSec: Math.round(mirrorIntervalMs() / 1000) },
    counts: { docs, lines, remittanceLines, mydata, balances, records: Object.fromEntries(recs.map((r) => [r.table, r._count._all])) },
  };
}
