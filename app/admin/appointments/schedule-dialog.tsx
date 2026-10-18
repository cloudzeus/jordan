'use client';

import * as React from 'react';
import { FiAlertTriangle, FiBriefcase, FiSearch, FiUser, FiUserPlus, FiUsers, FiX } from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TOPICS, zonedToUtc } from '@/lib/appointments-core';
import type { PartyHit, PartyKind } from '@/lib/appointment-parties';
import type { StaffUser } from '@/lib/appointments';

const KIND: Record<PartyKind, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  trader: { label: 'Συναλλασσόμενος', icon: FiBriefcase, tone: '#0369A1' },
  contact: { label: 'Επαφή πελάτη', icon: FiUser, tone: '#047857' },
  partner: { label: 'Συνεργάτης', icon: FiUsers, tone: '#7C3AED' },
  partnerContact: { label: 'Επαφή συνεργάτη', icon: FiUser, tone: '#7C3AED' },
};
const DURATIONS = [30, 45, 60, 90, 120, 180, 240];
const label = 'block space-y-1 text-[length:var(--fs-12)] font-medium';
const textarea = 'w-full rounded-md border border-input bg-background px-3 py-2 text-[length:var(--fs-13)] font-normal';
const durLabel = (m: number) => (m < 60 ? `${m} λεπτά` : m % 60 ? `${Math.floor(m / 60)} ώρα ${m % 60}′` : `${m / 60} ${m === 60 ? 'ώρα' : 'ώρες'}`);

function PartySearch({ onPick, only, placeholder = 'Επωνυμία, κωδικός, ΑΦΜ, όνομα επαφής, email…' }: { onPick: (h: PartyHit) => void; only?: PartyKind; placeholder?: string }) {
  const [q, setQ] = React.useState('');
  const [hits, setHits] = React.useState<PartyHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const ctl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/appointments/parties?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal });
        const d = await res.json();
        setHits(((d.results ?? []) as PartyHit[]).filter((h) => !only || h.kind === only));
      } catch { /* ακυρώθηκε */ } finally { if (!ctl.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, only]);
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="relative">
        <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="pl-8" aria-label="Αναζήτηση πελάτη ή συνεργάτη" />
      </div>
      {q.trim().length >= 2 && (
        <ul className="max-h-60 w-full min-w-0 overflow-y-auto rounded-md border border-border" role="listbox" aria-label="Αποτελέσματα">
          {(loading || hits.length === 0) && <li className="px-3 py-3 text-[length:var(--fs-12)] text-muted-foreground">{loading ? 'Αναζήτηση…' : (only ? 'Δεν βρέθηκε συναλλασσόμενος.' : 'Δεν βρέθηκε κανείς — δημιουργήστε «Νέα επαφή» ή «Νέο πελάτη».')}</li>}
          {hits.map((h) => {
            const k = KIND[h.kind];
            return (
              <li key={`${h.kind}:${h.id}`}>
                <button type="button" role="option" aria-selected={false} onClick={() => onPick(h)} className="flex w-full cursor-pointer items-start gap-2 border-b border-border/60 px-3 py-2 text-left last:border-0 hover:bg-muted">
                  <k.icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[length:var(--fs-13)] font-medium">{h.label}</span>
                    <span className="block truncate text-[length:var(--fs-11)] text-muted-foreground">{h.sub}</span>
                  </span>
                  <span className="shrink-0 rounded px-1.5 text-[length:var(--fs-10)] font-medium" style={{ color: k.tone, background: `color-mix(in srgb, ${k.tone} 12%, var(--background))` }}>{k.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export type SchedulePrefill = { date: string; time: string } | null;

/**
 * «Νέο ραντεβού» από το προσωπικό: με υπάρχοντα συναλλασσόμενο / επαφή / συνεργάτη, ή με νέο
 * πελάτη που δημιουργείται ΚΑΙ στο SoftOne. Οποιαδήποτε μέρα και ώρα.
 */
export function ScheduleDialog({ open, prefill, defaultMinutes, staff, meId, softoneEnabled, onClose, onDone }: { open: boolean; prefill: SchedulePrefill; defaultMinutes: number; staff: StaffUser[]; meId: string | null; softoneEnabled: boolean; onClose: () => void; onDone: () => void }) {
  const [assignee, setAssignee] = React.useState(meId ?? '');
  const [mode, setMode] = React.useState<'existing' | 'newContact' | 'new'>('existing');
  const [owner, setOwner] = React.useState<PartyHit | null>(null);
  const [picked, setPicked] = React.useState<PartyHit | null>(null);
  const [date, setDate] = React.useState('');
  const [time, setTime] = React.useState('10:00');
  const [minutes, setMinutes] = React.useState(defaultMinutes);
  const [notify, setNotify] = React.useState(false);
  const [overlap, setOverlap] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [newEmail, setNewEmail] = React.useState('');
  const [newAfm, setNewAfm] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    setMode('existing'); setPicked(null); setOwner(null); setOverlap(null); setError(null); setNewEmail(''); setNewAfm('');
    setDate(prefill?.date ?? new Date().toISOString().slice(0, 10)); setTime(prefill?.time ?? '10:00');
    setMinutes(DURATIONS.includes(defaultMinutes) ? defaultMinutes : 60); setNotify(false); setAssignee(meId ?? '');
  }, [open, prefill, defaultMinutes, meId]);

  const email = mode === 'existing' ? picked?.email ?? '' : newEmail.trim();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => f.get(k)?.toString().trim() || null;
    if (mode === 'existing' && !picked) { setError('Διαλέξτε πελάτη ή συνεργάτη — ή «Νέα επαφή» / «Νέος πελάτης».'); return; }
    if (mode === 'newContact' && !owner) { setError('Διαλέξτε τον συναλλασσόμενο της νέας επαφής.'); return; }
    const party = mode === 'existing'
      ? { kind: picked!.kind, id: picked!.id }
      : mode === 'newContact'
        ? { kind: 'newContact' as const, contact: { trdr: Number(owner!.id), firstName: s('firstName') ?? '', lastName: s('lastName') ?? '', role: s('role'), email: s('email'), mobile: s('mobile') } }
        : { kind: 'new' as const, customer: { name: s('name') ?? '', contactFirstName: s('contactFirstName'), contactLastName: s('contactLastName'), afm: s('afm'), email: s('email'), phone: s('phone'), city: s('city'), profession: s('profession') } };
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/admin/appointments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: zonedToUtc(date, time).toISOString(), minutes, party, topic: s('topic'), message: s('message'), notify: notify && !!email, allowOverlap: !!overlap, assignedToId: assignee || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 409 && !overlap) { setOverlap(d.message ?? 'Υπάρχει ήδη ραντεβού σε αυτή την ώρα'); return; }
      if (!res.ok) throw new Error(d.message ?? 'Η αποθήκευση απέτυχε');
      const what = mode === 'newContact' ? 'επαφή' : 'πελάτης';
      toast.success(`Το ραντεβού ${d.appointment.code} κλείστηκε`, d.customer ? { description: d.customer.linked ? `Υπήρχε ήδη ${what} στο SoftOne (${d.customer.code}) — συνδέθηκε.` : `Νέα καρτέλα στο SoftOne (${what}): ${d.customer.code}` } : undefined);
      onDone();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  const tab = (on: boolean) => cn('inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded px-3 text-[length:var(--fs-12)] font-medium', on ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground');
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92dvh] grid-rows-[minmax(0,1fr)] sm:max-w-xl">
        <form onSubmit={submit} className="flex min-h-0 min-w-0 flex-col">
          <DialogHeader>
            <DialogTitle>Νέο ραντεβού</DialogTitle>
            <DialogDescription>Με πελάτη ή συνεργάτη, σε όποια μέρα και ώρα θέλετε — κλείνει επιβεβαιωμένο.</DialogDescription>
          </DialogHeader>
          <DialogBody className="min-w-0 space-y-4">
            <div className="flex gap-1 rounded-md bg-muted p-1" role="tablist">
              <button type="button" role="tab" aria-selected={mode === 'existing'} className={tab(mode === 'existing')} onClick={() => setMode('existing')}><FiSearch className="size-3.5" aria-hidden /> Υπάρχων</button>
              <button type="button" role="tab" aria-selected={mode === 'newContact'} className={tab(mode === 'newContact')} onClick={() => setMode('newContact')}><FiUser className="size-3.5" aria-hidden /> Νέα επαφή</button>
              <button type="button" role="tab" aria-selected={mode === 'new'} className={tab(mode === 'new')} onClick={() => setMode('new')}><FiUserPlus className="size-3.5" aria-hidden /> Νέος πελάτης</button>
            </div>

            {mode === 'existing' ? (
              picked ? (
                <div className="flex min-w-0 items-start justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[length:var(--fs-13)] font-medium">{picked.label}</span>
                    <span className="block truncate text-[length:var(--fs-11)] text-muted-foreground">{[KIND[picked.kind].label, picked.sub, picked.email, picked.phone].filter(Boolean).join(' · ')}</span>
                  </span>
                  <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => setPicked(null)} aria-label="Αλλαγή"><FiX className="size-3.5" aria-hidden /></Button>
                </div>
              ) : <PartySearch onPick={(h) => { setPicked(h); setError(null); }} />
            ) : mode === 'newContact' ? (
              <div className="space-y-3">
                {owner ? (
                  <div className="flex min-w-0 items-start justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                    <span className="min-w-0"><span className="block truncate text-[length:var(--fs-13)] font-medium">{owner.label}</span><span className="block truncate text-[length:var(--fs-11)] text-muted-foreground">{owner.sub}</span></span>
                    <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => setOwner(null)} aria-label="Αλλαγή συναλλασσομένου"><FiX className="size-3.5" aria-hidden /></Button>
                  </div>
                ) : <PartySearch only="trader" placeholder="Συναλλασσόμενος της επαφής (επωνυμία, κωδικός, ΑΦΜ)…" onPick={(h) => { setOwner(h); setError(null); }} />}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={label}><span>Όνομα *</span><Input name="firstName" required maxLength={64} /></label>
                  <label className={label}><span>Επώνυμο *</span><Input name="lastName" required maxLength={64} /></label>
                  <label className={label}><span>Ιδιότητα</span><Input name="role" maxLength={64} placeholder="π.χ. Μηχανικός έργου" /></label>
                  <label className={label}><span>Κινητό</span><Input name="mobile" type="tel" maxLength={32} /></label>
                  <label className={cn(label, 'sm:col-span-2')}><span>Email</span><Input name="email" type="email" maxLength={64} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></label>
                </div>
                <p className="flex items-start gap-2 rounded-md bg-[color-mix(in_srgb,#B45309_10%,var(--background))] px-3 py-2 text-[length:var(--fs-12)] text-[#92400E]">
                  <FiAlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>Η επαφή θα δημιουργηθεί στο SoftOne («Πρόσωπο» συνδεδεμένο με τον συναλλασσόμενο). Αν υπάρχει ήδη πρόσωπο με το ίδιο email, συνδέεται. Το ραντεβού μένει στην εφαρμογή.</span>
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={cn(label, 'sm:col-span-2')}><span>Επωνυμία *</span><Input name="name" required minLength={2} maxLength={128} placeholder="π.χ. Studio Λίθος ΙΚΕ" /></label>
                  <label className={label}><span>Όνομα υπευθύνου</span><Input name="contactFirstName" maxLength={64} /></label>
                  <label className={label}><span>Επώνυμο υπευθύνου</span><Input name="contactLastName" maxLength={64} /></label>
                  <label className={label}><span>ΑΦΜ</span><Input name="afm" maxLength={20} inputMode="numeric" value={newAfm} onChange={(e) => setNewAfm(e.target.value)} /></label>
                  <label className={label}><span>Email</span><Input name="email" type="email" maxLength={64} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></label>
                  <label className={label}><span>Τηλέφωνο</span><Input name="phone" type="tel" maxLength={32} /></label>
                  <label className={label}><span>Πόλη</span><Input name="city" maxLength={64} /></label>
                  <label className={label}><span>Δραστηριότητα</span><Input name="profession" maxLength={64} placeholder="π.χ. Αρχιτέκτονας" /></label>
                </div>
                <p className="flex items-start gap-2 rounded-md bg-[color-mix(in_srgb,#B45309_10%,var(--background))] px-3 py-2 text-[length:var(--fs-12)] text-[#92400E]">
                  <FiAlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>Θα δημιουργηθεί καρτέλα πελάτη στο SoftOne{newAfm.trim() ? '' : ' ως «Υποψήφιος» (χωρίς ΑΦΜ)'} — και ο υπεύθυνος ως επαφή του. Αν υπάρχει ήδη πελάτης με τον ίδιο ΑΦΜ ή email, συνδέεται με αυτόν. Το ραντεβού μένει στην εφαρμογή.</span>
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className={label}><span>Ημερομηνία</span><Input type="date" required value={date} onChange={(e) => { setDate(e.target.value); setOverlap(null); }} /></label>
              <label className={label}><span>Ώρα</span><Input type="time" required step={300} value={time} onChange={(e) => { setTime(e.target.value); setOverlap(null); }} /></label>
              <label className={cn(label, 'col-span-2 sm:col-span-1')}>
                <span>Διάρκεια</span>
                <select value={minutes} onChange={(e) => { setMinutes(Number(e.target.value)); setOverlap(null); }} className="h-9 w-full rounded-md border border-input bg-background px-2 text-[length:var(--fs-13)] font-normal">
                  {DURATIONS.map((m) => <option key={m} value={m}>{durLabel(m)}</option>)}
                </select>
              </label>
            </div>
            <label className={label}>
              <span>Υπεύθυνος</span>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-[length:var(--fs-13)] font-normal">
                {staff.map((u) => <option key={u.id} value={u.id}>{u.name}{u.softone ? ` · SoftOne: ${u.softone}` : ''}</option>)}
              </select>
              <span className="block text-[length:var(--fs-11)] font-normal text-muted-foreground">
                {staff.find((u) => u.id === assignee)?.softone
                  ? (softoneEnabled ? 'Θα καταχωριστεί και στο SoftOne ως Ενέργεια «Συνάντηση».' : 'Συνδεδεμένος με SoftOne — η καταχώριση είναι κλειστή στις Ρυθμίσεις.')
                  : 'Δεν είναι συνδεδεμένος με χρήστη SoftOne — μένει μόνο στην εφαρμογή.'}
              </span>
            </label>
            <label className={label}>
              <span>Θέμα</span>
              <select name="topic" defaultValue={TOPICS[1]} className="h-9 w-full rounded-md border border-input bg-background px-2 text-[length:var(--fs-13)] font-normal">
                {TOPICS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className={label}><span>Σημειώσεις (εσωτερικά)</span><textarea name="message" rows={2} maxLength={2000} className={textarea} placeholder="π.χ. φέρνει σχέδια για την κουζίνα" /></label>
            <label className={cn('flex items-center gap-2 text-[length:var(--fs-12)]', !email && 'opacity-50')}>
              <Switch checked={notify && !!email} onCheckedChange={setNotify} disabled={!email} /> Email επιβεβαίωσης στον πελάτη{email ? ` (${email})` : ' — δεν υπάρχει email'}
            </label>
            {overlap && (
              <p role="alert" className="flex items-start gap-2 rounded-md bg-[color-mix(in_srgb,#B45309_10%,var(--background))] px-3 py-2 text-[length:var(--fs-12)] text-[#92400E]">
                <FiAlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />{overlap}. Πατήστε ξανά «Κλείσιμο ραντεβού» για να το κρατήσετε παρ’ όλα αυτά.
              </p>
            )}
            {error && <p role="alert" className="text-[length:var(--fs-12)] text-destructive">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Άκυρο</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Αποθήκευση…' : overlap ? 'Κλείσιμο και πάνω σε άλλο' : 'Κλείσιμο ραντεβού'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
