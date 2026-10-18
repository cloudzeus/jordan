'use client';

import * as React from 'react';
import { FiAlertTriangle, FiCheckCircle, FiClock, FiDatabase, FiMoreVertical, FiRefreshCw, FiRepeat } from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

/**
 * «Τοπικό αντίγραφο SoftOne» — η κατάσταση του καθρέφτη (lib/softone-mirror): πότε έτρεξε ο τελευταίος
 * κύκλος, πόσες γραμμές έχουμε, πόσο πίσω είμαστε, τι απέτυχε. Οι οθόνες διαβάζουν από εδώ· όταν ένας
 * πίνακας είναι «Παλιός» ή «Κενός», ξαναπάνε ζωντανά στο SoftOne.
 */

export type MirrorTableStatus = {
  table: string; label: string; rows: number;
  lastRunAt: string | null; lastOkAt: string | null; lastError: string | null;
  lastMs: number | null; lastChanged: number | null; reconciledAt: string | null;
  watermark: string | null; freshness: 'fresh' | 'stale' | 'none';
  everyMin: number; defaultEveryMin: number; nextRunAt: string | null;
  progress: { done: number; total: number; startedAt: string } | null;
};
export type MirrorStatus = {
  generatedAt: string;
  tables: MirrorTableStatus[];
  running: { owner: string; expiresAt: string } | null;
  worker: { enabled: boolean; intervalSec: number };
  counts: { docs: number; lines: number; remittanceLines: number; mydata: number; balances: number; records: Record<string, number> };
};

/** Επιλογές ρυθμού (λεπτά). */
const EVERY = [1, 3, 5, 10, 15, 30, 60, 120, 360, 720, 1440];
const everyLabel = (m: number) => (m < 60 ? `${m}′` : m < 1440 ? `${m / 60} ώρ.` : m === 1440 ? '1×/ημέρα' : `${m / 1440} ημ.`);

const ENDPOINT = '/api/admin/softone/mirror';

function ago(iso: string | null, now: number): string {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `πριν ${s}″`;
  const m = Math.round(s / 60);
  if (m < 60) return `πριν ${m}′`;
  const h = Math.round(m / 60);
  if (h < 48) return `πριν ${h} ώρ.`;
  return new Date(iso).toLocaleDateString('el-GR');
}

const RECORD_LABEL: Record<string, string> = {
  FINPAYTERMS: 'Λήξεις πληρωμής', EXPANAL: 'Αναλύσεις εξόδων', VATANAL: 'Αναλύσεις ΦΠΑ',
  TRDEXTRA: 'Επιπλέον στοιχεία συναλλ.', TRDPRSN: 'Επαφές συναλλ.', PRSN: 'Πρόσωπα', SERIES: 'Σειρές',
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const n = (v: number) => v.toLocaleString('el-GR');

/** `help`: το εικονίδιο βοήθειας (server component, έρχεται από τη σελίδα). */
export function SoftoneMirrorPanel({ initial, canManage, help }: { initial: MirrorStatus; canManage: boolean; help?: React.ReactNode }) {
  const [s, setS] = React.useState(initial);
  // Πρώτη απόδοση με την ώρα του server (ίδιο κείμενο σε server και browser), μετά με το ρολόι του browser.
  const [now, setNow] = React.useState(() => Date.parse(initial.generatedAt));
  React.useEffect(() => { setNow(Date.now()); }, []);
  const [starting, setStarting] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const r = await fetch(ENDPOINT, { cache: 'no-store' });
      if (r.ok) setS(await r.json());
    } catch { /* η επόμενη ανανέωση θα ξαναδοκιμάσει */ }
    setNow(Date.now());
  }, []);

  // Γρήγορα όσο τρέχει κύκλος, αραιά αλλιώς.
  const running = !!s.running || starting;
  React.useEffect(() => {
    const t = setInterval(load, running ? 3000 : 30000);
    return () => clearInterval(t);
  }, [load, running]);

  async function run(mode: 'incremental' | 'reconcile', table?: MirrorTableStatus) {
    setStarting(true);
    try {
      const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, table: table?.table }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const what = table ? `: ${table.label}` : '';
      toast.success(mode === 'reconcile' ? `Ξεκίνησε πλήρης συμφωνία${what}` : `Ξεκίνησε συγχρονισμός αλλαγών${what}`);
      await new Promise((res) => setTimeout(res, 1500));
      await load();
    } catch (e) {
      toast.error(`Δεν ξεκίνησε ο συγχρονισμός: ${(e as Error).message}`);
    } finally {
      setStarting(false);
    }
  }

  async function setEvery(t: MirrorTableStatus, everyMin: number) {
    try {
      const r = await fetch(ENDPOINT, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: t.table, everyMin: everyMin === t.defaultEveryMin ? null : everyMin }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast.success(`${t.label}: κάθε ${everyLabel(everyMin)}`);
      await load();
    } catch (e) {
      toast.error(`Δεν αποθηκεύτηκε ο ρυθμός: ${(e as Error).message}`);
    }
  }

  const docs = s.tables.find((t) => t.table === 'docs');
  const backfill = docs?.progress;
  const failing = s.tables.filter((t) => t.lastError && (!t.lastOkAt || (t.lastRunAt && t.lastRunAt > t.lastOkAt)));

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-4" aria-labelledby="mirror-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="mirror-title" className="flex items-center gap-2 text-[length:var(--fs-15)] font-bold text-foreground">
            <FiDatabase className="size-4 text-sisyphus-500" aria-hidden /> Τοπικό αντίγραφο SoftOne
            {help}
          </h2>
          <p className="mt-0.5 max-w-3xl text-[length:var(--fs-12)] text-muted-foreground">
            Παραστατικά, γραμμές, myDATA και μητρώα αποθηκεύονται στη βάση μας· το SoftOne ρωτιέται μόνο για ό,τι άλλαξε (UPDDATE).
            {' '}{s.worker.enabled
              ? <>Αυτόματα, με τον ρυθμό κάθε πίνακα · πλήρης συμφωνία (διαγραφές) κάθε νύχτα.</>
              : <>Ο αυτόματος συγχρονισμός είναι ανενεργός σε αυτόν τον server (τον κάνει άλλος server ή το cron).</>}
          </p>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button" onClick={() => run('incremental')} disabled={running}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-sisyphus-500 px-3 text-[length:var(--fs-12)] font-semibold text-white shadow-sm transition hover:bg-sisyphus-600 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
            >
              <FiRefreshCw className={cn('size-3.5', running && 'animate-spin')} aria-hidden />
              {running ? 'Συγχρονίζει…' : 'Συγχρονισμός τώρα'}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Περισσότερες ενέργειες συγχρονισμού"
              >
                <FiMoreVertical className="size-4" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem disabled={running} onSelect={() => run('reconcile')} className="gap-2 text-[length:var(--fs-13)]">
                  <FiRepeat className="size-3.5" aria-hidden /> Πλήρης συμφωνία τώρα
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[length:var(--fs-12)] text-muted-foreground">
        <span>Παραστατικά <b className="text-foreground">{n(s.counts.docs)}</b></span>
        <span>Γραμμές ειδών <b className="text-foreground">{n(s.counts.lines)}</b></span>
        <span>Γραμμές εμβασμάτων <b className="text-foreground">{n(s.counts.remittanceLines)}</b></span>
        <span>myDATA <b className="text-foreground">{n(s.counts.mydata)}</b></span>
        <span>Υπόλοιπα καρτέλας <b className="text-foreground">{n(s.counts.balances)}</b></span>
        {Object.entries(s.counts.records).map(([k, v]) => (
          <span key={k}>{RECORD_LABEL[k] ?? k} <b className="text-foreground">{n(v)}</b></span>
        ))}
        {docs?.lastOkAt && <span>Καθυστέρηση <b className="text-foreground">{ago(docs.lastOkAt, now).replace('πριν ', '')}</b></span>}
        {docs?.reconciledAt && <span>Τελευταία συμφωνία <b className="text-foreground">{when(docs.reconciledAt)}</b></span>}
      </div>

      {backfill && (
        <div className="mt-3 rounded-lg border border-border px-3 py-2" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-2 text-[length:var(--fs-12)]">
            <span className="font-semibold text-foreground">Αρχική φόρτωση ιστορικού παραστατικών</span>
            <span className="tabular-nums text-muted-foreground">{n(backfill.done)} / {n(backfill.total)}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-sisyphus-500 transition-all" style={{ width: `${backfill.total ? Math.round((backfill.done / backfill.total) * 100) : 0}%` }} />
          </div>
          <p className="mt-1 text-[length:var(--fs-11)] text-muted-foreground">Σε κομμάτια με παύσεις, σε δική της σύνδεση· συνεχίζει μόνη της. Μέχρι να τελειώσει, οι οθόνες διαβάζουν ζωντανά.</p>
        </div>
      )}

      {failing.length > 0 && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border px-3 py-2" style={{ backgroundColor: '#FFF8EE', borderColor: '#FCD9A8' }}>
          <FiAlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: '#B45309' }} aria-hidden />
          <div className="min-w-0 text-[length:var(--fs-12)]">
            <p className="font-semibold text-foreground">Ο τελευταίος κύκλος απέτυχε για: {failing.map((f) => f.label).join(', ')}</p>
            <p className="text-muted-foreground">Οι οθόνες συνεχίζουν με το τελευταίο καλό αντίγραφο· όταν παλιώσει (30′), ξαναδιαβάζουν ζωντανά. Ο επόμενος κύκλος θα ξαναδοκιμάσει.</p>
          </div>
        </div>
      )}

      <div className="relative mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-[length:var(--fs-12)]">
          <thead className="text-[length:var(--fs-11)] uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-1.5 pr-3 font-semibold">Πίνακας</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Γραμμές</th>
              <th className="py-1.5 pr-3 font-semibold">Κατάσταση</th>
              <th className="py-1.5 pr-3 font-semibold">Ρυθμός</th>
              <th className="py-1.5 pr-3 font-semibold">Τελευταίος κύκλος</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Αλλαγές</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Διάρκεια</th>
              <th className="py-1.5 pr-3 font-semibold">Τελευταία αλλαγή στο SoftOne</th>
              {canManage && <th className="py-1.5 font-semibold"><span className="sr-only">Ενέργειες</span></th>}
            </tr>
          </thead>
          <tbody>
            {s.tables.map((t) => {
              const err = t.lastError && (!t.lastOkAt || (t.lastRunAt && t.lastRunAt > t.lastOkAt));
              const badge = err ? { label: 'Σφάλμα', fg: '#B91C1C', bg: '#FEF2F2', Icon: FiAlertTriangle }
                : t.freshness === 'fresh' ? { label: 'Ενημερωμένο', fg: '#047857', bg: '#ECFDF5', Icon: FiCheckCircle }
                  : t.freshness === 'stale' ? { label: 'Παλιό', fg: '#B45309', bg: '#FFF8EE', Icon: FiClock }
                    : { label: 'Κενό', fg: '#64748B', bg: '#F1F5F9', Icon: FiClock };
              return (
                <tr key={t.table} className="border-b border-border/60 align-top last:border-0">
                  <td className="py-2 pr-3 font-medium text-foreground">{t.label}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{n(t.rows)}</td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[length:var(--fs-11)] font-semibold" style={{ color: badge.fg, backgroundColor: badge.bg }}>
                      <badge.Icon className="size-3" aria-hidden /> {badge.label}
                    </span>
                    {err && <p className="mt-1 max-w-xs text-[length:var(--fs-11)] text-destructive">{t.lastError}</p>}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {canManage ? (
                      <select
                        aria-label={`Ρυθμός: ${t.label}`}
                        value={t.everyMin}
                        onChange={(e) => setEvery(t, Number(e.target.value))}
                        className="h-8 rounded-md border border-input bg-background px-1.5 text-[length:var(--fs-12)]"
                      >
                        {[...new Set([...EVERY, t.everyMin])].sort((a, b) => a - b).map((m) => (
                          <option key={m} value={m}>κάθε {everyLabel(m)}{m === t.defaultEveryMin ? ' (προεπ.)' : ''}</option>
                        ))}
                      </select>
                    ) : <>κάθε {everyLabel(t.everyMin)}</>}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap" title={`Επόμενος: ${when(t.nextRunAt)}`}>{ago(t.lastRunAt, now)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{t.lastChanged == null ? '—' : n(t.lastChanged)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{t.lastMs == null ? '—' : `${(t.lastMs / 1000).toLocaleString('el-GR', { maximumFractionDigits: 1 })}″`}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{t.watermark ? when(t.watermark.replace('Z', '')) : '—'}</td>
                  {canManage && (
                    <td className="py-1 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={`Ενέργειες: ${t.label}`}
                        >
                          <FiMoreVertical className="size-4" aria-hidden />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-60">
                          <DropdownMenuItem disabled={running} onSelect={() => run('incremental', t)} className="gap-2 text-[length:var(--fs-13)]">
                            <FiRefreshCw className="size-3.5" aria-hidden /> Συγχρονισμός τώρα
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={running} onSelect={() => run('reconcile', t)} className="gap-2 text-[length:var(--fs-13)]">
                            <FiRepeat className="size-3.5" aria-hidden /> Πλήρης συμφωνία
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
