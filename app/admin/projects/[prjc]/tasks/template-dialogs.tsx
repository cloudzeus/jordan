'use client';

import * as React from 'react';
import Link from 'next/link';
import { FiAlertCircle, FiAlertTriangle, FiLoader } from 'react-icons/fi';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { applyTemplateItems, durationLabel } from '@/lib/project-tasks-core';
import type { TaskView, TemplateView } from '@/lib/project-tasks';
import { unwrap } from '@/lib/action-result';
import { applyTemplateAction, createTemplateAction } from '../../actions';

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('el-GR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const errBox = 'flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-(length:--fs-12) text-destructive';
const btn = 'min-h-10 px-3';


/** «Αποθήκευση ως template»: όλα ή μέρος των tasks του έργου, με όνομα. */
export function SaveTemplateDialog({ open, onOpenChange, prjc, tasks, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; prjc: number; tasks: TaskView[]; onSaved: () => void }) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [picked, setPicked] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [nameErr, setNameErr] = React.useState(false);
  const nameRef = React.useRef<HTMLInputElement>(null);
  // Επαναφορά στο άνοιγμα (adjust-state-while-rendering)
  const [prevDeps, setPrevDeps] = React.useState({ open: false, tasks });
  if (prevDeps.open !== open || prevDeps.tasks !== tasks) {
    setPrevDeps({ open, tasks });
    if (open) { setName(''); setDescription(''); setPicked(tasks.map((t) => t.id)); setError(null); setNameErr(false); }
  }

  const ordered = [...tasks].sort((a, b) => a.sched.start.localeCompare(b.sched.start));
  const missingDeps = ordered.filter((t) => picked.includes(t.id) && t.dependsOn.some((d) => !picked.includes(d)));

  const save = async () => {
    if (!name.trim()) { setNameErr(true); nameRef.current?.focus(); return; }
    setBusy(true); setError(null);
    try {
      await unwrap(createTemplateAction({ name: name.trim(), description: description.trim() || null, prjc, taskIds: picked }));
      toast.success(`Αποθηκεύτηκε το template «${name.trim()}»`, { description: `${picked.length} εργασίες` });
      onSaved();
      onOpenChange(false);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Αποθήκευση ως template</DialogTitle>
          <DialogDescription>Κρατά ονόματα, περιγραφές, χρόνους, σχετική σειρά και εξαρτήσεις — όχι εμπλεκόμενους, αρχεία και ποσοστά.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form id="tpl-save" className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Όνομα <span className="text-destructive" aria-hidden>*</span></Label>
              <Input id="tpl-name" ref={nameRef} value={name} onChange={(e) => { setName(e.target.value); if (e.target.value.trim()) setNameErr(false); }} maxLength={120} placeholder="π.χ. Ανακαίνιση κουζίνας" autoFocus
                className="h-10" aria-required aria-invalid={nameErr} aria-describedby={nameErr ? 'tpl-name-err' : undefined} />
              {nameErr && <p id="tpl-name-err" role="alert" className="text-(length:--fs-11) font-medium text-destructive">Δώστε όνομα στο template</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-desc">Περιγραφή <span className="font-normal text-muted-foreground">(προαιρετικά)</span></Label>
              <Input id="tpl-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} className="h-10" />
            </div>
            <fieldset className="space-y-1.5">
              <div className="flex items-center justify-between">
                <legend className="text-(length:--fs-13) font-medium">Εργασίες <span className="font-normal tabular-nums text-muted-foreground">{picked.length}/{tasks.length}</span></legend>
                <button type="button" className="min-h-10 cursor-pointer rounded px-2 text-(length:--fs-12) font-medium text-primary hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setPicked(picked.length === tasks.length ? [] : tasks.map((t) => t.id))}>
                  {picked.length === tasks.length ? 'Καμία' : 'Όλες'}
                </button>
              </div>
              <ul className="max-h-64 space-y-0.5 overflow-auto rounded-md border border-border p-1">
                {ordered.map((t) => (
                  <li key={t.id}>
                    <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded px-2 text-(length:--fs-13) hover:bg-muted">
                      <Checkbox checked={picked.includes(t.id)} onCheckedChange={(c) => setPicked((p) => (c ? [...p, t.id] : p.filter((x) => x !== t.id)))} />
                      <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      <span className="shrink-0 text-(length:--fs-11) tabular-nums text-muted-foreground">{fmt(t.sched.start)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {missingDeps.length > 0 && <p className="flex items-start gap-1.5 text-(length:--fs-11) text-amber-800 dark:text-amber-300"><FiAlertTriangle className="mt-px size-3 shrink-0" aria-hidden />Εξαρτήσεις προς μη επιλεγμένες εργασίες δεν θα κρατηθούν ({missingDeps.map((t) => t.name).join(', ')}).</p>}
            </fieldset>
            {error && <p role="alert" className={errBox}><FiAlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />{error}</p>}
          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" className={btn} onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
          <Button type="submit" form="tpl-save" className={btn} disabled={busy || !picked.length} aria-busy={busy}>{busy && <FiLoader className="size-3.5 motion-safe:animate-spin" aria-hidden />}{busy ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** «Προσθήκη από template»: επιλογή template + ημερομηνία έναρξης, με προεπισκόπηση των ημερομηνιών. */
export function ApplyTemplateDialog({ open, onOpenChange, prjc, templates, today, onApplied, projects }: {
  open: boolean; onOpenChange: (o: boolean) => void; prjc: number | null; templates: TemplateView[]; today: string; onApplied: () => void;
  /** Από τη σελίδα templates: επιλογή έργου. */
  projects?: { prjc: number; label: string }[];
}) {
  const [tplId, setTplId] = React.useState('');
  const [target, setTarget] = React.useState<string>('');
  const [start, setStart] = React.useState(today);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Επαναφορά στο άνοιγμα (adjust-state-while-rendering)
  const [prevDeps, setPrevDeps] = React.useState({ open: false, templates, today, prjc });
  if (prevDeps.open !== open || prevDeps.templates !== templates || prevDeps.today !== today || prevDeps.prjc !== prjc) {
    setPrevDeps({ open, templates, today, prjc });
    if (open) { setTplId(templates[0]?.id ?? ''); setTarget(prjc ? String(prjc) : ''); setStart(today); setError(null); }
  }

  const tpl = templates.find((t) => t.id === tplId) ?? null;
  const preview = tpl && start ? applyTemplateItems(tpl.items, start) : [];
  const projectId = prjc ?? (target ? Number(target) : null);

  const apply = async () => {
    if (!tpl || !projectId || !start) return;
    setBusy(true); setError(null);
    try {
      const r = await unwrap(applyTemplateAction(tpl.id, { prjc: projectId, startDate: start }));
      toast.success(`Προστέθηκαν ${r.count} εργασίες από «${tpl.name}»`, projects ? { action: { label: 'Άνοιγμα', onClick: () => { window.location.href = `/admin/projects/${projectId}/tasks`; } } } : undefined);
      onApplied();
      onOpenChange(false);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Προσθήκη εργασιών από template</DialogTitle>
          <DialogDescription>Οι εργασίες μπαίνουν στη στήλη «Να γίνει», με εξαρτήσεις μεταξύ τους.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {templates.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-(length:--fs-13) font-medium">Δεν υπάρχουν templates ακόμη</p>
              <p className="mx-auto mt-1 max-w-xs text-(length:--fs-12) text-muted-foreground">Φτιάξτε τις εργασίες ενός έργου και κρατήστε τις με «⋮ → Αποθήκευση ως template».</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-pick">Template</Label>
                <Select value={tplId} onValueChange={setTplId}>
                  <SelectTrigger id="tpl-pick" className="h-10 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} · {t.items.length} εργασίες</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {projects && (
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-prj">Έργο</Label>
                  <Select value={target} onValueChange={setTarget}>
                    <SelectTrigger id="tpl-prj" className="h-10 w-full"><SelectValue placeholder="Επιλέξτε έργο…" /></SelectTrigger>
                    <SelectContent className="max-h-72">{projects.map((p) => <SelectItem key={p.prjc} value={String(p.prjc)}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="tpl-start">Έναρξη</Label>
                <Input id="tpl-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-10" />
              </div>
              {preview.length > 0 && (
                <div>
                  <p className="mb-1 flex items-baseline justify-between gap-2 text-(length:--fs-12) font-medium text-muted-foreground">
                    <span>Προεπισκόπηση</span><span className="font-normal tabular-nums">{preview.length} εργασίες · εργάσιμες ημέρες</span>
                  </p>
                  <ol className="max-h-56 space-y-0.5 overflow-auto rounded-md border border-border p-1 text-(length:--fs-12)">
                    {preview.map((p) => (
                      <li key={p.key} className="flex min-h-8 items-center gap-2 px-2">
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{durationLabel(p.durationValue, p.durationUnit)}</span>
                        <span className="w-24 shrink-0 text-right tabular-nums">{fmt(p.startDate)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {error && <p role="alert" className={errBox}><FiAlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />{error}</p>}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {!projects && <Button asChild variant="ghost" className={`${btn} sm:mr-auto`}><Link href="/admin/projects/task-templates">Διαχείριση templates</Link></Button>}
          <Button type="button" variant="outline" className={btn} onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
          <Button type="button" className={btn} onClick={() => void apply()} disabled={busy || !tpl || !projectId || !start} aria-busy={busy}>
            {busy && <FiLoader className="size-3.5 motion-safe:animate-spin" aria-hidden />}{busy ? 'Προσθήκη…' : preview.length ? `Προσθήκη ${preview.length} εργασιών` : 'Προσθήκη'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
