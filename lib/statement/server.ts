import 'server-only';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SoftoneError } from '@/lib/softone';
import { emailBrand } from '@/lib/email/brand';
import { traderActivity } from '@/lib/trader-activity';
import { buildStatement, type StatementEntry } from '@/lib/statement/core';
import { sampleStatementDoc } from '@/lib/statement/sample';
import type { StatementDoc } from '@/lib/statement/email';

/**
 * Κατάσταση λογαριασμού ενός πελάτη: καρτέλα ζωντανά από το SoftOne (`traderActivity` — μόνο
 * GetTable, ΚΑΜΙΑ εγγραφή) + στοιχεία πελάτη από τον καθρέφτη + ταυτότητα εταιρείας από τις Ρυθμίσεις.
 * ~3–4 κλήσεις SoftOne (2–3″ η καθεμία) — καλείται μόνο με ρητή ενέργεια χρήστη.
 */
export class StatementError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

// Προεπισκόπηση → PDF → αποστολή μέσα σε λίγα λεπτά: μία ανάγνωση της καρτέλας, όχι τρεις (SoftOne ~2–3″/κλήση).
const TTL_MS = 5 * 60_000;
const cache = new Map<number, { at: number; p: ReturnType<typeof traderActivity> }>();
function cachedActivity(trdr: number) {
  const hit = cache.get(trdr);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.p;
  const p = traderActivity(trdr);
  cache.set(trdr, { at: Date.now(), p });
  p.catch(() => cache.delete(trdr));
  return p;
}

export const todayAthens = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(new Date());
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function loadStatement(trdr: number, period: { from?: string | null; to?: string | null } = {}, message?: string | null): Promise<StatementDoc> {
  if (!Number.isInteger(trdr) || trdr <= 0) throw new StatementError('Μη έγκυρος πελάτης');
  const t = await prisma.softoneTrader.findUnique({ where: { trdr } });
  if (!t) throw new StatementError('Ο πελάτης δεν βρέθηκε', 404);
  const to = isDay(period.to) ? period.to : todayAthens();
  const from = isDay(period.from) && period.from <= to ? period.from : null;
  const [a, brand] = await Promise.all([cachedActivity(trdr), emailBrand()]);
  if (a.side !== 'customer') throw new StatementError('Η κατάσταση λογαριασμού αφορά μόνο πελάτες');
  const entries: StatementEntry[] = a.ledger.filter((d) => d.side).map((d) => ({
    findoc: d.findoc, fincode: d.fincode, date: d.date, kindLabel: d.kindLabel, seriesName: d.seriesName,
    project: d.project, amount: d.amount, side: d.side as 'D' | 'C',
  }));
  return {
    brand,
    customer: { trdr, code: t.code, name: t.name, afm: t.afm, doy: t.doy, address: t.address, zip: t.zip, city: t.city, email: t.email, phone: t.phone },
    statement: buildStatement(entries, { from, to }),
    issuedOn: todayAthens(),
    message: message?.trim() || null,
  };
}

/** Για τα routes: «sample» = δείγμα (χωρίς SoftOne), αλλιώς ο πελάτης με το TRDR. */
export async function statementDocFor(param: string, body: { from?: unknown; to?: unknown; message?: unknown }): Promise<StatementDoc> {
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  if (param === 'sample') {
    const d = sampleStatementDoc(await emailBrand(), todayAthens());
    return { ...d, message: str(body.message)?.trim() || null };
  }
  return loadStatement(Number(param), { from: str(body.from), to: str(body.to) }, str(body.message));
}

export function statementErrorResponse(e: unknown) {
  if (e instanceof StatementError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof SoftoneError) return NextResponse.json({ error: `SoftOne: ${e.message}` }, { status: 502 });
  console.error('[statement]', e);
  return NextResponse.json({ error: (e as Error).message }, { status: 500 });
}
