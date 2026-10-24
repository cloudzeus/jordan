'use client';

import * as React from 'react';
import { toast } from 'sonner';
import {
  FiAlertCircle, FiCamera, FiCheck, FiCheckCircle, FiCircle, FiDollarSign, FiLoader, FiMoreVertical, FiRotateCcw, FiX,
} from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { MILESTONE_STATUS_LABEL, dayEl, eur, round2 } from '@/lib/contracts/core';
import type { ContractView } from '@/lib/contracts/service';
import { deliverMilestoneAction, setMilestoneAction } from '../actions';

type Ms = ContractView['milestones'][number];
const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';
const STATUS = {
  PENDING: { icon: FiCircle, cls: 'bg-muted text-muted-foreground' },
  DONE: { icon: FiCheck, cls: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200' },
  PAID: { icon: FiCheckCircle, cls: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200' },
} as const;
const MAX_PHOTOS = 12;
const fileUrl = (id: string) => `/api/admin/entity-files/file/${id}`;

/** «Εκπρόθεσμη» μόνο για εκκρεμή με παρελθοντική προθεσμία. */
const overdue = (m: Ms, today: string) => m.status !== 'PAID' && !!m.dueDate && m.dueDate < today;

/** Καταγραφή παράδοσης: τι παραδόθηκε (υποχρεωτικό) + φωτογραφίες ως απόδειξη (κάμερα στο κινητό). */
function DeliverDialog({ contractId, m, onClose }: { contractId: string; m: Ms | null; onClose: () => void }) {
  const [note, setNote] = React.useState('');
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const noteRef = React.useRef<HTMLTextAreaElement | null>(null);
  // Νέο milestone ⇒ καθαρή φόρμα με την προηγούμενη περιγραφή (adjust-state-while-rendering).
  const [prevId, setPrevId] = React.useState<string | null>(null);
  if ((m?.id ?? null) !== prevId) {
    setPrevId(m?.id ?? null);
    setNote(m?.deliveryNote ?? ''); setFiles([]); setError(null);
  }
  const previews = React.useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  React.useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const left = MAX_PHOTOS - (m?.proofFileIds.length ?? 0) - files.length;

  const add = (list: FileList | null) => {
    if (!list) return;
    const imgs = [...list].filter((f) => f.type.startsWith('image/'));
    if (imgs.length < list.length) toast.error('Μόνο φωτογραφίες (JPG, PNG, WebP, HEIC).');
    setFiles((cur) => [...cur, ...imgs].slice(0, MAX_PHOTOS - (m?.proofFileIds.length ?? 0)));
  };
  const submit = async () => {
    if (!m) return;
    if (!note.trim()) { setError('Γράψτε τι παραδόθηκε.'); noteRef.current?.focus(); return; }
    setBusy(true); setError(null);
    const fd = new FormData();
    fd.set('note', note.trim());
    for (const f of files) fd.append('photos', f);
    const r = await deliverMilestoneAction(contractId, m.id, fd);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    toast.success(r.data.files ? `Η παράδοση καταγράφηκε με ${r.data.files} φωτογραφ${r.data.files === 1 ? 'ία' : 'ίες'}` : 'Η παράδοση καταγράφηκε');
    onClose();
  };

  return (
    <Dialog open={!!m} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Παράδοση: {m?.title}</DialogTitle>
          <DialogDescription>{m?.deliverables ? `Συμφωνημένα παραδοτέα: ${m.deliverables}` : 'Περιγράψτε τι παραδόθηκε και ανεβάστε φωτογραφίες ως απόδειξη.'}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div>
            <label htmlFor="dl-note" className="mb-1 block text-(length:--fs-12) font-medium">Τι παραδόθηκε <span className="text-destructive" aria-hidden>*</span></label>
            <textarea id="dl-note" ref={noteRef} value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={4000} required aria-invalid={!!error && !note.trim()}
              placeholder="π.χ. Ολοκληρώθηκε η τοποθέτηση στο καθιστικό και στην τραπεζαρία, αρμολόγηση και καθαρισμός. Ο πελάτης έλεγξε την επιφάνεια."
              className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-(length:--fs-13) leading-relaxed outline-hidden focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div>
            <p className="mb-1 text-(length:--fs-12) font-medium">Φωτογραφίες απόδειξης <span className="font-normal text-muted-foreground">(έως {MAX_PHOTOS})</span></p>
            <div className="flex flex-wrap gap-2">
              {previews.map((u, i) => (
                <span key={u} className="relative">
                  <img src={u} alt={`Νέα φωτογραφία: ${files[i]?.name ?? ''}`} className="size-20 rounded-md object-cover ring-1 ring-border" />
                  <button type="button" onClick={() => setFiles((f) => f.filter((_, j) => j !== i))} aria-label={`Αφαίρεση ${files[i]?.name}`}
                    className="absolute -right-1.5 -top-1.5 inline-flex size-6 cursor-pointer items-center justify-center rounded-full bg-background text-muted-foreground shadow-xs ring-1 ring-border hover:text-destructive">
                    <FiX className="size-3.5" aria-hidden />
                  </button>
                </span>
              ))}
              {left > 0 && (
                <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-(length:--fs-11) text-muted-foreground hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring">
                  <FiCamera className="size-5" aria-hidden />
                  Προσθήκη
                  <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = ''; }} aria-label="Φωτογραφίες απόδειξης" />
                </label>
              )}
            </div>
            {(m?.proofFileIds.length ?? 0) > 0 && <p className="mt-1.5 text-(length:--fs-11) text-muted-foreground">Υπάρχουν ήδη {m!.proofFileIds.length} φωτογραφίες — οι νέες προστίθενται.</p>}
          </div>
          {error && <p role="alert" className="flex items-start gap-1.5 text-(length:--fs-12) text-destructive"><FiAlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Άκυρο</Button>
          <Button onClick={() => void submit()} disabled={busy} className="gap-1.5">
            {busy ? <FiLoader className="size-4 animate-spin" aria-hidden /> : <FiCheck className="size-4" aria-hidden />}
            {busy ? (files.length ? 'Ανέβασμα…' : 'Αποθήκευση…') : 'Καταγραφή παράδοσης'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Πρόοδος πληρωμών σύμβασης: πόσα εισπράχθηκαν / πληρώθηκαν, και ανά πληρωμή η κατάσταση με την
 * απόδειξη παράδοσης (περιγραφή + φωτογραφίες) και ενέργειες στο ⋮ (ενημερώνει και την εργασία του έργου).
 */
export function MilestonesProgress({ contract: c, canManage }: { contract: ContractView; canManage: boolean }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [delivering, setDelivering] = React.useState<Ms | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const set = async (mid: string, status: 'PENDING' | 'DONE' | 'PAID') => {
    setBusy(mid);
    const r = await setMilestoneAction(c.id, mid, status);
    setBusy(null);
    if (!r.ok) toast.error(r.message);
  };
  const groups = [
    { key: 'customer', label: 'Εισπράξεις από τον πελάτη', ms: c.milestones.filter((m) => !m.partyKey) },
    ...c.parties.map((p) => ({ key: p.key, label: `Πληρωμές προς ${p.name}`, ms: c.milestones.filter((m) => m.partyKey === p.key) })),
  ].filter((g) => g.ms.length);
  if (!groups.length) return null;

  return (
    <section aria-labelledby="ms-h" className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <h2 id="ms-h" className="text-(length:--fs-15) font-semibold">Παραδόσεις & πληρωμές</h2>
      <p className="mt-0.5 text-(length:--fs-12) text-muted-foreground">Σε κάθε παράδοση γράψτε τι παραδόθηκε και ανεβάστε φωτογραφίες — μένουν στα αρχεία, φάκελος «Παραδόσεις».</p>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        {groups.map((g) => {
          const total = round2(g.ms.reduce((a, m) => a + m.amount, 0));
          const paid = round2(g.ms.filter((m) => m.status === 'PAID').reduce((a, m) => a + m.amount, 0));
          const late = g.ms.filter((m) => overdue(m, today)).length;
          return (
            <div key={g.key} className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="truncate text-(length:--fs-13) font-semibold">{g.label}</h3>
                <span className="text-(length:--fs-12) tabular-nums text-muted-foreground"><b className="text-foreground">{eur(paid)}</b> από {eur(total)}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={total ? Math.round((paid / total) * 100) : 0} aria-label={g.label}>
                <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${total ? (paid / total) * 100 : 0}%` }} />
              </div>
              {late > 0 && (
                <p className="mt-1.5 flex items-center gap-1 text-(length:--fs-12) font-medium text-rose-800"><FiAlertCircle className="size-3.5" aria-hidden /> {late} εκπρόθεσμ{late === 1 ? 'η' : 'ες'}</p>
              )}
              <ol className="mt-2 divide-y divide-border rounded-lg border border-border">
                {g.ms.map((m) => {
                  const st = STATUS[m.status];
                  const Icon = st.icon;
                  const late1 = overdue(m, today);
                  return (
                    <li key={m.id} className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-(length:--fs-11) font-medium', st.cls)}>
                          <Icon className="size-3" aria-hidden />{MILESTONE_STATUS_LABEL[m.status]}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-(length:--fs-13) font-medium">{m.title}</span>
                          <span className={cn('block text-(length:--fs-11) tabular-nums', late1 ? 'font-medium text-rose-800' : 'text-muted-foreground')}>
                            {m.dueDate ? `${late1 ? 'Εκπρόθεσμη · ' : 'έως '}${dayEl(m.dueDate)}` : 'χωρίς προθεσμία'}
                            {m.doneAt && m.status !== 'PENDING' ? ` · παραδόθηκε ${dayEl(m.doneAt)}` : ''}
                          </span>
                        </span>
                        <span className="shrink-0 text-(length:--fs-13) font-semibold tabular-nums">{eur(m.amount)}</span>
                        {canManage && (
                          <DropdownMenu>
                            <DropdownMenuTrigger disabled={busy === m.id} className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ενέργειες για ${m.title}`}>
                              {busy === m.id ? <FiLoader className="size-4 animate-spin" aria-hidden /> : <FiMoreVertical className="size-4" aria-hidden />}
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-56">
                              <DropdownMenuItem className={ITEM} onSelect={() => setDelivering(m)}>
                                <FiCamera className="size-3.5" />{m.status === 'PENDING' ? 'Καταγραφή παράδοσης…' : 'Περιγραφή & φωτογραφίες παράδοσης…'}
                              </DropdownMenuItem>
                              {m.status !== 'PAID' && <DropdownMenuItem className={ITEM} onSelect={() => void set(m.id, 'PAID')}><FiDollarSign className="size-3.5" />Εξοφλήθηκε</DropdownMenuItem>}
                              {m.status !== 'PENDING' && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className={ITEM} onSelect={() => void set(m.id, 'PENDING')}><FiRotateCcw className="size-3.5" />Επαναφορά σε εκκρεμή</DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                      {(m.deliverables || m.deliveryNote || m.proofFileIds.length > 0) && (
                        <div className="mt-1.5 space-y-1.5 pl-1 text-(length:--fs-12)">
                          {m.deliverables && <p className="text-muted-foreground"><span className="font-medium text-foreground">Παραδοτέα:</span> {m.deliverables}</p>}
                          {m.deliveryNote && <p className="whitespace-pre-wrap rounded-md bg-sky-50/60 px-2 py-1.5"><span className="font-medium">Παραδόθηκε:</span> {m.deliveryNote}</p>}
                          {m.proofFileIds.length > 0 && (
                            <ul className="flex flex-wrap gap-1.5" aria-label="Φωτογραφίες παράδοσης">
                              {m.proofFileIds.map((fid, i) => (
                                <li key={fid}>
                                  <a href={fileUrl(fid)} target="_blank" rel="noopener noreferrer" className="block rounded-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                                    <img src={fileUrl(fid)} alt={`Φωτογραφία παράδοσης ${i + 1} — ${m.title}`} loading="lazy" className="size-16 rounded-md object-cover ring-1 ring-border" />
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
      <DeliverDialog contractId={c.id} m={delivering} onClose={() => setDelivering(null)} />
    </section>
  );
}
