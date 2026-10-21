'use client';

// Καρτέλα πελάτη → «Πρόσωπα & πρόσβαση»: πρόσωπα επικοινωνίας του πελάτη (τοπικά) και, ανά πρόσωπο,
// πρόσβαση στην πλατφόρμα (χρήστης CUSTOMER με κωδικό). Όλες οι ενέργειες από το μενού ⋮.
import * as React from 'react';
import { FiPlus, FiMoreVertical, FiEdit3, FiTrash2, FiStar, FiUser, FiPhone, FiLoader, FiCheck, FiKey } from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field, FormSection, fieldCls } from '@/components/admin/form-kit';
import { AccessDialog, AccessMenuItems, AccessStatus, type AccessUser } from '@/components/admin/portal-access';

type Contact = { id: string; name: string; role: string | null; phone: string | null; mobile: string | null; email: string | null; notes: string | null; isPrimary: boolean; user: AccessUser };

const TH = 'px-2 py-1.5 text-left text-(length:--fs-10) font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap';
const TD = 'px-2 py-1.5 text-(length:--fs-12) align-top';
const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';

/** Σύγκριση λιστών εξαρτήσεων όπως τα deps των hooks (`Object.is` ανά θέση). */
const depsChanged = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length !== b.length || a.some((x, i) => !Object.is(x, b[i]));

function ContactDialog({ open, onOpenChange, trdr, customer, contact, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; trdr: number; customer: string; contact: Contact | null; onSaved: (c: { id: string; name: string; email: string | null }, wantsAccess: boolean) => void;
}) {
  const [f, setF] = React.useState({ name: '', role: '', phone: '', mobile: '', email: '', notes: '', isPrimary: false });
  const [access, setAccess] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  // Reset της φόρμας στο άνοιγμα — «adjust state while rendering» (αρχικό `[]` ⇒ και στο πρώτο render).
  const [prevDeps, setPrevDeps] = React.useState<readonly unknown[]>([]);
  if (depsChanged(prevDeps, [open, contact])) {
    setPrevDeps([open, contact]);
    if (open) {
      setF({ name: contact?.name ?? '', role: contact?.role ?? '', phone: contact?.phone ?? '', mobile: contact?.mobile ?? '', email: contact?.email ?? '', notes: contact?.notes ?? '', isPrimary: contact?.isPrimary ?? false });
      setAccess(false);
    }
  }
  const inp = (k: 'name' | 'role' | 'phone' | 'mobile' | 'email' | 'notes') => ({ id: `cc-${k}`, value: f[k], className: fieldCls, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value })) });
  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(contact ? `/api/admin/traders/${trdr}/contacts/${contact.id}` : `/api/admin/traders/${trdr}/contacts`, {
        method: contact ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message ?? 'Η αποθήκευση απέτυχε');
      toast.success(contact ? 'Το πρόσωπο ενημερώθηκε' : `Προστέθηκε: ${f.name}`);
      onSaved({ id: d.contact.id, name: d.contact.name, email: d.contact.email }, access && !contact);
      onOpenChange(false);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex max-h-[92dvh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-4 py-2.5 pr-12 text-left">
          <DialogTitle className="text-(length:--fs-15)">{contact ? 'Επεξεργασία προσώπου' : 'Νέο πρόσωπο επικοινωνίας'}</DialogTitle>
          <DialogDescription className="truncate text-(length:--fs-11)">{customer}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3 bg-muted/20 px-4 py-3">
          <FormSection tone="violet" icon={<FiUser />} title="Πρόσωπο">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Field label="Ονοματεπώνυμο" required htmlFor="cc-name"><Input {...inp('name')} autoFocus /></Field>
              <Field label="Ιδιότητα" htmlFor="cc-role"><Input {...inp('role')} placeholder="π.χ. Υπεύθυνος αγορών" /></Field>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-(length:--fs-12)">
              <input type="checkbox" className="size-4 accent-[#7C3AED]" checked={f.isPrimary} onChange={(e) => setF((s) => ({ ...s, isPrimary: e.target.checked }))} /> Κύριο πρόσωπο επικοινωνίας
            </label>
          </FormSection>
          <FormSection tone="emerald" icon={<FiPhone />} title="Επικοινωνία">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Field label="Τηλέφωνο" htmlFor="cc-phone"><Input {...inp('phone')} type="tel" /></Field>
              <Field label="Κινητό" htmlFor="cc-mobile"><Input {...inp('mobile')} type="tel" /></Field>
            </div>
            <Field label="Email" htmlFor="cc-email"><Input {...inp('email')} type="email" /></Field>
            <Field label="Σημειώσεις" htmlFor="cc-notes"><Input {...inp('notes')} /></Field>
          </FormSection>
          {!contact && (
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-sisyphus-500/30 bg-sisyphus-50/50 px-3 py-2 text-(length:--fs-12) dark:bg-sisyphus-500/10">
              <input type="checkbox" className="mt-0.5 size-4 accent-[#0369A1]" checked={access} onChange={(e) => setAccess(e.target.checked)} />
              <span><strong>Και πρόσβαση στην πλατφόρμα</strong> — μετά την αποθήκευση ανοίγει το παράθυρο κωδικού.</span>
            </label>
          )}
        </DialogBody>
        <DialogFooter className="mx-0 mb-0 items-center gap-2 border-t border-border bg-card px-4 py-2.5">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
          <Button size="sm" onClick={save} disabled={busy || !f.name.trim()}>{busy ? <FiLoader className="mr-1.5 size-3.5 animate-spin" /> : <FiCheck className="mr-1.5 size-3.5" />}Αποθήκευση</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CustomerContactsPanel({ trdr, customer, defaultEmail, canManage, onCount }: {
  trdr: number; customer: string; defaultEmail?: string | null; canManage: boolean; onCount?: (n: number) => void;
}) {
  const [rows, setRows] = React.useState<Contact[] | null>(null);
  const [edit, setEdit] = React.useState<{ contact: Contact | null } | null>(null);
  const [access, setAccess] = React.useState<{ id: string; name: string; email: string | null; mode: 'grant' | 'password' } | null>(null);
  const load = React.useCallback(() => {
    fetch(`/api/admin/traders/${trdr}/contacts`, { cache: 'no-store' }).then((r) => r.json()).then((d) => { setRows(d.contacts ?? []); onCount?.((d.contacts ?? []).length); }).catch(() => toast.error('Αποτυχία φόρτωσης προσώπων'));
  }, [trdr, onCount]);
  React.useEffect(() => { load(); }, [load]);

  const remove = async (c: Contact) => {
    if (!(await confirmAction({ title: 'Διαγραφή προσώπου', message: `Διαγραφή του «${c.name}»;${c.user ? ` Διαγράφεται και ο χρήστης ${c.user.email} — η πρόσβασή του κόβεται.` : ''}`, confirmLabel: 'Διαγραφή', destructive: true }))) return;
    const res = await fetch(`/api/admin/traders/${trdr}/contacts/${c.id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Το πρόσωπο διαγράφηκε'); load(); } else toast.error((await res.json().catch(() => ({}))).message ?? 'Αποτυχία');
  };
  const makePrimary = async (c: Contact) => {
    const res = await fetch(`/api/admin/traders/${trdr}/contacts/${c.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...c, isPrimary: true }) });
    if (res.ok) { toast.success(`Κύριο πρόσωπο: ${c.name}`); load(); }
  };

  return (
    <div className="space-y-2">
      {canManage && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-(length:--fs-11) text-muted-foreground">Τα πρόσωπα με <strong>πρόσβαση</strong> συνδέονται στην πλατφόρμα και βλέπουν τις προσφορές που τους αφορούν.</p>
          <Button size="sm" onClick={() => setEdit({ contact: null })}><FiPlus className="mr-1 size-3.5" aria-hidden /> Νέο πρόσωπο</Button>
        </div>
      )}
      {!rows ? <div className="h-20 animate-pulse rounded-md bg-muted motion-reduce:animate-none" /> : rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-5 text-center text-(length:--fs-12) text-muted-foreground">Δεν υπάρχουν πρόσωπα επικοινωνίας. Πρόσθεσε ένα για να του δώσεις πρόσβαση.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full">
            <thead className="bg-muted/40"><tr>
              <th className={TH}>Πρόσωπο</th><th className={cn(TH, 'hidden md:table-cell')}>Επικοινωνία</th><th className={TH}>Πρόσβαση</th>
              {canManage && <th className={TH}><span className="sr-only">Ενέργειες</span></th>}
            </tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className={TD}>
                    <span className="inline-flex items-center gap-1.5 font-medium">{c.isPrimary && <FiStar className="size-3.5 fill-current text-amber-600" aria-label="Κύριο πρόσωπο" />}{c.name}</span>
                    {c.role && <div className="text-(length:--fs-11) text-muted-foreground">{c.role}</div>}
                  </td>
                  <td className={cn(TD, 'hidden md:table-cell')}>
                    {[c.mobile, c.phone].filter(Boolean).map((t) => <a key={t} href={`tel:${t}`} className="block tabular-nums hover:underline">{t}</a>)}
                    {c.email && <a href={`mailto:${c.email}`} className="block text-muted-foreground hover:underline">{c.email}</a>}
                  </td>
                  <td className={TD}><AccessStatus user={c.user} /></td>
                  {canManage && (
                    <td className={cn(TD, 'w-10 text-right')}>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ενέργειες για ${c.name}`}><FiMoreVertical className="size-4" aria-hidden /></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-60">
                          <DropdownMenuItem className={ITEM} onSelect={() => setEdit({ contact: c })}><FiEdit3 className="size-3.5" aria-hidden /> Επεξεργασία</DropdownMenuItem>
                          {!c.isPrimary && <DropdownMenuItem className={ITEM} onSelect={() => makePrimary(c)}><FiStar className="size-3.5" aria-hidden /> Ορισμός ως κύριο</DropdownMenuItem>}
                          <AccessMenuItems kind="customer-contact" holderId={c.id} holderName={c.name} user={c.user}
                            onGrant={() => setAccess({ id: c.id, name: c.name, email: c.email, mode: 'grant' })}
                            onPassword={() => setAccess({ id: c.id, name: c.name, email: c.email, mode: 'password' })}
                            onChanged={load} />
                          <DropdownMenuItem variant="destructive" className={ITEM} onSelect={() => remove(c)}><FiTrash2 className="size-3.5" aria-hidden /> Διαγραφή προσώπου</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows && rows.some((r) => r.user) && <p className="flex items-center gap-1 text-(length:--fs-11) text-muted-foreground"><FiKey className="size-3" aria-hidden /> Σύνδεση στο {typeof window !== 'undefined' ? window.location.origin : ''}/auth/signin</p>}
      {canManage && (
        <>
          <ContactDialog open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null); }} trdr={trdr} customer={customer} contact={edit?.contact ?? null}
            onSaved={(c, wants) => { load(); if (wants) setAccess({ id: c.id, name: c.name, email: c.email ?? defaultEmail ?? null, mode: 'grant' }); }} />
          {access && (
            <AccessDialog open onOpenChange={(o) => { if (!o) setAccess(null); }} kind="customer-contact" holderId={access.id} holderName={`${access.name} · ${customer}`}
              defaultEmail={access.email} mode={access.mode} onDone={load} />
          )}
        </>
      )}
    </div>
  );
}
