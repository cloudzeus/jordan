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
};
export type MirrorStatus = {
  tables: MirrorTableStatus[];
  running: { owner: string; expiresAt: string } | null;
  worker: { enabled: boolean; intervalSec: number };
  counts: { docs: number; lines: number; remittanceLines: number; mydata: number; balances: number };
};

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

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const n = (v: number) => v.toLocaleString('el-GR');

/** `help`: το εικονίδιο βοήθειας (server component, έρχεται από τη σελίδα). */
export function SoftoneMirrorPanel({ initial, canManage, help }: { initial: MirrorStatus; canManage: boolean; help?: React.ReactNode }) {
  const [s, setS] = React.useState(initial);
  const [now, setNow] = React.useState(() => Date.now());
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

  async function run(mode: 'incremental' | 'reconcile') {
    setStarting(true);
    try {
      const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast.success(mode === 'reconcile' ? 'Ξεκίνησε πλήρης συμφωνία με το SoftOne' : 'Ξεκίνησε συγχρονισμός αλλαγών');
      await new Promise((res) => setTimeout(res, 1500));
      await load();
    } catch (e) {
      toast.error(`Δεν ξεκίνησε ο συγχρονισμός: ${(e as Error).message}`);
    } finally {
      setStarting(false);
    }
  }

  const docs = s.tables.find((t) => t.table === 'docs');
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
              ? <>Αυτόματα κάθε {Math.round(s.worker.intervalSec / 60)}′ · πλήρης συμφωνία (διαγραφές) κάθε νύχτα.</>
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
        {docs?.lastOkAt && <span>Καθυστέρηση <b className="text-foreground">{ago(docs.lastOkAt, now).replace('πριν ', '')}</b></span>}
        {docs?.reconciledAt && <span>Τελευταία συμφωνία <b className="text-foreground">{when(docs.reconciledAt)}</b></span>}
      </div>

      {failing.length > 0 && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border px-3 py-2" style={{ backgroundColor: '#FFF8EE', borderColor: '#FCD9A8' }}>
          <FiAlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: '#B45309' }} aria-hidden />
          <div className="min-w-0 text-[length:var(--fs-12)]">
            <p className="font-semibold text-foreground">Ο τελευταίος κύκλος απέτυχε για: {failing.map((f) => f.label).join(', ')}</p>
            <p className="text-muted-foreground">Οι οθόνες συνεχίζουν με το τελευταίο καλό αντίγραφο· όταν παλιώσει (30′), ξαναδιαβάζουν ζωντανά. Ο επόμενος κύκλος θα ξαναδοκιμάσει.</p>
          </div>
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[length:var(--fs-12)]">
          <thead className="text-[length:var(--fs-11)] uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-1.5 pr-3 font-semibold">Πίνακας</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Γραμμές</th>
              <th className="py-1.5 pr-3 font-semibold">Κατάσταση</th>
              <th className="py-1.5 pr-3 font-semibold">Τελευταίος κύκλος</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Αλλαγές</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Διάρκεια</th>
              <th className="py-1.5 font-semibold">Τελευταία αλλαγή στο SoftOne</th>
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
                  <td className="py-2 pr-3 whitespace-nowrap" title={when(t.lastRunAt)}>{ago(t.lastRunAt, now)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{t.lastChanged == null ? '—' : n(t.lastChanged)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{t.lastMs == null ? '—' : `${(t.lastMs / 1000).toLocaleString('el-GR', { maximumFractionDigits: 1 })}″`}</td>
                  <td className="py-2 whitespace-nowrap text-muted-foreground">{t.watermark ? when(t.watermark.replace('Z', '')) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
