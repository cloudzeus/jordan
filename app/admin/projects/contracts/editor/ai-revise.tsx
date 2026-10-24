'use client';

// Αναπροσαρμογή προσφοράς με AI από τα αιτήματα του πελάτη. Δύο βήματα: (1) ποια αιτήματα + οδηγία,
// (2) έλεγχος της πρότασης — κάθε αλλαγή «πριν → μετά» με τον αντίκτυπο στο σύνολο και επεξεργάσιμες
// απαντήσεις. Τίποτα δεν εφαρμόζεται χωρίς έγκριση· οι αλλαγές μπαίνουν στη φόρμα και αποθηκεύονται ως νέα έκδοση.
import * as React from 'react';
import { toast } from 'sonner';
import {
  FiAlertTriangle, FiArrowRight, FiCheck, FiCornerDownRight, FiEdit3, FiFileText, FiHelpCircle, FiMinusCircle, FiPlusCircle, FiRefreshCw, FiZap,
} from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { describeChange, paragraphDiff, type ApplyLine, type ReviseChange, type ReviseLine, type Revision } from '@/lib/contracts/revise-core';
import type { NoteView } from '@/lib/contracts/notes';
import { cn } from '@/lib/utils';
import { answerRequestsAction, reviseOfferAction } from '../actions';

const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${eur(Math.abs(n))}`;

export type ReviseContext = {
  title: string; kindLabel: string; customerName: string | null; summary: string; customerText: string | null;
  rooms: { id: string; name: string; floorM2: number; wallsM2: number }[];
  lines: ApplyLine[]; milestones: string[]; vatRate: number;
};

const OP = {
  update: { l: 'Αλλαγή', icon: FiEdit3, cls: 'bg-sky-50 text-sky-900 ring-sky-200' },
  remove: { l: 'Αφαίρεση', icon: FiMinusCircle, cls: 'bg-rose-50 text-rose-900 ring-rose-200' },
  add: { l: 'Νέα γραμμή', icon: FiPlusCircle, cls: 'bg-emerald-50 text-emerald-900 ring-emerald-200' },
} as const;
const LOADING = ['Διαβάζω τα αιτήματα του πελάτη…', 'Ελέγχω τις γραμμές της προσφοράς…', 'Ετοιμάζω αλλαγές και απαντήσεις…'];

export function AiReviseDialog({ open, onOpenChange, contractId, requests, ctx, onApply }: {
  open: boolean; onOpenChange: (o: boolean) => void; contractId: string; requests: NoteView[];
  ctx: () => ReviseContext; onApply: (changes: ReviseChange[], customerText: string | null) => void;
}) {
  // Κάθε άνοιγμα ξαναστήνει τον διάλογο (key στον γονέα): βήμα 1 με όλα τα ανοιχτά αιτήματα επιλεγμένα.
  const [picked, setPicked] = React.useState<Set<string>>(() => new Set(requests.map((r) => r.id)));
  const [instruction, setInstruction] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const [rev, setRev] = React.useState<Revision | null>(null);
  const [snapshot, setSnapshot] = React.useState<ReviseContext | null>(null);
  const [onChanges, setOnChanges] = React.useState<Set<number>>(new Set());
  const [replies, setReplies] = React.useState<Record<string, { text: string; send: boolean; resolve: boolean }>>({});
  const [applying, setApplying] = React.useState(false);
  // Διορθωμένο «κείμενο για τον πελάτη»: προεπιλέγεται, επεξεργάσιμο, με «τι αλλάζει» ανά παράγραφο.
  const [text, setText] = React.useState<{ on: boolean; value: string } | null>(null);

  React.useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setTick((x) => (x + 1) % LOADING.length), 2500);
    return () => clearInterval(t);
  }, [loading]);

  const ask = async () => {
    const c = ctx();
    const lines: ReviseLine[] = c.lines.map((l, i) => ({
      key: `L${i + 1}`, kind: l.kind, name: l.name, code: l.code, unit: l.unit, qty: l.qty, unitPrice: l.unitPrice, discount: l.discount,
      room: l.roomId ? c.rooms.find((r) => r.id === l.roomId)?.name ?? null : null,
    }));
    setLoading(true); setTick(0);
    const r = await reviseOfferAction(contractId, {
      title: c.title, kindLabel: c.kindLabel, customerName: c.customerName, summary: c.summary, customerText: c.customerText,
      rooms: c.rooms.map(({ name, floorM2, wallsM2 }) => ({ name, floorM2, wallsM2 })), lines, milestones: c.milestones,
      requestIds: [...picked], instruction,
    }).catch(() => null);
    setLoading(false);
    if (!r?.ok) { toast.error(r && 'message' in r ? String(r.message) : 'Το AI δεν απάντησε — δοκιμάστε ξανά.'); return; }
    setSnapshot(c);
    setRev(r.data);
    // Αλλαγές τιμής μονάδας: προτείνονται αλλά δεν προεπιλέγονται — θέλουν ρητή απόφαση.
    setOnChanges(new Set(r.data.changes.flatMap((c, i) => (c.op === 'update' && c.unitPrice != null ? [] : [i]))));
    setText(r.data.customerText ? { on: true, value: r.data.customerText.text } : null);
    setReplies(Object.fromEntries(r.data.replies.map((x) => {
      const q = requests.find((n) => n.id === x.request);
      return [x.request, { text: x.text, send: true, resolve: q?.kind === 'QUESTION' }];
    })));
  };

  const lineMap = React.useMemo(() => new Map((snapshot?.lines ?? []).map((l, i) => [`L${i + 1}`, l])), [snapshot]);
  const rows = rev?.changes.map((ch, i) => ({ ch, i, d: describeChange(ch, lineMap) })) ?? [];
  const net0 = (snapshot?.lines ?? []).reduce((t, l) => t + l.qty * l.unitPrice * (1 - l.discount / 100), 0);
  const delta = rows.filter((r) => onChanges.has(r.i)).reduce((t, r) => t + r.d.delta, 0);
  const vat = 1 + (snapshot?.vatRate ?? 24) / 100;
  const sendCount = Object.values(replies).filter((r) => r.send && r.text.trim()).length;
  const textOn = !!text?.on && text.value.trim().length >= 40;
  const diff = React.useMemo(() => (rev?.customerText && snapshot?.customerText ? paragraphDiff(snapshot.customerText, text?.value ?? rev.customerText.text) : null), [rev, snapshot, text]);

  const apply = async () => {
    if (!rev) return;
    const chosen = rev.changes.filter((_, i) => onChanges.has(i));
    setApplying(true);
    if (chosen.length || textOn) onApply(chosen, textOn ? text!.value.trim() : null);
    const out = await answerRequestsAction(contractId, {
      replies: Object.entries(replies).filter(([, r]) => r.send && r.text.trim()).map(([request, r]) => ({ request, text: r.text, resolve: r.resolve })),
      summary: [rev.summary, textOn ? 'διορθώθηκε το κείμενο για τον πελάτη' : ''].filter(Boolean).join(' · '), changes: chosen.length + (textOn ? 1 : 0),
    }).catch(() => null);
    setApplying(false);
    if (!out?.ok) { toast.error('Οι αλλαγές μπήκαν στη φόρμα, αλλά οι απαντήσεις δεν στάλθηκαν — δοκιμάστε από τη συζήτηση.'); onOpenChange(false); return; }
    toast.success(chosen.length || textOn ? 'Οι αλλαγές μπήκαν στη φόρμα — πατήστε «Αποθήκευση» και στείλτε τη νέα έκδοση' : 'Οι απαντήσεις στάλθηκαν', {
      description: sendCount ? `${sendCount === 1 ? '1 απάντηση' : `${sendCount} απαντήσεις`} στον πελάτη · μένουν στο ιστορικό` : undefined,
    });
    onOpenChange(false);
  };

  const step = rev ? 2 : 1;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!applying) onOpenChange(o); }}>
      <DialogContent className="flex max-h-[92dvh] w-[min(56rem,96vw)] max-w-none flex-col gap-0 p-0 sm:max-w-none">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-(length:--fs-16)">
            <span className="inline-flex size-7 items-center justify-center rounded-md bg-violet-100 text-violet-800"><FiZap className="size-4" aria-hidden /></span>
            Αναπροσαρμογή με AI
          </DialogTitle>
          <DialogDescription className="text-(length:--fs-12)">
            Πρόταση του AI από τα αιτήματα του πελάτη. Εσείς διαλέγετε τι εφαρμόζεται — τίποτα δεν αλλάζει χωρίς την έγκρισή σας.
          </DialogDescription>
          <ol className="mt-2 flex items-center gap-2 text-(length:--fs-11)" aria-label="Βήματα">
            {['Αιτήματα', 'Έλεγχος πρότασης'].map((l, i) => (
              <li key={l} className={cn('inline-flex items-center gap-1.5 font-medium', step === i + 1 ? 'text-foreground' : 'text-muted-foreground')} aria-current={step === i + 1 ? 'step' : undefined}>
                <span className={cn('inline-flex size-5 items-center justify-center rounded-full text-(length:--fs-10)', step > i + 1 ? 'bg-emerald-600 text-white' : step === i + 1 ? 'bg-foreground text-background' : 'bg-muted')}>{step > i + 1 ? <FiCheck className="size-3" /> : i + 1}</span>
                {l}{i === 0 && <FiArrowRight className="ml-1 size-3 text-muted-foreground" aria-hidden />}
              </li>
            ))}
          </ol>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="space-y-3" role="status" aria-live="polite">
              <p className="flex items-center gap-2 text-(length:--fs-13) text-muted-foreground"><FiRefreshCw className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />{LOADING[tick]}</p>
              {[0, 1, 2].map((k) => <div key={k} className="h-16 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />)}
              <p className="text-(length:--fs-11) text-muted-foreground">Μπορεί να πάρει έως ένα λεπτό.</p>
            </div>
          ) : !rev ? (
            <div className="space-y-4">
              <fieldset>
                <legend className="text-(length:--fs-12) font-semibold">Ποια αιτήματα να ληφθούν υπόψη</legend>
                <ul className="mt-2 space-y-1.5">
                  {requests.map((r) => {
                    const on = picked.has(r.id);
                    const Q = r.kind === 'QUESTION' ? FiHelpCircle : FiEdit3;
                    return (
                      <li key={r.id}>
                        <label className={cn('flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors', on ? 'border-violet-300 bg-violet-50/50' : 'border-border hover:bg-muted/50')}>
                          <input type="checkbox" checked={on} onChange={() => setPicked((s) => { const n = new Set(s); if (on) n.delete(r.id); else n.add(r.id); return n; })} className="mt-1 size-4 accent-violet-700" />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5 text-(length:--fs-11) text-muted-foreground">
                              <span className="inline-flex items-center gap-1 font-medium text-foreground"><Q className="size-3" aria-hidden />{r.kind === 'QUESTION' ? 'Ερώτηση' : 'Αίτημα αλλαγής'}</span>
                              {r.targetLabel && <span>· {r.targetLabel}</span>}{r.revision != null && <span>· έκδ. {r.revision}</span>}
                            </span>
                            <span className="mt-0.5 block whitespace-pre-wrap text-(length:--fs-13)">{r.body}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
              <div>
                <label htmlFor="ai-rev-instr" className="text-(length:--fs-12) font-semibold">Οδηγία προς το AI <span className="font-normal text-muted-foreground">(προαιρετικό)</span></label>
                <textarea id="ai-rev-instr" value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={2} maxLength={2000}
                  placeholder="π.χ. Μην δώσεις έκπτωση πάνω από 5%. Πρότεινε εναλλακτική στο υλικό αν δεν γίνεται."
                  className="mt-1 w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-(length:--fs-13) outline-hidden focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {rev.summary && (
                <p className="flex gap-2 rounded-lg bg-violet-50 px-3 py-2.5 text-(length:--fs-13) text-violet-950 ring-1 ring-inset ring-violet-200">
                  <FiZap className="mt-0.5 size-4 shrink-0" aria-hidden /><span><span className="sr-only">Περίληψη AI: </span>{rev.summary}</span>
                </p>
              )}

              <section aria-labelledby="ai-ch">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 id="ai-ch" className="text-(length:--fs-13) font-semibold">Αλλαγές στις γραμμές ({onChanges.size}/{rows.length})</h3>
                  {rows.length > 1 && (
                    <button type="button" className="min-h-8 cursor-pointer text-(length:--fs-12) font-medium text-primary hover:underline"
                      onClick={() => setOnChanges(onChanges.size === rows.length ? new Set() : new Set(rows.map((r) => r.i)))}>
                      {onChanges.size === rows.length ? 'Καμία' : 'Όλες'}
                    </button>
                  )}
                </div>
                {rows.length === 0 ? (
                  <p className="mt-1.5 text-(length:--fs-12) text-muted-foreground">Καμία αλλαγή στις γραμμές της προσφοράς.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                    {rows.map(({ ch, i, d }) => {
                      const on = onChanges.has(i);
                      const o = OP[ch.op];
                      const req = requests.find((r) => r.id === ch.request);
                      return (
                        <li key={i}>
                          <label className={cn('grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-3 py-2.5 transition-colors', on ? 'bg-background' : 'bg-muted/40')}>
                            <input type="checkbox" checked={on} onChange={() => setOnChanges((s) => { const n = new Set(s); if (on) n.delete(i); else n.add(i); return n; })} className="mt-0.5 size-4" aria-label={`Εφαρμογή: ${d.title}`} />
                            <span className={cn('min-w-0', !on && 'opacity-60')}>
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-px text-(length:--fs-10) font-semibold uppercase ring-1 ring-inset', o.cls)}><o.icon className="size-3" aria-hidden />{o.l}</span>
                                <span className="text-(length:--fs-13) font-medium">{d.title}</span>
                              </span>
                              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-(length:--fs-12) tabular-nums">
                                {d.before && <span className={cn('text-muted-foreground', d.after && 'line-through decoration-muted-foreground/60')}>{d.before}</span>}
                                {d.before && d.after && <FiArrowRight className="size-3 text-muted-foreground" aria-label="γίνεται" />}
                                {d.after && <span className="font-medium text-foreground">{d.after}</span>}
                              </span>
                              {ch.reason && <span className="mt-1 block text-(length:--fs-12) text-muted-foreground">{ch.reason}</span>}
                              {req && <span className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-(length:--fs-11) text-violet-800"><FiCornerDownRight className="size-3 shrink-0" aria-hidden /><span className="truncate">«{req.body}»</span></span>}
                              {ch.op === 'update' && ch.unitPrice != null && <span className="mt-1 flex items-center gap-1 text-(length:--fs-11) font-medium text-amber-800"><FiAlertTriangle className="size-3" aria-hidden />Αλλάζει την τιμή μονάδας — δεν επιλέχθηκε αυτόματα</span>}
                              {ch.op === 'add' && <span className="mt-1 flex items-center gap-1 text-(length:--fs-11) text-amber-800"><FiAlertTriangle className="size-3" aria-hidden />Χωρίς είδος μητρώου — ελέγξτε είδος και τιμή</span>}
                            </span>
                            <span className={cn('whitespace-nowrap pt-0.5 text-right text-(length:--fs-13) font-semibold tabular-nums', d.delta > 0 ? 'text-emerald-800' : d.delta < 0 ? 'text-rose-800' : 'text-muted-foreground', !on && 'opacity-60')}>{signed(d.delta)}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {rev.customerText && text && (
                <section aria-labelledby="ai-tx" className={cn('rounded-lg border p-3 transition-colors', text.on ? 'border-violet-300 bg-violet-50/30' : 'border-border bg-muted/30')}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 id="ai-tx" className="flex items-center gap-1.5 text-(length:--fs-13) font-semibold"><FiFileText className="size-4 text-violet-700" aria-hidden />Κείμενο για τον πελάτη — δεν συμφωνεί με τις γραμμές</h3>
                    <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 text-(length:--fs-12) font-medium">
                      <input type="checkbox" checked={text.on} onChange={(e) => setText({ ...text, on: e.target.checked })} className="size-4" />Αντικατάσταση με το διορθωμένο
                    </label>
                  </div>
                  {rev.customerText.reason && (
                    <p className="mt-1.5 flex gap-1.5 text-(length:--fs-12) text-amber-900"><FiAlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /><span>{rev.customerText.reason}</span></p>
                  )}
                  {diff && (diff.removed.length > 0 || diff.added.length > 0) && (
                    <div className={cn('mt-2.5 space-y-1.5', !text.on && 'opacity-60')}>
                      <p className="text-(length:--fs-11) font-semibold uppercase tracking-wide text-muted-foreground">Τι αλλάζει</p>
                      <ul className="space-y-1 text-(length:--fs-12)">
                        {diff.removed.map((x, i) => <li key={`r${i}`} className="flex gap-1.5 rounded bg-rose-50 px-2 py-1 text-rose-950"><FiMinusCircle className="mt-0.5 size-3 shrink-0" aria-label="Αφαιρείται" /><span className="line-through decoration-rose-400">{x}</span></li>)}
                        {diff.added.map((x, i) => <li key={`a${i}`} className="flex gap-1.5 rounded bg-emerald-50 px-2 py-1 text-emerald-950"><FiPlusCircle className="mt-0.5 size-3 shrink-0" aria-label="Προστίθεται" /><span>{x}</span></li>)}
                      </ul>
                    </div>
                  )}
                  <details className="mt-2.5 group">
                    <summary className="min-h-8 cursor-pointer text-(length:--fs-12) font-medium text-primary hover:underline">Ολόκληρο το διορθωμένο κείμενο (επεξεργασία)</summary>
                    <label htmlFor="ai-tx-v" className="sr-only">Διορθωμένο κείμενο για τον πελάτη</label>
                    <textarea id="ai-tx-v" value={text.value} rows={10} maxLength={20_000} disabled={!text.on} onChange={(e) => setText({ ...text, value: e.target.value })}
                      className="mt-1.5 w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-(length:--fs-13) leading-relaxed outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
                  </details>
                </section>
              )}

              {Object.keys(replies).length > 0 && (
                <section aria-labelledby="ai-rp">
                  <h3 id="ai-rp" className="text-(length:--fs-13) font-semibold">Απαντήσεις στον πελάτη</h3>
                  <p className="text-(length:--fs-12) text-muted-foreground">Τις βλέπει στο portal και μένουν στο ιστορικό. Διορθώστε ελεύθερα πριν τις στείλετε.</p>
                  <ul className="mt-2 space-y-3">
                    {Object.entries(replies).map(([rid, r]) => {
                      const q = requests.find((n) => n.id === rid);
                      return (
                        <li key={rid} className="rounded-lg border border-border p-3">
                          {q && <p className="border-l-2 border-amber-300 pl-2 text-(length:--fs-12) text-muted-foreground"><span className="font-medium text-foreground">Πελάτης:</span> {q.body}</p>}
                          <label htmlFor={`rp-${rid}`} className="sr-only">Απάντηση</label>
                          <textarea id={`rp-${rid}`} value={r.text} rows={3} maxLength={3000} onChange={(e) => setReplies((x) => ({ ...x, [rid]: { ...r, text: e.target.value } }))}
                            className="mt-2 w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-(length:--fs-13) outline-hidden focus-visible:ring-2 focus-visible:ring-ring" />
                          <div className="mt-1 flex flex-wrap gap-x-4">
                            <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 text-(length:--fs-12)"><input type="checkbox" checked={r.send} onChange={(e) => setReplies((x) => ({ ...x, [rid]: { ...r, send: e.target.checked } }))} className="size-3.5" />Αποστολή</label>
                            <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 text-(length:--fs-12)"><input type="checkbox" checked={r.resolve} disabled={!r.send} onChange={(e) => setReplies((x) => ({ ...x, [rid]: { ...r, resolve: e.target.checked } }))} className="size-3.5" />Ολοκλήρωση αιτήματος</label>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
              {rev.dropped > 0 && <p className="text-(length:--fs-11) text-muted-foreground">{rev.dropped} πρόταση(εις) του AI αγνοήθηκαν γιατί αναφέρονταν σε γραμμές που δεν υπάρχουν.</p>}
            </div>
          )}
        </div>

        <DialogFooter className="m-0 flex-col gap-3 border-t border-border bg-muted/30 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          {rev ? (
            <>
              <dl className="flex flex-wrap gap-x-5 gap-y-1 text-(length:--fs-12) tabular-nums" aria-live="polite">
                <div><dt className="inline text-muted-foreground">Σύνολο τώρα </dt><dd className="inline font-medium">{eur(net0 * vat)}</dd></div>
                <div><dt className="inline text-muted-foreground">Μετά </dt><dd className="inline font-semibold">{eur((net0 + delta) * vat)}</dd></div>
                <div><dt className="sr-only">Διαφορά</dt><dd className={cn('inline font-semibold', delta > 0 ? 'text-emerald-800' : delta < 0 ? 'text-rose-800' : 'text-muted-foreground')}>{signed(delta * vat)} με ΦΠΑ</dd></div>
              </dl>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => void ask()} disabled={applying} className="gap-1.5"><FiRefreshCw className="size-3.5" aria-hidden />Νέα πρόταση</Button>
                <Button type="button" size="sm" onClick={() => void apply()} disabled={applying || (onChanges.size === 0 && sendCount === 0 && !textOn)} className="gap-1.5">
                  {applying ? <FiRefreshCw className="size-3.5 animate-spin" aria-hidden /> : <FiCheck className="size-3.5" aria-hidden />}
                  Εφαρμογή · {onChanges.size} αλλαγ{onChanges.size === 1 ? 'ή' : 'ές'}{textOn ? ' · κείμενο' : ''}{sendCount ? ` · ${sendCount === 1 ? '1 απάντηση' : `${sendCount} απαντήσεις`}` : ''}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-(length:--fs-11) text-muted-foreground">Το AI βλέπει τις τρέχουσες γραμμές της φόρμας, και τις μη αποθηκευμένες.</p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>Άκυρο</Button>
                <Button type="button" size="sm" onClick={() => void ask()} disabled={loading || picked.size === 0} className="gap-1.5 bg-violet-700 text-white hover:bg-violet-800">
                  <FiZap className="size-3.5" aria-hidden />{loading ? 'Σκέφτεται…' : 'Πρόταση με AI'}
                </Button>
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
