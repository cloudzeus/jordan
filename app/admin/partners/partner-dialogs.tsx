'use client';

import * as React from 'react';
import {
  FiBriefcase, FiUser, FiUsers, FiMapPin, FiPhone, FiFileText, FiSearch, FiLoader, FiCheck, FiLink, FiDownloadCloud,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Field, FormSection, FormSelect, RowHint, Segmented, fieldCls } from '@/components/admin/form-kit';
import type { PartnerDetail, PartnerLinkOptions } from '@/lib/partners';
import { emitPartnerChanged } from './partner-events';

/** Επιλογές συσχέτισης (όλοι οι πελάτες, έργα με πελάτη) — έρχονται μία φορά από τη σελίδα. */
export const PartnerOptionsContext = React.createContext<PartnerLinkOptions>({ customers: [], projects: [] });

export type PartnerContactRow = PartnerDetail['contacts'][number];

async function fetchDetail(id: string): Promise<PartnerDetail> {
  const res = await fetch(`/api/admin/partners/${id}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Αποτυχία φόρτωσης συνεργάτη');
  return res.json();
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message ?? 'Η ενέργεια απέτυχε'), { field: data.field as string | undefined });
  return data;
}

function DialogShell({
  open, onOpenChange, busy, icon, tone, title, description, children, footer, size = 'sm:max-w-2xl',
}: {
  open: boolean; onOpenChange: (o: boolean) => void; busy: boolean; icon: React.ReactNode; tone: string;
  title: string; description: React.ReactNode; children: React.ReactNode; footer: React.ReactNode; size?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className={cn('flex max-h-[92dvh] w-[96vw] flex-col gap-0 overflow-hidden p-0', size)}>
        <DialogHeader className="flex-row items-center gap-3 border-b border-border px-4 py-2.5 pr-12">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4" style={{ color: tone, backgroundColor: `color-mix(in srgb, ${tone} 12%, var(--background))` }}>
            {icon}
          </span>
          <div className="min-w-0 flex-1 text-left">
            <DialogTitle className="text-[length:var(--fs-15)]">{title}</DialogTitle>
            <DialogDescription className="truncate text-[length:var(--fs-11)]">{description}</DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className="space-y-3 bg-muted/20 px-4 py-3">{children}</DialogBody>
        <DialogFooter className="mx-0 mb-0 items-center gap-2 border-t border-border bg-card px-4 py-2.5">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Συνεργάτης: δημιουργία / επεξεργασία ──────────────────────────────────────────────────────

type Form = {
  type: 'COMPANY' | 'PERSON'; name: string; tradeName: string; firstName: string; lastName: string; specialty: string;
  afm: string; doy: string; country: string; address: string; city: string; zip: string;
  phone: string; mobile: string; email: string; website: string; notes: string; isActive: boolean;
};
const EMPTY: Form = {
  type: 'COMPANY', name: '', tradeName: '', firstName: '', lastName: '', specialty: '', afm: '', doy: '', country: 'GR',
  address: '', city: '', zip: '', phone: '', mobile: '', email: '', website: '', notes: '', isActive: true,
};
const fromDetail = (p: PartnerDetail['partner']): Form => ({
  type: p.type, name: p.type === 'COMPANY' ? p.name : '', tradeName: p.tradeName ?? '', firstName: p.firstName ?? '', lastName: p.lastName ?? '',
  specialty: p.specialty ?? '', afm: p.afm ?? '', doy: p.doy ?? '', country: p.country ?? 'GR', address: p.address ?? '', city: p.city ?? '',
  zip: p.zip ?? '', phone: p.phone ?? '', mobile: p.mobile ?? '', email: p.email ?? '', website: p.website ?? '', notes: p.notes ?? '', isActive: p.isActive,
});

const greekAfm = (v: string) => /^\d{9}$/.test(v.replace(/\D/g, '')) && !/^[A-Z]/i.test(v.trim());

export function PartnerFormDialog({
  open, onOpenChange, partnerId, onSaved,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; partnerId: string | null; onSaved?: (id: string) => void;
}) {
  const [f, setF] = React.useState<Form>(EMPTY);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [aade, setAade] = React.useState<'idle' | 'busy' | 'ok'>('idle');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const isEdit = partnerId != null;
  // Ο γονέας ξαναφτιάχνει το onOpenChange σε κάθε render — δεν πρέπει να ξαναφορτώνει τη φόρμα.
  const closeRef = React.useRef(onOpenChange);
  React.useEffect(() => { closeRef.current = onOpenChange; });

  React.useEffect(() => {
    if (!open) return;
    setErrors({}); setAade('idle');
    if (!partnerId) { setF(EMPTY); return; }
    setLoading(true);
    fetchDetail(partnerId)
      .then((d) => setF(fromDetail(d.partner)))
      .catch((e) => { toast.error(e.message); closeRef.current(false); })
      .finally(() => setLoading(false));
  }, [open, partnerId]);

  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => { setF((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };
  const inp = (k: keyof Form) => ({
    id: `partner-${k}`, value: f[k] as string, className: fieldCls,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k)(e.target.value as never),
    'aria-invalid': errors[k] ? true : undefined,
  });

  const lookup = async () => {
    setAade('busy');
    try {
      const res = await fetch('/api/admin/aade-lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ afm: f.afm.replace(/\D/g, '') }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.mapped?.name) throw new Error(d.message ?? d.error ?? 'Δεν βρέθηκε ο ΑΦΜ στην ΑΑΔΕ');
      const m = d.mapped;
      setF((s) => ({
        ...s, name: s.type === 'COMPANY' ? m.name : s.name, tradeName: s.type === 'COMPANY' ? (m.shortName ?? s.tradeName) : s.tradeName,
        doy: m.doy ?? s.doy, address: m.address ?? s.address, city: m.city ?? s.city, zip: m.zip ?? s.zip,
        specialty: s.specialty || (m.profession ?? ''), country: 'GR',
      }));
      setAade('ok');
      toast.success(`ΑΑΔΕ: ${m.name}`);
    } catch (e) {
      setAade('idle');
      toast.error((e as Error).message);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const d = await send(isEdit ? `/api/admin/partners/${partnerId}` : '/api/admin/partners', isEdit ? 'PUT' : 'POST', f);
      toast.success(isEdit ? 'Ο συνεργάτης ενημερώθηκε' : `Δημιουργήθηκε ο συνεργάτης «${d.partner.name}»`);
      emitPartnerChanged(d.partner.id);
      onSaved?.(d.partner.id);
      onOpenChange(false);
    } catch (e) {
      const err = e as Error & { field?: string };
      if (err.field) setErrors({ [err.field]: err.message });
      toast.error(err.message);
    } finally { setBusy(false); }
  };

  const company = f.type === 'COMPANY';
  return (
    <DialogShell
      open={open} onOpenChange={onOpenChange} busy={busy} tone={company ? '#0369A1' : '#7C3AED'}
      icon={company ? <FiBriefcase /> : <FiUser />}
      title={isEdit ? 'Επεξεργασία συνεργάτη' : 'Νέος συνεργάτης'}
      description={loading ? 'Φόρτωση…' : company ? 'Εταιρία — τα πρόσωπα επικοινωνίας προστίθενται μετά την αποθήκευση' : 'Φυσικό πρόσωπο'}
      footer={(
        <>
          <span className="mr-auto text-[length:var(--fs-11)] text-muted-foreground">Τοπικό μητρώο — δεν γράφεται στο SoftOne</span>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
          <Button size="sm" onClick={save} disabled={busy || loading}>
            {busy ? <FiLoader className="mr-1.5 size-3.5 animate-spin" /> : <FiCheck className="mr-1.5 size-3.5" />}
            {isEdit ? 'Αποθήκευση' : 'Δημιουργία'}
          </Button>
        </>
      )}
    >
      {loading ? <div className="h-64 animate-pulse rounded-md bg-muted motion-reduce:animate-none" /> : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              ariaLabel="Τύπος συνεργάτη" value={f.type} onChange={set('type')}
              options={[{ value: 'COMPANY', label: 'Εταιρία' }, { value: 'PERSON', label: 'Φυσικό πρόσωπο' }]}
            />
            <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-[length:var(--fs-12)]">
              <input type="checkbox" className="size-4 accent-[#0369A1]" checked={f.isActive} onChange={(e) => set('isActive')(e.target.checked)} />
              Ενεργός
            </label>
          </div>

          <FormSection tone={company ? 'blue' : 'violet'} icon={company ? <FiBriefcase /> : <FiUser />} title={company ? 'Εταιρία' : 'Πρόσωπο'}>
            {company ? (
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Field label="Επωνυμία" required htmlFor="partner-name" error={errors.name}><Input {...inp('name')} autoFocus={!isEdit} /></Field>
                <Field label="Διακριτικός τίτλος" htmlFor="partner-tradeName"><Input {...inp('tradeName')} /></Field>
              </div>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Field label="Επώνυμο" required htmlFor="partner-lastName" error={errors.lastName}><Input {...inp('lastName')} autoFocus={!isEdit} /></Field>
                <Field label="Όνομα" htmlFor="partner-firstName"><Input {...inp('firstName')} /></Field>
              </div>
            )}
            <Field label={company ? 'Αντικείμενο / ειδικότητα' : 'Ιδιότητα / ειδικότητα'} htmlFor="partner-specialty">
              <Input {...inp('specialty')} placeholder={company ? 'π.χ. Τεχνική εταιρία, Εργολάβος' : 'π.χ. Αρχιτέκτονας, Ηλεκτρολόγος'} />
            </Field>
          </FormSection>

          <FormSection tone="amber" icon={<FiFileText />} title="Φορολογικά">
            <div className="grid gap-2.5 sm:grid-cols-[1fr_auto_1.4fr_5rem] sm:items-end">
              <Field label="ΑΦΜ" htmlFor="partner-afm" error={errors.afm}><Input {...inp('afm')} inputMode="text" autoComplete="off" /></Field>
              <Button
                type="button" variant="secondary" size="sm" className="h-8" onClick={lookup}
                disabled={!greekAfm(f.afm) || aade === 'busy'} title="Συμπλήρωση στοιχείων από την ΑΑΔΕ"
              >
                {aade === 'busy' ? <FiLoader className="mr-1.5 size-3.5 animate-spin" /> : aade === 'ok' ? <FiCheck className="mr-1.5 size-3.5" /> : <FiDownloadCloud className="mr-1.5 size-3.5" />}
                ΑΑΔΕ
              </Button>
              <Field label="Δ.Ο.Υ." htmlFor="partner-doy"><Input {...inp('doy')} /></Field>
              <Field label="Χώρα" htmlFor="partner-country"><Input {...inp('country')} maxLength={3} className={cn(fieldCls, 'uppercase')} /></Field>
            </div>
            <RowHint>Ελληνικός ΑΦΜ 9 ψηφίων → «ΑΑΔΕ» συμπληρώνει επωνυμία, Δ.Ο.Υ. και διεύθυνση.</RowHint>
          </FormSection>

          <FormSection tone="emerald" icon={<FiMapPin />} title="Διεύθυνση & επικοινωνία">
            <div className="grid gap-2.5 sm:grid-cols-[2fr_1fr_6rem]">
              <Field label="Διεύθυνση" htmlFor="partner-address"><Input {...inp('address')} autoComplete="street-address" /></Field>
              <Field label="Πόλη" htmlFor="partner-city"><Input {...inp('city')} /></Field>
              <Field label="Τ.Κ." htmlFor="partner-zip"><Input {...inp('zip')} inputMode="numeric" /></Field>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Field label="Τηλέφωνο" htmlFor="partner-phone"><Input {...inp('phone')} type="tel" /></Field>
              <Field label="Κινητό" htmlFor="partner-mobile"><Input {...inp('mobile')} type="tel" /></Field>
              <Field label="Email" htmlFor="partner-email" error={errors.email}><Input {...inp('email')} type="email" /></Field>
              <Field label="Ιστότοπος" htmlFor="partner-website"><Input {...inp('website')} type="url" placeholder="https://" /></Field>
            </div>
          </FormSection>

          <FormSection tone="slate" icon={<FiFileText />} title="Σημειώσεις">
            <textarea
              id="partner-notes" value={f.notes} onChange={(e) => set('notes')(e.target.value)} rows={3} aria-label="Σημειώσεις"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-[length:var(--fs-13)] shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </FormSection>
        </>
      )}
    </DialogShell>
  );
}

// ── Πρόσωπο επικοινωνίας ─────────────────────────────────────────────────────────────────────

export function ContactDialog({
  open, onOpenChange, partnerId, partnerName, contact,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; partnerId: string; partnerName: string; contact: PartnerContactRow | null;
}) {
  const [f, setF] = React.useState({ name: '', role: '', phone: '', mobile: '', email: '', notes: '', isPrimary: false });
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setF({
      name: contact?.name ?? '', role: contact?.role ?? '', phone: contact?.phone ?? '', mobile: contact?.mobile ?? '',
      email: contact?.email ?? '', notes: contact?.notes ?? '', isPrimary: contact?.isPrimary ?? false,
    });
  }, [open, contact]);

  const inp = (k: 'name' | 'role' | 'phone' | 'mobile' | 'email' | 'notes') => ({
    id: `contact-${k}`, value: f[k], className: fieldCls, 'aria-invalid': errors[k] ? true : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => { setF((s) => ({ ...s, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: '' })); },
  });

  const save = async () => {
    setBusy(true);
    try {
      await send(contact ? `/api/admin/partners/${partnerId}/contacts/${contact.id}` : `/api/admin/partners/${partnerId}/contacts`, contact ? 'PUT' : 'POST', f);
      toast.success(contact ? 'Το πρόσωπο ενημερώθηκε' : `Προστέθηκε: ${f.name}`);
      emitPartnerChanged(partnerId);
      onOpenChange(false);
    } catch (e) {
      const err = e as Error & { field?: string };
      if (err.field) setErrors({ [err.field]: err.message });
      toast.error(err.message);
    } finally { setBusy(false); }
  };

  return (
    <DialogShell
      open={open} onOpenChange={onOpenChange} busy={busy} tone="#7C3AED" icon={<FiUsers />} size="sm:max-w-lg"
      title={contact ? 'Επεξεργασία προσώπου' : 'Νέο πρόσωπο επικοινωνίας'} description={partnerName}
      footer={(
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? <FiLoader className="mr-1.5 size-3.5 animate-spin" /> : <FiCheck className="mr-1.5 size-3.5" />}
            Αποθήκευση
          </Button>
        </>
      )}
    >
      <FormSection tone="violet" icon={<FiUser />} title="Πρόσωπο">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Ονοματεπώνυμο" required htmlFor="contact-name" error={errors.name}><Input {...inp('name')} autoFocus /></Field>
          <Field label="Ιδιότητα" htmlFor="contact-role"><Input {...inp('role')} placeholder="π.χ. Διευθυντής έργου" /></Field>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-[length:var(--fs-12)]">
          <input type="checkbox" className="size-4 accent-[#7C3AED]" checked={f.isPrimary} onChange={(e) => setF((s) => ({ ...s, isPrimary: e.target.checked }))} />
          Κύριο πρόσωπο επικοινωνίας
        </label>
      </FormSection>
      <FormSection tone="emerald" icon={<FiPhone />} title="Επικοινωνία">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Τηλέφωνο" htmlFor="contact-phone"><Input {...inp('phone')} type="tel" /></Field>
          <Field label="Κινητό" htmlFor="contact-mobile"><Input {...inp('mobile')} type="tel" /></Field>
        </div>
        <Field label="Email" htmlFor="contact-email" error={errors.email}><Input {...inp('email')} type="email" /></Field>
        <Field label="Σημειώσεις" htmlFor="contact-notes"><Input {...inp('notes')} /></Field>
      </FormSection>
    </DialogShell>
  );
}

// ── Σύνδεση πελατών ──────────────────────────────────────────────────────────────────────────

const norm = (s: string) => s.toLocaleLowerCase('el').normalize('NFD').replace(/[̀-ͯ]/g, '');

export function LinkCustomersDialog({
  open, onOpenChange, partnerId, partnerName,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; partnerId: string; partnerName: string;
}) {
  const { customers } = React.useContext(PartnerOptionsContext);
  const [linked, setLinked] = React.useState<Set<number> | null>(null);
  const [picked, setPicked] = React.useState<Set<number>>(new Set());
  const [q, setQ] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setPicked(new Set()); setQ(''); setLinked(null);
    fetchDetail(partnerId).then((d) => setLinked(new Set(d.customers.map((c) => c.trdr)))).catch((e) => toast.error(e.message));
  }, [open, partnerId]);

  const shown = React.useMemo(() => {
    const n = norm(q.trim());
    const list = n ? customers.filter((c) => norm(`${c.name} ${c.code} ${c.afm ?? ''} ${c.city ?? ''}`).includes(n)) : customers;
    return list.slice(0, 200);
  }, [customers, q]);

  const toggle = (trdr: number) => setPicked((s) => { const x = new Set(s); if (x.has(trdr)) x.delete(trdr); else x.add(trdr); return x; });

  const save = async () => {
    setBusy(true);
    try {
      const d = await send(`/api/admin/partners/${partnerId}/customers`, 'POST', { trdrs: [...picked] });
      toast.success(`Συνδέθηκαν ${d.added} πελάτες`);
      emitPartnerChanged(partnerId);
      onOpenChange(false);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <DialogShell
      open={open} onOpenChange={onOpenChange} busy={busy} tone="#047857" icon={<FiLink />} size="sm:max-w-xl"
      title="Σύνδεση με πελάτες" description={partnerName}
      footer={(
        <>
          <span className="mr-auto text-[length:var(--fs-11)] text-muted-foreground" aria-live="polite">{picked.size ? `${picked.size} επιλεγμένοι` : 'Επίλεξε έναν ή περισσότερους'}</span>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
          <Button size="sm" onClick={save} disabled={busy || picked.size === 0}>
            {busy ? <FiLoader className="mr-1.5 size-3.5 animate-spin" /> : <FiLink className="mr-1.5 size-3.5" />}
            Σύνδεση
          </Button>
        </>
      )}
    >
      <div className="relative">
        <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση (επωνυμία, κωδικός, ΑΦΜ, πόλη)…" className={cn(fieldCls, 'pl-8')} autoFocus aria-label="Αναζήτηση πελάτη" />
      </div>
      <ul className="max-h-[50dvh] divide-y divide-border overflow-y-auto rounded-md border border-border bg-card" aria-busy={linked == null}>
        {shown.length === 0 && <li className="px-3 py-6 text-center text-[length:var(--fs-12)] text-muted-foreground">Κανένας πελάτης</li>}
        {shown.map((c) => {
          const already = linked?.has(c.trdr) ?? false;
          const on = picked.has(c.trdr);
          return (
            <li key={c.trdr}>
              <label className={cn('flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-1.5 transition-colors hover:bg-muted/50', already && 'cursor-default opacity-60', on && 'bg-emerald-50/60 dark:bg-emerald-500/10')}>
                <input type="checkbox" className="size-4 shrink-0 accent-[#047857]" checked={already || on} disabled={already || linked == null} onChange={() => toggle(c.trdr)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[length:var(--fs-13)] font-medium">{c.name}</span>
                  <span className="block truncate text-[length:var(--fs-11)] text-muted-foreground">
                    {[c.code, c.afm && `ΑΦΜ ${c.afm}`, c.city].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {already && <span className="shrink-0 text-[length:var(--fs-11)] font-medium text-emerald-700 dark:text-emerald-300">Συνδεδεμένος</span>}
                {!c.isActive && !already && <span className="shrink-0 text-[length:var(--fs-11)] text-muted-foreground">Ανενεργός</span>}
              </label>
            </li>
          );
        })}
      </ul>
      {customers.length > shown.length && !q && <RowHint>Εμφανίζονται οι πρώτοι 200 — χρησιμοποίησε την αναζήτηση.</RowHint>}
    </DialogShell>
  );
}

// ── Σύνδεση έργου ───────────────────────────────────────────────────────────────────────────

export function LinkProjectDialog({
  open, onOpenChange, partnerId, partnerName, presetPrjc,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; partnerId: string; partnerName: string; presetPrjc?: { prjc: number; role: string | null } | null;
}) {
  const { projects, customers } = React.useContext(PartnerOptionsContext);
  const [detail, setDetail] = React.useState<PartnerDetail | null>(null);
  const [customer, setCustomer] = React.useState('all');
  const [prjc, setPrjc] = React.useState('');
  const [role, setRole] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const editing = presetPrjc != null;

  React.useEffect(() => {
    if (!open) return;
    setDetail(null); setCustomer('all'); setPrjc(presetPrjc ? String(presetPrjc.prjc) : ''); setRole(presetPrjc?.role ?? '');
    fetchDetail(partnerId).then(setDetail).catch((e) => toast.error(e.message));
  }, [open, partnerId, presetPrjc]);

  const linkedTrdrs = React.useMemo(() => new Set(detail?.customers.map((c) => c.trdr) ?? []), [detail]);
  const linkedPrjcs = React.useMemo(() => new Set(detail?.projects.map((x) => x.prjc) ?? []), [detail]);
  const custName = React.useMemo(() => new Map(customers.map((c) => [c.trdr, c.name])), [customers]);

  const customerOpts = React.useMemo(
    () => (detail?.customers ?? []).map((c) => ({ id: String(c.trdr), name: c.name })),
    [detail],
  );
  const projectOpts = React.useMemo(() => projects
    .filter((x) => x.trdr != null && linkedTrdrs.has(x.trdr) && (customer === 'all' || String(x.trdr) === customer))
    .filter((x) => editing || !linkedPrjcs.has(x.prjc))
    .map((x) => ({ id: String(x.prjc), name: `${x.code} · ${x.name}${customer !== 'all' ? '' : ` — ${custName.get(x.trdr!) ?? ''}`}${x.isActive ? '' : ' (ανενεργό)'}` })),
  [projects, linkedTrdrs, linkedPrjcs, customer, custName, editing]);

  const save = async () => {
    setBusy(true);
    try {
      await send(`/api/admin/partners/${partnerId}/projects`, 'POST', { prjc: Number(prjc), role });
      toast.success(editing ? 'Ο ρόλος ενημερώθηκε' : 'Το έργο συνδέθηκε');
      emitPartnerChanged(partnerId);
      onOpenChange(false);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const noCustomers = detail != null && detail.customers.length === 0;
  return (
    <DialogShell
      open={open} onOpenChange={onOpenChange} busy={busy} tone="#B45309" icon={<FiBriefcase />} size="sm:max-w-lg"
      title={editing ? 'Ρόλος στο έργο' : 'Σύνδεση με έργο'} description={partnerName}
      footer={(
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
          <Button size="sm" onClick={save} disabled={busy || !prjc}>
            {busy ? <FiLoader className="mr-1.5 size-3.5 animate-spin" /> : <FiCheck className="mr-1.5 size-3.5" />}
            {editing ? 'Αποθήκευση' : 'Σύνδεση'}
          </Button>
        </>
      )}
    >
      {detail == null ? <div className="h-32 animate-pulse rounded-md bg-muted motion-reduce:animate-none" /> : noCustomers ? (
        <p role="alert" className="rounded-md border border-amber-500/30 bg-amber-50/70 px-3 py-3 text-[length:var(--fs-12)] text-amber-900 dark:bg-amber-500/10 dark:text-amber-300">
          Ο συνεργάτης δεν έχει πελάτες. Σύνδεσε πρώτα πελάτη — τα έργα επιλέγονται από τους πελάτες του.
        </p>
      ) : (
        <FormSection tone="amber" icon={<FiBriefcase />} title="Έργο πελάτη">
          {!editing && (
            <Field label="Πελάτης (φίλτρο)">
              <FormSelect value={customer} onChange={(v) => { setCustomer(v); setPrjc(''); }} opts={[{ id: 'all', name: 'Όλοι οι συνδεδεμένοι' }, ...customerOpts]} placeholder="Όλοι οι συνδεδεμένοι" ariaLabel="Πελάτης" />
            </Field>
          )}
          <Field label="Έργο" required>
            <FormSelect value={prjc} onChange={setPrjc} opts={projectOpts} placeholder={projectOpts.length ? 'Επιλογή έργου…' : 'Κανένα διαθέσιμο έργο'} ariaLabel="Έργο" disabled={editing} />
          </Field>
          <Field label="Ρόλος στο έργο" htmlFor="link-role">
            <Input id="link-role" value={role} onChange={(e) => setRole(e.target.value)} className={fieldCls} placeholder="π.χ. Επιβλέπων μηχανικός" />
          </Field>
          {!editing && projectOpts.length === 0 && <RowHint tone="warn">Όλα τα έργα των πελατών του είναι ήδη συνδεδεμένα ή δεν έχουν έργα.</RowHint>}
        </FormSection>
      )}
    </DialogShell>
  );
}
