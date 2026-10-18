// lib/softone-mirror/read.ts — SERVER. Ανάγνωση παραστατικών από τον ΚΑΘΡΕΦΤΗ, με ζωντανή εφεδρεία.
//
// Οι αναγνώστες (καρτέλα συναλλασσομένου, κινήσεις έργου, κερδοφορία, expand παραστατικού, τελευταία
// τιμή αγοράς) δουλεύουν πάνω σε γραμμές `Record<string,string>` όπως τις δίνει το GetTable. Ο
// καθρέφτης τους σερβίρει το ΙΔΙΟ σχήμα (lib/softone-mirror/core → findocRow κ.λπ.), οπότε η λογική
// τους μένει ίδια· αλλάζει μόνο η πηγή:
//  • φρέσκος καθρέφτης (επιτυχής κύκλος ≤ 30′, ίδια εγκατάσταση) ⇒ ΜΟΝΟ η βάση μας, χωρίς SoftOne·
//  • παλιός ⇒ ζωντανά — κι αν το SoftOne δεν απαντήσει, ο παλιός καθρέφτης (καλύτερο από κενή σελίδα)·
//  • άδειος / άλλης εγκατάστασης ⇒ ζωντανά, όπως πριν.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { knownTenantKey } from '@/lib/softone-sync/connection';
import { balanceRow, findocRow, mirrorUsable, mtrLineRow, myDataRow, trdLineRow } from './core';

type Row = Record<string, string>;
export type DocMirror = { freshness: 'fresh' | 'stale' | 'none'; syncedAt: Date | null };

const CACHE_MS = 5_000;
let cached: { at: number; v: DocMirror } | null = null;

/** Η κατάσταση του καθρέφτη παραστατικών (κρατιέται 5″ — ένα αίτημα σελίδας ρωτά πολλές φορές). */
export async function docMirror(): Promise<DocMirror> {
  // Διακόπτης ανάγκης: `SOFTONE_MIRROR_READ=off` ⇒ όλες οι οθόνες ξαναδιαβάζουν ζωντανά.
  if (process.env.SOFTONE_MIRROR_READ === 'off') return { freshness: 'none', syncedAt: null };
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.v;
  const [state, tenant] = await Promise.all([
    prisma.softoneMirrorState.findUnique({ where: { table: 'docs' } }).catch(() => null),
    knownTenantKey().catch(() => null),
  ]);
  const v: DocMirror = {
    freshness: mirrorUsable(state ? { tenantKey: state.tenantKey, rows: state.rows, lastOkAt: state.lastOkAt, watermark: state.watermark } : null, tenant),
    syncedAt: state?.lastOkAt ?? null,
  };
  cached = { at: Date.now(), v };
  return v;
}

/** Μόνο για tests / μετά από χειροκίνητο κύκλο. */
export function forgetDocMirror(): void { cached = null; }

/**
 * Διάλεξε πηγή. Επιστρέφει και ΑΠΟ ΠΟΥ ήρθαν τα δεδομένα, ώστε η οθόνη να μπορεί να πει «στοιχεία της ώρας Χ».
 */
export async function viaMirror<T>(fromMirror: () => Promise<T>, live: () => Promise<T>): Promise<{ value: T; source: 'mirror' | 'live'; asOf: Date }> {
  const m = await docMirror();
  if (m.freshness === 'fresh') return { value: await fromMirror(), source: 'mirror', asOf: m.syncedAt ?? new Date() };
  try {
    return { value: await live(), source: 'live', asOf: new Date() };
  } catch (e) {
    if (m.freshness === 'stale') {
      console.warn('[softone-mirror] SoftOne δεν απάντησε — σερβίρεται ο παλιός καθρέφτης:', (e as Error).message);
      return { value: await fromMirror(), source: 'mirror', asOf: m.syncedAt ?? new Date() };
    }
    throw e;
  }
}

// Γραμμές «σαν GetTable» από τον καθρέφτη.

export async function mFindocs(where: Prisma.SoftoneFindocWhereInput): Promise<Row[]> {
  return (await prisma.softoneFindoc.findMany({ where, orderBy: { findoc: 'asc' } })).map(findocRow);
}

export async function mMtrLines(where: Prisma.SoftoneMtrLineWhereInput): Promise<Row[]> {
  return (await prisma.softoneMtrLine.findMany({ where, orderBy: [{ findoc: 'asc' }, { mtrlines: 'asc' }] })).map(mtrLineRow);
}

export async function mTrdLines(where: Prisma.SoftoneTrdLineWhereInput): Promise<Row[]> {
  return (await prisma.softoneTrdLine.findMany({ where, orderBy: [{ findoc: 'asc' }, { trdtlines: 'asc' }] })).map(trdLineRow);
}

export async function mMyData(where: Prisma.SoftoneMyDataWhereInput): Promise<Row[]> {
  return (await prisma.softoneMyData.findMany({ where, orderBy: { id: 'asc' } })).map(myDataRow);
}

export async function mBalances(where: Prisma.SoftoneTrdBalanceWhereInput): Promise<Row[]> {
  return (await prisma.softoneTrdBalance.findMany({ where })).map(balanceRow);
}
