'use client';

import * as React from 'react';
import { FiAlertCircle, FiCalendar, FiChevronDown, FiEye, FiFile, FiLink, FiLoader, FiPaperclip, FiSearch, FiUpload, FiX } from 'react-icons/fi';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ACCEPT_EXTENSIONS, ALLOWED_HINT } from '@/lib/entity-files/core';
import { PARTY_KINDS, PROGRESS_STEPS, durationLabel, phaseOf, phaseMeta, type PartyKindKey } from '@/lib/project-tasks-core';
import type { PartyOption, TaskView } from '@/lib/project-tasks';
import { cn } from '@/lib/utils';
import { unwrap } from '@/lib/action-result';
import { linkTaskFilesAction, projectFileChoicesAction, saveTaskAction, unlinkTaskFileAction } from '../../actions';

type Party = { kind: PartyKindKey; ref: string; label: string; sub: string | null };

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { headers: init?.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' }, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || 'Η ενέργεια απέτυχε');
  return body;
}

const fieldCls = 'space-y-1.5';
const hint = 'text-(length:--fs-11) text-muted-foreground';
const errCls = 'text-(length:--fs-11) font-medium text-destructive';
// ≥ 40px ύψος (αφή)· το Input κρατά 16px στα κινητά (χωρίς zoom στο iOS).
const inputCls = 'h-10';
const sizeLabel = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Δημιουργία / επεξεργασία εργασίας. Αρχεία: σε νέα εργασία μπαίνουν σε ουρά και ανεβαίνουν μετά την αποθήκευση. */
export function TaskDialog({
  open, onOpenChange, prjc, task, initialProgress = 0, tasks, options, canFiles, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prjc: number;
  task: TaskView | null;
  /** Νέα εργασία από το «+» μιας στήλης: ξεκινά με το ποσοστό της. */
  initialProgress?: number;
  tasks: TaskView[];
  options: PartyOption[];
  canFiles: boolean;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [duration, setDuration] = React.useState('1');
  const [unit, setUnit] = React.useState<'DAYS' | 'HOURS'>('DAYS');
  const [progress, setProgress] = React.useState(0);
  const [customerVisible, setCustomerVisible] = React.useState(false);
  const [inCalendar, setInCalendar] = React.useState(false);
  const [deps, setDeps] = React.useState<string[]>([]);
  const [depQuery, setDepQuery] = React.useState('');
  const [parties, setParties] = React.useState<Party[]>([]);
  const [queue, setQueue] = React.useState<File[]>([]);
  const [files, setFiles] = React.useState<TaskView['files']>([]);
  const [touched, setTouched] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const durRef = React.useRef<HTMLInputElement>(null);

  // Επαναφορά της φόρμας στο άνοιγμα (adjust-state-while-rendering)
  const [prevDeps, setPrevDeps] = React.useState({ open: false, task, initialProgress });
  if (prevDeps.open !== open || prevDeps.task !== task || prevDeps.initialProgress !== initialProgress) {
    setPrevDeps({ open, task, initialProgress });
    if (open) {
      setName(task?.name ?? ''); setDescription(task?.description ?? ''); setStartDate(task?.startDate ?? '');
      setDuration(String(task?.durationValue ?? 1).replace('.', ',')); setUnit(task?.durationUnit ?? 'DAYS'); setProgress(task?.progress ?? initialProgress);
      setCustomerVisible(task?.customerVisible ?? false); setInCalendar(task?.inCalendar ?? false);
      setDeps(task?.dependsOn ?? []); setDepQuery(''); setParties(task?.parties ?? []); setQueue([]); setFiles(task?.files ?? []);
      setTouched(false); setError(null);
      // «Περισσότερα» ανοιχτό μόνο αν η εργασία έχει ήδη κάτι εκεί
      setMoreOpen(!!task && (task.dependsOn.length > 0 || task.customerVisible || task.inCalendar || task.files.length > 0));
    }
  }

  const durationNum = Number(duration.replace(',', '.'));
  const nameErr = touched && !name.trim() ? 'Δώστε όνομα εργασίας' : null;
  const durErr = touched && !(durationNum > 0) ? 'Ο χρόνος πρέπει να είναι θετικός αριθμός' : null;
  const others = tasks.filter((t) => t.id !== task?.id);
  const depMatches = others.filter((t) => !depQuery.trim() || t.name.toLowerCase().includes(depQuery.trim().toLowerCase()));
  // Προτεινόμενη έναρξη όταν το πεδίο είναι κενό: η νωρίτερη μετά τα προαπαιτούμενα.
  const earliest = deps.length ? others.filter((t) => deps.includes(t.id)).map((t) => t.sched.end).sort().at(-1) ?? null : null;

  const submit = async () => {
    setTouched(true);
    if (!name.trim() || !(durationNum > 0)) {
      (name.trim() ? durRef : nameRef).current?.focus();
      return;
    }
    setBusy(true); setError(null);
    const payload = {
      name: name.trim(), description: description.trim() || null, startDate: startDate || null, durationValue: durationNum, durationUnit: unit,
      progress, customerVisible, inCalendar, dependsOn: deps, parties: parties.map((p) => ({ kind: p.kind, ref: p.ref })),
    };
    try {
      const { id } = await unwrap(saveTaskAction(prjc, task?.id ?? null, payload));
      // Τα αρχεία ανεβαίνουν στο REST route (multipart, έως 100 MB) — όχι μέσα από Server Action.
      let failed = 0;
      for (const f of queue) {
        const fd = new FormData();
        fd.append('file', f);
        await api(`/api/admin/projects/${prjc}/tasks/${id}/files`, { method: 'POST', body: fd }).catch((e) => { failed++; toast.error(`«${f.name}»: ${(e as Error).message}`); });
      }
      toast.success(task ? 'Η εργασία ενημερώθηκε' : 'Η εργασία δημιουργήθηκε', {
        description: inCalendar && (!task || !task.inCalendar) ? 'Μπήκε στο ημερολόγιο· οι υπάλληλοι λαμβάνουν πρόσκληση .ics.' : failed ? `${failed} αρχεία δεν ανέβηκαν` : undefined,
      });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (fileId: string) => {
    if (!task) return;
    try {
      await unwrap(unlinkTaskFileAction(prjc, task.id, fileId));
      setFiles((f) => f.filter((x) => x.id !== fileId));
      onSaved();
    } catch (e) { toast.error((e as Error).message); }
  };

  const phase = phaseOf(progress);
  const moreCount = deps.length + (customerVisible ? 1 : 0) + (inCalendar ? 1 : 0) + (canFiles ? files.length + queue.length : 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{task ? 'Επεξεργασία εργασίας' : 'Νέα εργασία'}</DialogTitle>
          <DialogDescription>Υποχρεωτικά μόνο το όνομα και ο χρόνος· τα υπόλοιπα όποτε χρειαστούν. Δεν γράφεται τίποτα στο SoftOne.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form id="task-form" className="space-y-6" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
            {/* Τι */}
            <Group title="Τι">
              <div className={fieldCls}>
                <Label htmlFor="task-name">Όνομα <Req /></Label>
                <Input id="task-name" ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setTouched(true)} maxLength={200} className={inputCls}
                  aria-invalid={!!nameErr} aria-required aria-describedby={nameErr ? 'task-name-err' : undefined} placeholder="π.χ. Αποτύπωση χώρου" />
                {nameErr && <p id="task-name-err" role="alert" className={errCls}>{nameErr}</p>}
              </div>
              <div className={fieldCls}>
                <Label htmlFor="task-desc">Περιγραφή <span className="font-normal text-muted-foreground">(προαιρετικά)</span></Label>
                <textarea id="task-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={5000}
                  className="field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base shadow-2xs outline-hidden focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-(length:--fs-13) dark:bg-input/30" />
              </div>
            </Group>

            {/* Πότε */}
            <Group title="Πότε">
              <div className="grid gap-x-3 gap-y-4 sm:grid-cols-[1fr_1fr_8rem]">
                <div className={fieldCls}>
                  <Label htmlFor="task-start">Έναρξη</Label>
                  <Input id="task-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-describedby="task-start-hint" className={inputCls} />
                  <p id="task-start-hint" className={hint}>{startDate ? 'Σαββατοκύριακο → πάει στη Δευτέρα.' : earliest ? `Κενό = αυτόματα μετά τις ${new Date(`${earliest}T00:00:00Z`).toLocaleDateString('el-GR', { timeZone: 'UTC' })}.` : 'Κενό = αυτόματα (έναρξη έργου ή μετά τις εξαρτήσεις).'}</p>
                </div>
                <div className={fieldCls}>
                  <Label htmlFor="task-dur">Χρόνος υλοποίησης <Req /></Label>
                  <Input id="task-dur" ref={durRef} inputMode="decimal" value={duration} onChange={(e) => setDuration(e.target.value)} onBlur={() => setTouched(true)} className={cn(inputCls, 'tabular-nums')}
                    aria-invalid={!!durErr} aria-required aria-describedby="task-dur-hint" />
                  <p id="task-dur-hint" className={durErr ? errCls : hint} role={durErr ? 'alert' : undefined}>{durErr ?? (durationNum > 0 ? durationLabel(durationNum, unit) + (unit === 'HOURS' ? ' (8 ώρες = 1 ημέρα)' : ' εργάσιμες') : '—')}</p>
                </div>
                <div className={fieldCls}>
                  <Label htmlFor="task-unit">Μονάδα</Label>
                  <Select value={unit} onValueChange={(v) => setUnit(v as 'DAYS' | 'HOURS')}>
                    <SelectTrigger id="task-unit" className="h-10 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="DAYS">Ημέρες</SelectItem><SelectItem value="HOURS">Ώρες</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>

              <fieldset className={fieldCls}>
                <legend className="mb-1.5 flex items-center gap-1.5 text-(length:--fs-13) font-medium">
                  Πρόοδος
                  <span className="inline-flex items-center gap-1 font-normal text-muted-foreground">
                    · <span className="size-2 rounded-full" style={{ background: phaseMeta(phase).color }} aria-hidden />{phaseMeta(phase).label}
                  </span>
                </legend>
                {/* Επιλεγμένο = ένα χρώμα (primary) για σταθερή αντίθεση· η φάση φαίνεται με κείμενο */}
                <div role="radiogroup" aria-label="Ποσοστό ολοκλήρωσης" className="grid grid-cols-5 gap-1 rounded-lg bg-muted p-1">
                  {PROGRESS_STEPS.map((p) => (
                    <button key={p} type="button" role="radio" aria-checked={progress === p} onClick={() => setProgress(p)}
                      className={cn('min-h-10 cursor-pointer rounded-md text-(length:--fs-13) font-semibold tabular-nums focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150',
                        progress === p ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:bg-background hover:text-foreground')}>
                      {p}%
                    </button>
                  ))}
                </div>
              </fieldset>
            </Group>

            {/* Ποιος */}
            <Group title="Ποιος">
              <PartiesField prjc={prjc} value={parties} onChange={setParties} options={options} />
            </Group>

            {/* Περισσότερα: εξαρτήσεις, ορατότητα, αρχεία — σπάνια, άρα κλειστά εκτός αν έχουν τιμή */}
            <section className="rounded-lg border border-border">
              <button type="button" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} aria-controls="task-more"
                className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-3 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                <FiChevronDown className={cn('size-4 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150', moreOpen && 'rotate-180')} aria-hidden />
                <span className="text-(length:--fs-13) font-medium">Περισσότερα</span>
                <span className="min-w-0 truncate text-(length:--fs-12) text-muted-foreground">Εξαρτήσεις · ορατότητα · {canFiles ? 'αρχεία' : 'ημερολόγιο'}</span>
                {moreCount > 0 && <span className="ml-auto rounded-full bg-muted px-2 text-(length:--fs-11) font-medium tabular-nums text-muted-foreground" aria-label={`${moreCount} ορισμένα`}>{moreCount}</span>}
              </button>
              <div id="task-more" hidden={!moreOpen} className="space-y-5 border-t border-border px-3 pb-3 pt-3">
                <div className={fieldCls}>
                  <Label htmlFor="task-dep-q">Γίνεται αφού ολοκληρωθούν</Label>
                  {others.length === 0 ? <p className={hint}>Δεν υπάρχουν άλλες εργασίες στο έργο.</p> : (
                    <>
                      {others.length > DEP_LIMIT && (
                        <div className="relative">
                          <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                          <Input id="task-dep-q" value={depQuery} onChange={(e) => setDepQuery(e.target.value)} placeholder="Αναζήτηση εργασίας…" className={cn(inputCls, 'pl-8')} />
                        </div>
                      )}
                      {/* Χωρίς δικό της scroll (διπλή κύλιση μέσα στο παράθυρο): λίγες γραμμές + αναζήτηση */}
                      <ul className="grid gap-0.5 rounded-md border border-border p-1 sm:grid-cols-2">
                        {depMatches.slice(0, DEP_LIMIT).map((t) => (
                          <li key={t.id}>
                            <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded px-2 text-(length:--fs-13) hover:bg-muted">
                              <Checkbox checked={deps.includes(t.id)} onCheckedChange={(c) => setDeps((d) => (c ? [...d, t.id] : d.filter((x) => x !== t.id)))} />
                              <span className="min-w-0 flex-1 truncate">{t.name}</span>
                              <span className="shrink-0 text-(length:--fs-11) tabular-nums text-muted-foreground">{t.progress}%</span>
                            </label>
                          </li>
                        ))}
                        {depMatches.length === 0 && <li className="px-2 py-2 text-(length:--fs-12) text-muted-foreground">Κανένα αποτέλεσμα.</li>}
                      </ul>
                      {depMatches.length > DEP_LIMIT && <p className={hint}>+{depMatches.length - DEP_LIMIT} ακόμη — περιορίστε με την αναζήτηση.</p>}
                      <p className={hint}>Κύκλος εξαρτήσεων (η Α περιμένει τη Β και η Β την Α) απορρίπτεται κατά την αποθήκευση.</p>
                    </>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/50">
                    <Switch checked={customerVisible} onCheckedChange={setCustomerVisible} className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-(length:--fs-13) font-medium"><FiEye className="size-3.5" aria-hidden /> Ορατή στον πελάτη</span>
                      <span className={cn('block', hint)}>Φαίνεται στο portal του πελάτη (όνομα, περιγραφή, ημερομηνίες, %, αρχεία).</span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/50">
                    <Switch checked={inCalendar} onCheckedChange={setInCalendar} className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-(length:--fs-13) font-medium"><FiCalendar className="size-3.5" aria-hidden /> Στο ημερολόγιό μας</span>
                      <span className={cn('block', hint)}>Μπαίνει στο ημερολόγιο ραντεβού· οι υπάλληλοι-εμπλεκόμενοι λαμβάνουν πρόσκληση .ics.</span>
                    </span>
                  </label>
                </div>

                {canFiles && (
                  <div className={fieldCls}>
                    <span className="flex items-center gap-1.5 text-(length:--fs-13) font-medium"><FiPaperclip className="size-3.5" aria-hidden /> Αρχεία</span>
                    {(files.length > 0 || queue.length > 0) && (
                      <ul className="space-y-1">
                        {files.map((f) => (
                          <li key={f.id} className="flex min-h-10 items-center gap-2 rounded-md border border-border pl-2.5 pr-1">
                            <FiFile className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                            <a href={`/api/admin/entity-files/file/${f.id}${f.ext === 'pdf' ? '?inline=1' : ''}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-(length:--fs-12) hover:underline">{f.name}</a>
                            {f.size > 0 && <span className="text-(length:--fs-11) tabular-nums text-muted-foreground">{sizeLabel(f.size)}</span>}
                            <button type="button" onClick={() => void unlink(f.id)} className="inline-flex size-9 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Αφαίρεση του ${f.name} από την εργασία`}><FiX className="size-3.5" aria-hidden /></button>
                          </li>
                        ))}
                        {queue.map((f, i) => (
                          <li key={`${f.name}-${i}`} className="flex min-h-10 items-center gap-2 rounded-md border border-dashed border-border pl-2.5 pr-1">
                            <FiUpload className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="min-w-0 flex-1 truncate text-(length:--fs-12)">{f.name}</span>
                            <span className="text-(length:--fs-11) text-muted-foreground">θα ανέβει</span>
                            <button type="button" onClick={() => setQueue((q) => q.filter((_, j) => j !== i))} className="inline-flex size-9 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Να μην ανέβει το ${f.name}`}><FiX className="size-3.5" aria-hidden /></button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-(length:--fs-12) font-medium hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
                        <FiUpload className="size-3.5" aria-hidden /> Ανέβασμα…
                        <input type="file" multiple accept={ACCEPT_EXTENSIONS.join(',')} className="sr-only" onChange={(e) => { const fs = [...(e.target.files ?? [])]; setQueue((q) => [...q, ...fs]); e.target.value = ''; }} />
                      </label>
                      {task && <LinkExisting prjc={prjc} taskId={task.id} linked={files.map((f) => f.id)} onLinked={(added) => { setFiles((f) => [...f, ...added]); onSaved(); }} />}
                    </div>
                    <p className={hint}>{ALLOWED_HINT}. Αποθηκεύονται στον φάκελο του έργου (υποφάκελος «Εργασίες»).</p>
                  </div>
                )}
              </div>
            </section>

            {error && <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-(length:--fs-12) text-destructive"><FiAlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />{error}</p>}
          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-10 px-3" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
          <Button type="submit" form="task-form" className="min-h-10 px-4" disabled={busy} aria-busy={busy}>
            {busy && <FiLoader className="size-3.5 motion-safe:animate-spin" aria-hidden />}
            {busy ? (queue.length ? 'Αποθήκευση & ανέβασμα…' : 'Αποθήκευση…') : task ? 'Αποθήκευση' : 'Δημιουργία'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Ομάδα πεδίων με μικρό τίτλο (Τι / Πότε / Ποιος). */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3" aria-label={title}>
      <h3 className="text-(length:--fs-12) font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** Πόσες γραμμές δείχνουν οι λίστες επιλογής· οι υπόλοιπες βρίσκονται με αναζήτηση (όχι εσωτερικό scroll). */
const DEP_LIMIT = 8;
const PARTY_LIMIT = 6;

const Req = () => <span className="text-destructive" aria-hidden>*</span>;

/** Εμπλεκόμενοι: υπάλληλοι/συνεργάτες από λίστα, πελάτες/προμηθευτές με αναζήτηση στον καθρέφτη SoftOne. */
function PartiesField({ prjc, value, onChange, options }: { prjc: number; value: Party[]; onChange: (p: Party[]) => void; options: PartyOption[] }) {
  const [kind, setKind] = React.useState<PartyKindKey>('EMPLOYEE');
  const [q, setQ] = React.useState('');
  const [remote, setRemote] = React.useState<PartyOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const isTrader = kind === 'CUSTOMER' || kind === 'SUPPLIER';

  // Καθαρισμός αποτελεσμάτων όταν η αναζήτηση δεν ισχύει (adjust-state-while-rendering)
  const [prevSearch, setPrevSearch] = React.useState({ q, kind, isTrader, prjc });
  if (prevSearch.q !== q || prevSearch.kind !== kind || prevSearch.isTrader !== isTrader || prevSearch.prjc !== prjc) {
    setPrevSearch({ q, kind, isTrader, prjc });
    if (!isTrader || q.trim().length < 2) setRemote([]);
  }
  React.useEffect(() => {
    if (!isTrader || q.trim().length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/projects/${prjc}/tasks/options?kind=${kind}&q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal });
        const body = await res.json();
        setRemote(body.results ?? []);
      } catch { /* aborted */ } finally { setLoading(false); }
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, kind, isTrader, prjc]);

  const has = (o: { kind: string; ref: string }) => value.some((v) => v.kind === o.kind && v.ref === o.ref);
  const local = options.filter((o) => o.kind === kind && !has(o) && (!q.trim() || `${o.label} ${o.sub ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())));
  const list = isTrader ? [...local, ...remote.filter((r) => !has(r) && !local.some((l) => l.ref === r.ref))] : local;

  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">Εμπλεκόμενοι</legend>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((p) => (
            <li key={`${p.kind}:${p.ref}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-muted pl-2.5 pr-1 text-(length:--fs-12)">
              <span className="text-(length:--fs-11) text-muted-foreground">{PARTY_KINDS.find((k) => k.key === p.kind)?.label}</span>
              <span className="max-w-48 truncate">{p.label}</span>
              <button type="button" onClick={() => onChange(value.filter((v) => !(v.kind === p.kind && v.ref === p.ref)))} className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full hover:bg-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Αφαίρεση ${p.label}`}><FiX className="size-3" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
      {value.length === 0 && <p className={hint}>Κανένας ακόμη — διαλέξτε είδος και αναζητήστε.</p>}
      <div className="rounded-lg border border-border">
        <div role="tablist" aria-label="Είδος εμπλεκομένου" className="m-1 grid grid-cols-2 gap-1 rounded-md bg-muted p-1 sm:grid-cols-4">
          {PARTY_KINDS.map((k) => (
            <button key={k.key} type="button" role="tab" aria-selected={kind === k.key} onClick={() => { setKind(k.key); setQ(''); }}
              className={cn('min-h-9 cursor-pointer rounded px-2.5 text-(length:--fs-12) font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150',
                kind === k.key ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}>
              {k.label}
            </button>
          ))}
        </div>
        <div className="px-1.5 pb-1.5">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={isTrader ? 'Επωνυμία, κωδικός ή ΑΦΜ (2+ χαρακτήρες)…' : 'Αναζήτηση…'} aria-label="Αναζήτηση εμπλεκομένου" className={inputCls} />
          <ul className="mt-1" aria-live="polite">
            {loading && <li className="px-2 py-1.5 text-(length:--fs-12) text-muted-foreground"><FiLoader className="mr-1 inline size-3 motion-safe:animate-spin" aria-hidden />Αναζήτηση…</li>}
            {list.slice(0, PARTY_LIMIT).map((o) => (
              <li key={o.ref}>
                <button type="button" onClick={() => { onChange([...value, o]); setQ(''); }} className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded px-2 text-left text-(length:--fs-13) hover:bg-muted focus-visible:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.sub && <span className="shrink-0 truncate text-(length:--fs-11) text-muted-foreground">{o.sub}</span>}
                </button>
              </li>
            ))}
            {list.length > PARTY_LIMIT && <li className="px-2 py-1.5 text-(length:--fs-12) text-muted-foreground">+{list.length - PARTY_LIMIT} ακόμη — πληκτρολογήστε για να βρείτε.</li>}
            {!loading && list.length === 0 && (
              <li className="px-2 py-1.5 text-(length:--fs-12) text-muted-foreground">{isTrader && q.trim().length < 2 ? 'Πληκτρολογήστε για αναζήτηση.' : 'Κανένα αποτέλεσμα.'}</li>
            )}
          </ul>
        </div>
      </div>
    </fieldset>
  );
}

/** Σύνδεση αρχείων που ήδη υπάρχουν στον φάκελο του έργου. */
function LinkExisting({ prjc, taskId, linked, onLinked }: { prjc: number; taskId: string; linked: string[]; onLinked: (f: TaskView['files']) => void }) {
  const [open, setOpen] = React.useState(false);
  const [choices, setChoices] = React.useState<{ id: string; name: string; ext: string; subfolder: string }[] | null>(null);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);

  // Καθαρισμός επιλογής στο άνοιγμα (adjust-state-while-rendering)· η φόρτωση στο effect.
  const [prevDeps, setPrevDeps] = React.useState({ open: false, prjc });
  if (prevDeps.open !== open || prevDeps.prjc !== prjc) {
    setPrevDeps({ open, prjc });
    if (open) setPicked([]);
  }
  React.useEffect(() => {
    if (!open) return;
    projectFileChoicesAction(prjc).then((r) => setChoices(r.ok ? r.data : []), () => setChoices([]));
  }, [open, prjc]);

  const save = async () => {
    setBusy(true);
    try {
      await unwrap(linkTaskFilesAction(prjc, taskId, picked));
      onLinked((choices ?? []).filter((c) => picked.includes(c.id)).map((c) => ({ id: c.id, name: c.name, ext: c.ext, size: 0, family: 'pdf' })));
      setOpen(false);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const avail = (choices ?? []).filter((c) => !linked.includes(c.id));
  return (
    <>
      <Button type="button" variant="outline" className="min-h-10 px-3 text-(length:--fs-12)" onClick={() => setOpen(true)}><FiLink className="size-3.5" aria-hidden /> Από τα αρχεία του έργου…</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Σύνδεση αρχείων έργου</DialogTitle><DialogDescription>Τα αρχεία μένουν στον φάκελο του έργου· η εργασία απλώς τα δείχνει.</DialogDescription></DialogHeader>
          <DialogBody>
            {choices == null ? <p className="py-6 text-center text-(length:--fs-12) text-muted-foreground"><FiLoader className="mr-1 inline size-3 motion-safe:animate-spin" aria-hidden />Φόρτωση…</p>
              : avail.length === 0 ? <p className="py-6 text-center text-(length:--fs-12) text-muted-foreground">Δεν υπάρχουν άλλα αρχεία στον φάκελο του έργου.</p> : (
                <ul className="space-y-0.5">
                  {avail.map((c) => (
                    <li key={c.id}>
                      <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded px-2 text-(length:--fs-13) hover:bg-muted">
                        <Checkbox checked={picked.includes(c.id)} onCheckedChange={(v) => setPicked((p) => (v ? [...p, c.id] : p.filter((x) => x !== c.id)))} />
                        <span className="min-w-0 flex-1 truncate">{c.name}</span>
                        {c.subfolder && <span className="shrink-0 text-(length:--fs-11) text-muted-foreground">{c.subfolder}</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-10 px-3" onClick={() => setOpen(false)} disabled={busy}>Άκυρο</Button>
            <Button type="button" className="min-h-10 px-4" disabled={!picked.length || busy} aria-busy={busy} onClick={() => void save()}>{busy && <FiLoader className="size-3.5 motion-safe:animate-spin" aria-hidden />}Σύνδεση {picked.length || ''}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

