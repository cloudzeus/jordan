'use client';

// Αιτήματα προσφοράς προς συνεργεία για μια προσφορά/σύμβαση: νέο αίτημα (specs PDF χωρίς τις τιμές
// μας + μοναδικός σύνδεσμος ανά συνεργείο), σύγκριση απαντήσεων, ανάθεση, ημερολόγιο συνεδρίας (απόδειξη).
import * as React from 'react';
import { toast } from 'sonner';
import {
  FiAward, FiCheck, FiClipboard, FiCopy, FiDownload, FiFileText, FiList, FiLoader, FiMail, FiMoreVertical, FiPlus, FiRefreshCw,
  FiSearch, FiShield, FiUsers, FiX, FiXCircle,
} from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { EVENT_LABEL, RECIPIENT_STATUS, RFP_STATUS_LABEL } from '@/lib/rfp/core';
import type { ContractRfpView } from '@/lib/rfp/service';
import { awardRfpAction, createRfpAction, renewRfpLinkAction, rfpEventsAction, setRfpStatusAction } from '../actions';
import type { ActionResult } from '@/lib/action-result';

const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
const day = (s: string | null) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—');
const when = (s: string | null) => (s ? new Date(s).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';
const SEND_LABEL: Record<string, string> = { sent: 'email στάλθηκε', skipped: 'email δεν στάλθηκε (πριν το go-live / δοκιμή)', failed: 'email απέτυχε', 'no-email': 'χωρίς email' };

type Crew = { kind: 'SUPPLIER' | 'PARTNER'; ref: string; name: string; sub: string | null; email: string | null; phone: string | null; crew: boolean };
type Created = { ref: string; recipients: { name: string; email: string | null; url: string; email_result: string | null }[] };

export function RfpPanel({ contractId, title, summary, rfps, canManage }: {
  contractId: string; title: string; summary: string; rfps: ContractRfpView[]; canManage: boolean;
}) {
  const [creating, setCreating] = React.useState(false);
  const [created, setCreated] = React.useState<Created | null>(null);
  const [log, setLog] = React.useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Server Actions: η σελίδα ξαναφορτώνεται από τον server (revalidatePath) — χωρίς router.refresh.
  const call = async <T,>(fn: () => Promise<ActionResult<T>>, ok: string): Promise<T | null> => {
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) { toast.error(r.message); return null; }
      toast.success(ok);
      return r.data;
    } finally { setBusy(false); }
  };
  const award = async (rfp: ContractRfpView, x: ContractRfpView['recipients'][number]) => {
    if (!(await confirmAction(`Ανάθεση στο «${x.name}» με ${eur(x.amount ?? 0)} χωρίς ΦΠΑ;\nΜπαίνει ως συνεργείο της σύμβασης με αμοιβή αυτό το ποσό, μοιρασμένο στις εργασίες χωρίς συνεργείο. Οι υπόλοιποι ενημερώνονται ότι δεν επιλέχθηκαν.`))) return;
    await call(() => awardRfpAction(rfp.id, x.id), 'Ανατέθηκε — το συνεργείο μπήκε στη σύμβαση');
  };
  const renew = async (x: ContractRfpView['recipients'][number], sendEmail: boolean) => {
    if (!(await confirmAction(`Νέος σύνδεσμος για «${x.name}»;\nΟ προηγούμενος σύνδεσμος παύει να ισχύει.${sendEmail ? ' Θα σταλεί email με τον νέο.' : ''}`))) return;
    const d = await call(() => renewRfpLinkAction(x.id, sendEmail), 'Νέος σύνδεσμος');
    if (d?.url) {
      await navigator.clipboard.writeText(d.url).then(() => toast.message('Ο σύνδεσμος αντιγράφηκε στο πρόχειρο'), () => null);
      if (d.email_result) toast.message(SEND_LABEL[d.email_result] ?? d.email_result);
    }
  };
  const status = (rfp: ContractRfpView, s: 'CLOSED' | 'CANCELLED' | 'OPEN') => call(() => setRfpStatusAction(rfp.id, s), 'Ενημερώθηκε');

  return (
    <section id="rfp" className="rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md" style={{ background: '#EEF2FF', color: '#4338CA' }}><FiUsers className="size-4" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-(length:--fs-14) font-semibold">Αιτήματα προσφοράς συνεργείων</h2>
          <p className="text-(length:--fs-12) text-muted-foreground">Specs χωρίς τις τιμές μας, μοναδικός σύνδεσμος ανά συνεργείο, σύγκριση και ανάθεση — με ημερολόγιο συνεδρίας ως απόδειξη</p>
        </div>
        {canManage && <Button size="sm" onClick={() => setCreating(true)}><FiPlus aria-hidden /> Νέο αίτημα…</Button>}
      </header>

      {rfps.length === 0 ? (
        <p className="border-t border-border px-4 py-5 text-center text-(length:--fs-12) text-muted-foreground">Κανένα αίτημα ακόμη. Ζήτησε τιμή από τεχνικές εταιρίες, συνεργεία και μαστόρους για τις εργασίες της προσφοράς.</p>
      ) : (
        <div className="divide-y divide-border border-t border-border">
          {rfps.map((rfp) => {
            const bids = rfp.recipients.filter((x) => x.amount != null && (x.status === 'SUBMITTED' || x.status === 'AWARDED' || x.status === 'NOT_AWARDED'));
            const best = bids.length ? Math.min(...bids.map((x) => x.amount!)) : null;
            return (
              <div key={rfp.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-(length:--fs-12) font-semibold">{rfp.ref}</span>
                  <span className="min-w-0 flex-1 truncate text-(length:--fs-13) font-medium">{rfp.title}</span>
                  <span className="rounded px-1.5 py-0.5 text-(length:--fs-11) font-medium" style={rfp.status === 'OPEN' ? { background: '#EFF6FF', color: '#1D4ED8' } : rfp.status === 'AWARDED' ? { background: '#ECFDF5', color: '#047857' } : { background: '#F1F5F9', color: '#475569' }}>
                    {RFP_STATUS_LABEL[rfp.status] ?? rfp.status}
                  </span>
                  <span className="text-(length:--fs-12) text-muted-foreground">προθεσμία {day(rfp.dueDate)} · {bids.length}/{rfp.recipients.length} απαντήσεις</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Ενέργειες ${rfp.ref}`}>
                      <FiMoreVertical className="size-4" aria-hidden />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {rfp.specsFileId && <DropdownMenuItem className={ITEM} onSelect={() => window.open(`/api/admin/rfps/${rfp.id}/specs`, '_blank')}><FiFileText className="size-3.5" />Specs (PDF)</DropdownMenuItem>}
                      {canManage && rfp.status === 'OPEN' && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className={ITEM} onSelect={() => void status(rfp, 'CLOSED')}><FiCheck className="size-3.5" />Κλείσιμο (όχι άλλες προσφορές)</DropdownMenuItem>
                          <DropdownMenuItem className={ITEM} variant="destructive" onSelect={() => void status(rfp, 'CANCELLED')}><FiXCircle className="size-3.5" />Ακύρωση αιτήματος</DropdownMenuItem>
                        </>
                      )}
                      {canManage && (rfp.status === 'CLOSED' || rfp.status === 'CANCELLED') && (
                        <DropdownMenuItem className={ITEM} onSelect={() => void status(rfp, 'OPEN')}><FiRefreshCw className="size-3.5" />Άνοιγμα ξανά</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-(length:--fs-12)">
                    <thead className="text-left text-(length:--fs-11) text-muted-foreground">
                      <tr><th className="py-1 pr-2 font-medium">Συνεργείο</th><th className="py-1 pr-2 font-medium">Κατάσταση</th><th className="py-1 pr-2 text-right font-medium">Ποσό (χ. ΦΠΑ)</th><th className="py-1 pr-2 font-medium">Έναρξη · διάρκεια</th><th className="py-1 pr-2 font-medium">Τελευταία κίνηση</th><th className="w-8" /></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rfp.recipients.map((x) => {
                        const st = RECIPIENT_STATUS[x.status] ?? RECIPIENT_STATUS.INVITED;
                        const lastSend = x.sends[x.sends.length - 1];
                        return (
                          <tr key={x.id} className="align-top">
                            <td className="py-1.5 pr-2">
                              <span className="block font-medium">{x.name}</span>
                              <span className="block text-(length:--fs-11) text-muted-foreground">{x.kind === 'SUPPLIER' ? 'Προμηθευτής' : 'Συνεργάτης'}{x.email ? ` · ${x.email}` : ' · χωρίς email'}{lastSend ? ` · ${SEND_LABEL[lastSend.result] ?? lastSend.result}` : ''}</span>
                              {x.notes && <span className="mt-0.5 block whitespace-pre-line text-(length:--fs-11) text-muted-foreground">«{x.notes}»</span>}
                            </td>
                            <td className="py-1.5 pr-2"><span className="rounded px-1.5 py-0.5 text-(length:--fs-11) font-medium" style={{ color: st.color, background: st.bg }}>{st.label}</span></td>
                            <td className="whitespace-nowrap py-1.5 pr-2 text-right font-mono tabular-nums">
                              {x.amount != null ? <span className={x.amount === best ? 'font-semibold text-emerald-700' : undefined}>{eur(x.amount)}{x.amount === best && bids.length > 1 ? ' ★' : ''}</span> : '—'}
                            </td>
                            <td className="whitespace-nowrap py-1.5 pr-2">{x.startDate || x.durationDays ? `${day(x.startDate)} · ${x.durationDays ? `${x.durationDays} ημ.` : '—'}` : '—'}</td>
                            <td className="whitespace-nowrap py-1.5 pr-2 text-muted-foreground">{when(x.submittedAt ?? x.declinedAt ?? x.viewedAt)}</td>
                            <td className="py-1.5">
                              <DropdownMenu>
                                <DropdownMenuTrigger className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40" aria-label={`Ενέργειες για ${x.name}`} disabled={busy}>
                                  <FiMoreVertical className="size-4" aria-hidden />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-60">
                                  <DropdownMenuLabel className="truncate text-(length:--fs-11) font-normal text-muted-foreground">{x.name}</DropdownMenuLabel>
                                  {canManage && rfp.status === 'OPEN' && x.status === 'SUBMITTED' && (
                                    <DropdownMenuItem className={ITEM} onSelect={() => void award(rfp, x)}><FiAward className="size-3.5" style={{ color: '#047857' }} />Ανάθεση σε αυτό το συνεργείο</DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem className={ITEM} onSelect={() => setLog({ id: x.id, name: x.name })}><FiList className="size-3.5" />Ημερολόγιο συνεδρίας ({x.events})</DropdownMenuItem>
                                  <DropdownMenuItem className={ITEM} onSelect={() => window.open(`/api/admin/rfps/recipients/${x.id}/events?format=csv`, '_blank')}><FiDownload className="size-3.5" />Λήψη ημερολογίου (CSV)</DropdownMenuItem>
                                  {canManage && rfp.status === 'OPEN' && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem className={ITEM} onSelect={() => void renew(x, false)}><FiCopy className="size-3.5" />Νέος σύνδεσμος (αντιγραφή)</DropdownMenuItem>
                                      {x.email && <DropdownMenuItem className={ITEM} onSelect={() => void renew(x, true)}><FiMail className="size-3.5" />Νέος σύνδεσμος + email</DropdownMenuItem>}
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canManage && (
        <NewRfpDialog
          open={creating} onOpenChange={setCreating} contractId={contractId} title={title} summary={summary}
          onCreated={(c) => { setCreating(false); setCreated(c); }}
        />
      )}
      <CreatedDialog created={created} onClose={() => setCreated(null)} />
      <EventsDialog target={log} onClose={() => setLog(null)} />
    </section>
  );
}

function NewRfpDialog({ open, onOpenChange, contractId, title, summary, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; contractId: string; title: string; summary: string; onCreated: (c: Created) => void;
}) {
  const plus7 = () => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); };
  const [t, setT] = React.useState(title);
  const [scope, setScope] = React.useState(summary);
  const [due, setDue] = React.useState(plus7());
  const [message, setMessage] = React.useState('');
  const [sendEmail, setSendEmail] = React.useState(true);
  const [q, setQ] = React.useState('');
  const [opts, setOpts] = React.useState<Crew[]>([]);
  const [picked, setPicked] = React.useState<Crew[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [prevOpen, setPrevOpen] = React.useState(false);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) { setT(title); setScope(summary); setDue(plus7()); setMessage(''); setPicked([]); setQ(''); setSendEmail(true); }
  }
  React.useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const h = setTimeout(() => {
      fetch(`/api/admin/contracts/options?kind=crew&q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal })
        .then((r) => r.json()).then((d) => setOpts(d.options ?? [])).catch(() => null);
    }, 200);
    return () => { clearTimeout(h); ctl.abort(); };
  }, [open, q]);
  const key = (c: Crew) => `${c.kind}:${c.ref}`;
  const has = (c: Crew) => picked.some((p) => key(p) === key(c));
  const toggle = (c: Crew) => setPicked((ps) => (has(c) ? ps.filter((p) => key(p) !== key(c)) : [...ps, c]));

  const submit = async () => {
    if (!picked.length) { toast.error('Διάλεξε τουλάχιστον ένα συνεργείο'); return; }
    setBusy(true);
    try {
      const r = await createRfpAction(contractId, { title: t, scope, dueDate: due || null, message: message || null, sendEmail, recipients: picked.map((p) => ({ kind: p.kind, ref: p.ref })) });
      if (!r.ok) { toast.error(r.message); return; }
      onCreated(r.data);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="flex max-h-[94dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 pb-3 pt-4">
          <DialogTitle className="text-(length:--fs-16)">Νέο αίτημα προσφοράς</DialogTitle>
          <DialogDescription className="text-(length:--fs-12)">Τα συνεργεία παίρνουν email με τα specs σε PDF (εργασίες, ποσότητες, κάτοψη — χωρίς τις τιμές μας και χωρίς στοιχεία πελάτη) και προσωπικό σύνδεσμο για να δώσουν τιμή. Το βλέπουν και στο portal τους.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 overflow-y-auto">
          <div>
            <Label htmlFor="rfp-title" className="mb-1 block text-(length:--fs-12)">Τίτλος *</Label>
            <Input id="rfp-title" value={t} onChange={(e) => setT(e.target.value)} maxLength={200} />
          </div>
          <div>
            <Label htmlFor="rfp-scope" className="mb-1 block text-(length:--fs-12)">Τι ζητάμε (εμφανίζεται στο PDF, στο email και στη σελίδα)</Label>
            <textarea id="rfp-scope" value={scope} onChange={(e) => setScope(e.target.value)} rows={5} maxLength={10000} className="w-full rounded-md border border-input bg-background px-3 py-2 text-(length:--fs-13) outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="rfp-due" className="mb-1 block text-(length:--fs-12)">Προθεσμία απάντησης</Label>
              <Input id="rfp-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="rfp-msg" className="mb-1 block text-(length:--fs-12)">Μήνυμα στο email (προαιρετικά)</Label>
              <Input id="rfp-msg" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} placeholder="π.χ. Αυτοψία κατόπιν ραντεβού" />
            </div>
          </div>
          <div>
            <p className="mb-1 text-(length:--fs-12) font-medium">Συνεργεία * <span className="font-normal text-muted-foreground">({picked.length} επιλεγμένα)</span></p>
            {picked.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {picked.map((p) => (
                  <span key={key(p)} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pl-2.5 pr-1 text-(length:--fs-12)">
                    {p.name}{!p.email && <span className="text-(length:--fs-11) text-amber-700"> · χωρίς email</span>}
                    <button type="button" onClick={() => toggle(p)} className="inline-flex size-5 cursor-pointer items-center justify-center rounded-full hover:bg-muted" aria-label={`Αφαίρεση ${p.name}`}><FiX className="size-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση συνεργείου, τεχνικής εταιρίας, μάστορα…" className="pl-8" />
            </div>
            <ul className="mt-1.5 max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {opts.length === 0 && <li className="px-3 py-3 text-center text-(length:--fs-12) text-muted-foreground">Κανένα αποτέλεσμα</li>}
              {opts.map((o) => (
                <li key={key(o)}>
                  <button type="button" onClick={() => toggle(o)} className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left hover:bg-muted/50">
                    <span className="inline-flex size-4 shrink-0 items-center justify-center rounded border" style={has(o) ? { background: 'var(--primary)', borderColor: 'var(--primary)', color: '#fff' } : undefined}>{has(o) && <FiCheck className="size-3" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-(length:--fs-13) font-medium">{o.name}</span>
                      <span className="block truncate text-(length:--fs-11) text-muted-foreground">{[o.kind === 'SUPPLIER' ? 'Προμηθευτής' : 'Συνεργάτης', o.sub, o.email ?? 'χωρίς email'].filter(Boolean).join(' · ')}</span>
                    </span>
                    {!o.crew && <span className="text-(length:--fs-11) text-muted-foreground">άλλος προμηθευτής</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-(length:--fs-12)">
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="mt-0.5 size-4 cursor-pointer accent-[var(--primary)]" />
            <span>Αποστολή email με το PDF και τον σύνδεσμο. Σε κάθε περίπτωση οι σύνδεσμοι εμφανίζονται μετά τη δημιουργία, για αντιγραφή (π.χ. σε Viber/SMS).</span>
          </label>
        </DialogBody>
        <DialogFooter className="m-0 border-t border-border px-5 py-3">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
          <Button type="button" onClick={() => void submit()} disabled={busy || !picked.length || !t.trim()}>
            {busy ? <FiLoader className="animate-spin" aria-hidden /> : <FiMail aria-hidden />} Δημιουργία & αποστολή ({picked.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreatedDialog({ created, onClose }: { created: Created | null; onClose: () => void }) {
  return (
    <Dialog open={!!created} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-(length:--fs-16)">Το αίτημα {created?.ref} δημιουργήθηκε</DialogTitle>
          <DialogDescription className="text-(length:--fs-12)">Οι σύνδεσμοι είναι προσωπικοί και εμφανίζονται <b>μόνο τώρα</b> — αντίγραψέ τους αν θέλεις να τους στείλεις αλλιώς. Αργότερα μπορείς να βγάλεις νέο σύνδεσμο από το μενού ⋮ του συνεργείου.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-border rounded-md border border-border">
          {created?.recipients.map((r) => (
            <li key={r.url} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-(length:--fs-13) font-medium">{r.name}</span>
                <span className="block truncate text-(length:--fs-11) text-muted-foreground">{r.email_result ? SEND_LABEL[r.email_result] ?? r.email_result : 'χωρίς email'}{r.email ? ` · ${r.email}` : ''}</span>
              </span>
              <Button size="xs" variant="outline" onClick={() => navigator.clipboard.writeText(r.url).then(() => toast.success('Αντιγράφηκε'), () => toast.error('Δεν επετράπη η αντιγραφή'))}>
                <FiClipboard aria-hidden /> Σύνδεσμος
              </Button>
            </li>
          ))}
        </ul>
        <DialogFooter><Button onClick={onClose}>Εντάξει</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Ev = { id: string; type: string; at: string; actor: string; ip: string | null; userAgent: string | null; sessionId: string | null; data: Record<string, unknown>; hash: string };

function EventsDialog({ target, onClose }: { target: { id: string; name: string } | null; onClose: () => void }) {
  const [data, setData] = React.useState<{ events: Ev[]; chain: { ok: boolean; brokenAt: number | null } } | null>(null);
  // Άλλος παραλήπτης → καθαρά δεδομένα (adjust-state-while-rendering)· η φόρτωση στο effect.
  const [prevTarget, setPrevTarget] = React.useState(target);
  if (prevTarget !== target) { setPrevTarget(target); setData(null); }
  React.useEffect(() => {
    if (!target) return;
    let ignore = false;
    rfpEventsAction(target.id).then((r) => { if (!ignore && r.ok) setData(r.data); }).catch(() => null);
    return () => { ignore = true; };
  }, [target]);
  const detail = (e: Ev) => {
    const d = e.data ?? {};
    if (e.type === 'SUBMIT') return `${typeof d.amount === 'number' ? eur(d.amount) : ''}${d.durationDays ? ` · ${d.durationDays} ημ.` : ''}${d.startDate ? ` · έναρξη ${day(String(d.startDate))}` : ''} · όροι ✓`;
    if (e.type === 'EMAIL_SENT') return `${String(d.to ?? '')} · ${SEND_LABEL[String(d.result)] ?? String(d.result ?? '')}`;
    if (e.type === 'DECLINE') return d.reason ? `«${String(d.reason)}»` : '';
    return '';
  };
  const actor: Record<string, string> = { link: 'Σύνδεσμος', portal: 'Portal', staff: 'Προσωπικό', system: 'Σύστημα' };
  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-5 pb-3 pt-4">
          <DialogTitle className="text-(length:--fs-16)">Ημερολόγιο συνεδρίας — {target?.name}</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-(length:--fs-12)">
            <FiShield className="size-3.5" aria-hidden />
            {!data ? 'Φόρτωση…' : data.chain.ok
              ? <span className="font-medium text-emerald-700">Αλυσίδα hash ακέραιη — καμία εγγραφή δεν έχει αλλοιωθεί</span>
              : <span className="font-medium text-red-700">Η αλυσίδα σπάει στο γεγονός {(data.chain.brokenAt ?? 0) + 1}</span>}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-auto">
          <table className="w-full min-w-[720px] text-(length:--fs-12)">
            <thead className="sticky top-0 bg-muted/60 text-left text-(length:--fs-11) text-muted-foreground">
              <tr><th className="px-3 py-1.5 font-medium">Ώρα</th><th className="px-3 py-1.5 font-medium">Γεγονός</th><th className="px-3 py-1.5 font-medium">Από</th><th className="px-3 py-1.5 font-medium">IP · συσκευή</th><th className="px-3 py-1.5 font-medium">Session</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.events.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono tabular-nums">{new Date(e.at).toLocaleString('el-GR')}</td>
                  <td className="px-3 py-1.5"><span className="font-medium">{EVENT_LABEL[e.type] ?? e.type}</span>{detail(e) && <span className="block text-muted-foreground">{detail(e)}</span>}</td>
                  <td className="px-3 py-1.5">{actor[e.actor] ?? e.actor}</td>
                  <td className="max-w-[260px] px-3 py-1.5"><span className="font-mono">{e.ip ?? '—'}</span><span className="block truncate text-muted-foreground" title={e.userAgent ?? undefined}>{e.userAgent ?? ''}</span></td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground" title={`hash ${e.hash}`}>{e.sessionId ? `${e.sessionId.slice(0, 8)}…` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter className="m-0 border-t border-border px-5 py-3">
          {target && <Button variant="outline" onClick={() => window.open(`/api/admin/rfps/recipients/${target.id}/events?format=csv`, '_blank')}><FiDownload aria-hidden /> Λήψη (CSV)</Button>}
          <Button onClick={onClose}>Κλείσιμο</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
