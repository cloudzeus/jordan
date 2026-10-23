'use client';

// Αναζητήσεις της φόρμας προσφοράς (πελάτης, συνεργεία) και υπαγόρευση με μικρόφωνο.
import * as React from 'react';
import { toast } from 'sonner';
import { FiLoader, FiMic, FiSearch, FiSquare, FiUser, FiX } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useVoiceInput } from '@/components/assistant/use-voice-input';
import { cn } from '@/lib/utils';

const field = 'h-9 text-(length:--fs-12)';

// ── Πελάτης ──────────────────────────────────────────────────────────────────────────────────────
type CustomerHit = { trdr: number; name: string; code: string; email: string | null; phone: string | null; city: string | null };
export function CustomerPicker({ value, onPick, disabled }: { value: { trdr: number | null; name: string | null }; onPick: (h: CustomerHit | null) => void; disabled?: boolean }) {
  const [q, setQ] = React.useState('');
  const [hits, setHits] = React.useState<CustomerHit[]>([]);
  const [open, setOpen] = React.useState(false);
  const [prevQ, setPrevQ] = React.useState(q);
  if (q !== prevQ) { setPrevQ(q); if (q.trim().length < 2) setHits([]); }
  React.useEffect(() => {
    if (q.trim().length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/admin/contracts/options?kind=customers&q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal })
        .then((r) => r.json()).then((b) => { setHits(b.options ?? []); setOpen(true); }).catch(() => null);
    }, 220);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);
  if (value.trdr && value.name) {
    return (
      <div className="flex min-h-9 items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3">
        <span className="flex min-w-0 items-center gap-2 text-(length:--fs-13)"><FiUser className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /><span className="truncate font-medium">{value.name}</span></span>
        {!disabled && <button type="button" onClick={() => onPick(null)} className="inline-flex size-7 items-center justify-center rounded hover:bg-muted" aria-label="Αλλαγή πελάτη"><FiX className="size-3.5" /></button>}
      </div>
    );
  }
  return (
    <div className="relative">
      <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input id="c-customer" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Αναζήτηση πελάτη (επωνυμία, κωδικός, ΑΦΜ)…" className={cn(field, 'pl-8')} disabled={disabled} autoComplete="off" />
      {open && hits.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg">
          {hits.map((h) => (
            <li key={h.trdr}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(h); setQ(''); setOpen(false); }}
                className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left hover:bg-muted">
                <span className="text-(length:--fs-13) font-medium">{h.name}</span>
                <span className="text-(length:--fs-11) text-muted-foreground">{[h.code, h.city, h.email].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Συνεργεία ────────────────────────────────────────────────────────────────────────────────────
export type CrewOpt = { kind: 'SUPPLIER' | 'PARTNER'; ref: string; name: string; sub: string | null; email: string | null; phone: string | null; afm: string | null; crew: boolean };
export function CrewPicker({ onPick, exclude }: { onPick: (o: CrewOpt) => void; exclude: Set<string> }) {
  const [q, setQ] = React.useState('');
  const [opts, setOpts] = React.useState<CrewOpt[] | null>(null);
  const [open, setOpen] = React.useState(false);
  const load = React.useCallback((s: string, signal?: AbortSignal) =>
    fetch(`/api/admin/contracts/options?kind=crew&q=${encodeURIComponent(s.trim())}`, { signal }).then((r) => r.json()).then((b) => setOpts(b.options ?? [])).catch(() => null), []);
  React.useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const t = setTimeout(() => void load(q, ctl.signal), 200);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, open, load]);
  const shown = (opts ?? []).filter((o) => !exclude.has(`${o.kind}:${o.ref}`));
  return (
    <div className="relative w-full sm:w-80">
      <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Προσθήκη συνεργείου / μάστορα…" className={cn(field, 'pl-8')} autoComplete="off" aria-label="Αναζήτηση συνεργείου" />
      {open && (
        <ul className="absolute right-0 z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg sm:w-96">
          {opts == null && <li className="px-2 py-2 text-(length:--fs-12) text-muted-foreground"><FiLoader className="mr-1 inline size-3 animate-spin" />Φόρτωση…</li>}
          {opts != null && !shown.length && <li className="px-2 py-2 text-(length:--fs-12) text-muted-foreground">Κανένα αποτέλεσμα — γράψτε 2+ χαρακτήρες για όλους τους προμηθευτές.</li>}
          {shown.map((o, i) => (
            <li key={`${o.kind}:${o.ref}`}>
              {i > 0 && !o.crew && shown[i - 1].crew && <div className="mx-2 my-1 border-t border-border pt-1 text-(length:--fs-10) uppercase tracking-wide text-muted-foreground">Άλλοι προμηθευτές</div>}
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(o); setQ(''); setOpen(false); }} className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-muted">
                <span className={cn('mt-0.5 rounded px-1 text-(length:--fs-9) font-semibold uppercase', o.kind === 'PARTNER' ? 'bg-violet-500/10 text-violet-700' : 'bg-sky-500/10 text-sky-700')}>{o.kind === 'PARTNER' ? 'Συνεργάτης' : 'Προμηθ.'}</span>
                <span className="min-w-0">
                  <span className="block truncate text-(length:--fs-13) font-medium">{o.name}</span>
                  <span className="block truncate text-(length:--fs-11) text-muted-foreground">{[o.sub, o.email, o.phone].filter(Boolean).join(' · ') || '—'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Μικρόφωνο ────────────────────────────────────────────────────────────────────────────────────
export function MicButton({ onText }: { onText: (t: string) => void }) {
  const v = useVoiceInput({ endpoint: '/api/admin/contracts/transcribe', onText, onError: (m) => toast.error(m) });
  if (!v.supported) return null;
  const rec = v.state === 'recording';
  return (
    <Button type="button" variant={rec ? 'destructive' : 'secondary'} size="sm" onClick={() => (rec ? v.stop() : void v.start())} disabled={v.state === 'transcribing'}
      aria-label={rec ? 'Τέλος υπαγόρευσης' : 'Υπαγόρευση με μικρόφωνο'} className="gap-1.5">
      {v.state === 'transcribing' ? <FiLoader className="size-3.5 animate-spin" /> : rec ? <FiSquare className="size-3.5" /> : <FiMic className="size-3.5" />}
      {v.state === 'transcribing' ? 'Μεταγραφή…' : rec ? `Stop · ${v.seconds}s` : 'Υπαγόρευση'}
    </Button>
  );
}
