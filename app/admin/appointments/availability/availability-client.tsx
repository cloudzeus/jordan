'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FiMoreVertical, FiPlus, FiSave, FiTrash2, FiX } from 'react-icons/fi';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { formatSlotEl, normalizeRanges, SLOT_LENGTHS, WEEKDAYS_EL, type Availability, type Weekly } from '@/lib/appointments-core';
import type { BlockView } from '@/lib/appointments';

const ORDER = ['1', '2', '3', '4', '5', '6', '0'] as const;
const label = 'block space-y-1 text-[length:var(--fs-12)] font-medium';
const hint = 'text-[length:var(--fs-11)] font-normal text-muted-foreground';
const dateFmt = new Intl.DateTimeFormat('el-GR', { timeZone: 'Europe/Athens', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function blockLabel(b: BlockView) {
  if (!b.allDay) return formatSlotEl(b.start, b.end);
  const last = new Date(new Date(b.end).getTime() - 1);
  const a = dateFmt.format(new Date(b.start)); const z = dateFmt.format(last);
  return a === z ? `${a} · όλη η μέρα` : `${a} – ${z} · ολοήμερο`;
}

function BlockDialog({ open, today, onClose, onDone }: { open: boolean; today: string; onClose: () => void; onDone: () => void }) {
  const [allDay, setAllDay] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => f.get(k)?.toString() || null;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/appointments/blocks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: s('date'), toDate: allDay ? s('toDate') : null, allDay, from: allDay ? null : s('from'), to: allDay ? null : s('to'), reason: s('reason') }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message ?? 'Η αποθήκευση απέτυχε');
      toast.success('Το διάστημα έκλεισε', d.clash ? { description: `Προσοχή: ${d.clash} ενεργά ραντεβού πέφτουν μέσα — μεταφέρετε ή ακυρώστε τα από το ημερολόγιο.` } : undefined);
      onDone();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Νέος αποκλεισμός</DialogTitle>
            <DialogDescription>Αργία, έκθεση, άδεια — οι ώρες αυτές δεν θα φαίνονται ελεύθερες στο website.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <label className="flex items-center gap-2 text-[length:var(--fs-12)]"><Switch checked={allDay} onCheckedChange={setAllDay} /> Όλη η μέρα</label>
            <div className="grid grid-cols-2 gap-3">
              <label className={label}><span>{allDay ? 'Από' : 'Ημερομηνία'}</span><Input type="date" name="date" required min={today} defaultValue={today} /></label>
              {allDay && <label className={label}><span>Έως (προαιρετικό)</span><Input type="date" name="toDate" min={today} /></label>}
            </div>
            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <label className={label}><span>Από ώρα</span><Input type="time" name="from" required step={900} defaultValue="10:00" /></label>
                <label className={label}><span>Έως ώρα</span><Input type="time" name="to" required step={900} defaultValue="13:00" /></label>
              </div>
            )}
            <label className={label}><span>Αιτία (εσωτερικά)</span><Input name="reason" maxLength={200} placeholder="π.χ. Αργία 28ης Οκτωβρίου" /></label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Άκυρο</Button>
            <Button type="submit" disabled={busy}>Αποθήκευση</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AvailabilityClient({ availability, blocks, today }: { availability: Availability; blocks: BlockView[]; today: string }) {
  const router = useRouter();
  const [a, setA] = React.useState<Availability>(availability);
  const [saving, setSaving] = React.useState(false);
  const [blockOpen, setBlockOpen] = React.useState(false);
  const dirty = JSON.stringify(a) !== JSON.stringify(availability);

  const setDay = (k: keyof Weekly, ranges: Weekly[keyof Weekly]) => setA((x) => ({ ...x, weekly: { ...x.weekly, [k]: ranges } }));
  const problems = ORDER.map((k) => ({ k, p: normalizeRanges(a.weekly[k]).problem })).filter((x) => x.p);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/appointments/availability', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message ?? 'Η αποθήκευση απέτυχε');
      toast.success('Το ωράριο αποθηκεύτηκε'); router.refresh();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }
  async function removeBlock(b: BlockView) {
    if (!(await confirmAction({ message: `Άνοιγμα ξανά του «${blockLabel(b)}»;`, confirmLabel: 'Διαγραφή αποκλεισμού', destructive: true }))) return;
    const res = await fetch(`/api/admin/appointments/blocks/${b.id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Ο αποκλεισμός διαγράφηκε'); router.refresh(); } else toast.error('Η διαγραφή απέτυχε');
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2"><CardTitle className="text-[length:var(--fs-14)]">Εβδομαδιαίο ωράριο</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border">
            {ORDER.map((k) => {
              const ranges = a.weekly[k];
              const open = ranges.length > 0;
              return (
                <div key={k} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-start">
                  <label className="flex w-40 shrink-0 items-center gap-2 pt-1 text-[length:var(--fs-13)] font-medium">
                    <Switch checked={open} onCheckedChange={(on) => setDay(k, on ? [{ from: '10:00', to: '17:00' }] : [])} aria-label={`${WEEKDAYS_EL[Number(k)]} ανοιχτά`} />
                    {WEEKDAYS_EL[Number(k)]}
                  </label>
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    {!open && <span className="pt-1 text-[length:var(--fs-12)] text-muted-foreground">Κλειστά</span>}
                    {ranges.map((r, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <Input type="time" step={900} value={r.from} aria-label="Από" className="h-8 w-[7.75rem]" onChange={(e) => setDay(k, ranges.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} />
                        <span className="text-muted-foreground">–</span>
                        <Input type="time" step={900} value={r.to} aria-label="Έως" className="h-8 w-[7.75rem]" onChange={(e) => setDay(k, ranges.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} />
                        <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Αφαίρεση διαστήματος" onClick={() => setDay(k, ranges.filter((_, j) => j !== i))}><FiX className="size-3.5" aria-hidden /></Button>
                      </div>
                    ))}
                    {open && <Button type="button" variant="ghost" size="sm" className="h-8 text-[length:var(--fs-12)]" onClick={() => setDay(k, [...ranges, { from: '17:00', to: '19:00' }])}><FiPlus className="size-3.5" aria-hidden /> διάστημα</Button>}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-[length:var(--fs-14)]">Κανόνες κράτησης</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              <span>Διάρκεια ραντεβού</span>
              <select value={a.slotMinutes} onChange={(e) => setA({ ...a, slotMinutes: Number(e.target.value) })} className="h-9 w-full rounded-md border border-input bg-background px-2 text-[length:var(--fs-13)] font-normal">
                {SLOT_LENGTHS.map((m) => <option key={m} value={m}>{m < 60 ? `${m} λεπτά` : `${m / 60} ${m === 60 ? 'ώρα' : 'ώρες'}`.replace('1.5 ώρες', '1½ ώρα')}</option>)}
              </select>
              <span className={hint}>Το βήμα των ωρών που βλέπει ο επισκέπτης.</span>
            </label>
            <label className={label}>
              <span>Ραντεβού ανά ώρα</span>
              <Input type="number" min={1} max={10} value={a.capacity} onChange={(e) => setA({ ...a, capacity: Math.max(1, Number(e.target.value) || 1) })} />
              <span className={hint}>Πόσους επισκέπτες υποδέχεστε ταυτόχρονα.</span>
            </label>
            <label className={label}>
              <span>Ελάχιστη προειδοποίηση (ώρες)</span>
              <Input type="number" min={0} max={336} value={a.minNoticeHours} onChange={(e) => setA({ ...a, minNoticeHours: Math.max(0, Number(e.target.value) || 0) })} />
              <span className={hint}>Π.χ. 12: όχι ραντεβού για τις επόμενες 12 ώρες.</span>
            </label>
            <label className={label}>
              <span>Ορίζοντας (μέρες)</span>
              <Input type="number" min={1} max={180} value={a.horizonDays} onChange={(e) => setA({ ...a, horizonDays: Math.max(1, Number(e.target.value) || 1) })} />
              <span className={hint}>Πόσο μπροστά φαίνονται διαθέσιμες ώρες.</span>
            </label>
            <label className="flex items-start gap-2 text-[length:var(--fs-12)] sm:col-span-2">
              <Switch checked={a.autoConfirm} onCheckedChange={(v) => setA({ ...a, autoConfirm: v })} className="mt-0.5" />
              <span><span className="font-medium">Αυτόματη επιβεβαίωση</span><span className={`block ${hint}`}>Ανοιχτό: το ραντεβού κλείνει αμέσως. Κλειστό: ο επισκέπτης κάνει αίτημα και το επιβεβαιώνετε από το ημερολόγιο.</span></span>
            </label>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {problems.length > 0 && <p className="text-[length:var(--fs-12)] text-destructive">{WEEKDAYS_EL[Number(problems[0].k)]}: {problems[0].p}</p>}
          {dirty && <Button type="button" variant="outline" onClick={() => setA(availability)}>Αναίρεση</Button>}
          <Button type="button" onClick={save} disabled={!dirty || saving || problems.length > 0}><FiSave className="size-3.5" aria-hidden /> Αποθήκευση ωραρίου</Button>
        </div>
      </div>

      <Card className="self-start">
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle className="text-[length:var(--fs-14)]">Κλειστές μέρες & ώρες</CardTitle>
          <Button size="sm" onClick={() => setBlockOpen(true)}><FiPlus className="size-3.5" aria-hidden /> Αποκλεισμός</Button>
        </CardHeader>
        <CardContent>
          {blocks.length === 0 ? (
            <p className="py-6 text-center text-[length:var(--fs-13)] text-muted-foreground">Κανένας αποκλεισμός. Προσθέστε αργίες ή μέρες που το atelier είναι κλειστό.</p>
          ) : (
            <ul className="divide-y divide-border">
              {blocks.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[length:var(--fs-13)] font-medium">{blockLabel(b)}</span>
                    {b.reason && <span className="block truncate text-[length:var(--fs-11)] text-muted-foreground">{b.reason}</span>}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Ενέργειες αποκλεισμού"><FiMoreVertical className="size-4" aria-hidden /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem variant="destructive" className="cursor-pointer gap-2 text-[length:var(--fs-12)]" onSelect={() => removeBlock(b)}><FiTrash2 className="size-3.5" aria-hidden /> Διαγραφή…</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <BlockDialog open={blockOpen} today={today} onClose={() => setBlockOpen(false)} onDone={() => { setBlockOpen(false); router.refresh(); }} />
    </div>
  );
}
