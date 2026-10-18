// lib/softone-mirror/status.ts — SERVER. Η κατάσταση του καθρέφτη για την οθόνη «Σύνδεση SoftOne».
import 'server-only';
import { prisma } from '@/lib/db';
import { knownTenantKey } from '@/lib/softone-sync/connection';
import { leaseHolder } from './lock';
import { MIRROR_LEASE, MIRROR_TABLE_LABEL, mirrorCycleRunning, type MirrorTable } from './sync';
import { mirrorUsable, s1DateTime } from './core';
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
  freshness: 'fresh' | 'stale' | 'none';
};

export type MirrorStatus = {
  tables: MirrorTableStatus[];
  running: { owner: string; expiresAt: string } | null;
  worker: { enabled: boolean; intervalSec: number };
  counts: { docs: number; lines: number; remittanceLines: number; mydata: number; balances: number };
};

const ORDER: MirrorTable[] = ['docs', 'mydata', 'traders', 'items', 'projects', 'lookups', 'stock'];

export async function mirrorStatus(): Promise<MirrorStatus> {
  const [states, tenant, holder, docs, lines, remittanceLines, mydata, balances] = await Promise.all([
    prisma.softoneMirrorState.findMany({ where: { table: { in: ORDER } } }),
    knownTenantKey(),
    leaseHolder(MIRROR_LEASE),
    prisma.softoneFindoc.count(), prisma.softoneMtrLine.count(), prisma.softoneTrdLine.count(),
    prisma.softoneMyData.count(), prisma.softoneTrdBalance.count(),
  ]);
  const by = new Map(states.map((s) => [s.table, s]));
  return {
    tables: ORDER.map((table) => {
      const s = by.get(table);
      return {
        table, label: MIRROR_TABLE_LABEL[table], rows: s?.rows ?? 0,
        lastRunAt: s?.lastRunAt?.toISOString() ?? null,
        lastOkAt: s?.lastOkAt?.toISOString() ?? null,
        lastError: s?.lastError ?? null,
        lastMs: s?.lastMs ?? null,
        lastChanged: s?.lastChanged ?? null,
        reconciledAt: s?.reconciledAt?.toISOString() ?? null,
        watermark: s?.watermark ? s1DateTime(s.watermark)?.toISOString() ?? null : null,
        freshness: mirrorUsable(s ? { tenantKey: s.tenantKey, rows: s.rows, lastOkAt: s.lastOkAt, watermark: s.watermark } : null, tenant),
      };
    }),
    running: holder ? { owner: holder.owner, expiresAt: holder.expiresAt.toISOString() } : mirrorCycleRunning() ? { owner: 'this', expiresAt: new Date().toISOString() } : null,
    worker: { enabled: !mirrorWorkerDisabled(), intervalSec: Math.round(mirrorIntervalMs() / 1000) },
    counts: { docs, lines, remittanceLines, mydata, balances },
  };
}
