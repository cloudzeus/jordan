'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FiInfo, FiUsers, FiUserCheck, FiBriefcase, FiPlus, FiMoreVertical, FiEdit3, FiTrash2, FiStar, FiLink, FiExternalLink,
  FiPhone, FiSmartphone, FiMail, FiGlobe, FiMapPin, FiFileText, FiAlertTriangle, FiRefreshCw, FiCheck, FiSlash,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { confirmAction } from '@/components/ui/confirm-dialog';
import type { PartnerDetail, PartnerListRow } from '@/lib/partners';
import {
  ContactDialog, LinkCustomersDialog, LinkProjectDialog, PartnerFormDialog, type PartnerContactRow,
} from './partner-dialogs';
import { emitPartnerChanged, usePartnerChanged } from './partner-events';
import { AccessDialog, AccessMenuItems, AccessStatus, type AccessUser } from '@/components/admin/portal-access';

const soft = (hex: string, pct: number) => `color-mix(in srgb, ${hex} ${pct}%, var(--background))`;
const TONE = { info: '#0369A1', contacts: '#7C3AED', customers: '#047857', projects: '#B45309' } as const;

const TRIGGER = cn(
  '!h-9 flex-none cursor-pointer gap-1 rounded-none px-2 text-[length:var(--fs-12)] text-muted-foreground sm:gap-1.5 sm:px-3',
  'hover:text-foreground data-[state=active]:font-semibold data-[state=active]:!text-[color:var(--tab-tone)]',
  'after:bg-[var(--tab-tone)] after:!h-[2px] after:!bottom-0',
);
const TH = 'px-1.5 sm:px-2 py-1.5 text-left text-[length:var(--fs-10)] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap';
const TD = 'px-1.5 sm:px-2 py-1.5 text-[length:var(--fs-12)] align-top';
const ITEM = 'cursor-pointer gap-2 text-[length:var(--fs-12)]';
const DASH = <span className="text-muted-foreground/40">—</span>;

function Badge({ n, tone }: { n: number | null; tone: string }) {
  if (n == null) return null;
  return <span className="rounded-full px-1.5 text-[length:var(--fs-10)] font-semibold tabular-nums leading-4" style={{ color: tone, backgroundColor: soft(tone, 14) }}>{n}</span>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-border px-3 py-5 text-center text-[length:var(--fs-12)] text-muted-foreground">{children}</p>;
}

function AddButton({ tone, onClick, children, disabled }: { tone: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[length:var(--fs-12)] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50"
      style={{ color: tone, backgroundColor: soft(tone, 10) }}
    >
      <FiPlus className="size-3.5" aria-hidden /> {children}
    </button>
  );
}

function RowMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted"
        aria-label={label}
      >
        <FiMoreVertical className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Γραμμή «ετικέτα → τιμή» στην καρτέλα Στοιχεία. */
function Info({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2 py-1">
      <span aria-hidden className="mt-0.5 text-muted-foreground [&_svg]:size-3.5">{icon}</span>
      <div className="min-w-0">
        <div className="text-[length:var(--fs-10)] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="break-words text-[length:var(--fs-13)]">{children ?? DASH}</div>
      </div>
    </div>
  );
}

type Dlg =
  | { kind: 'edit' }
  | { kind: 'contact'; contact: PartnerContactRow | null }
  | { kind: 'customers' }
  | { kind: 'project'; preset: { prjc: number; role: string | null } | null }
  | null;

/** Ανοιγμένη γραμμή συνεργάτη: Στοιχεία · Πρόσωπα (εταιρίες) · Πελάτες · Έργα. */
export function PartnerExpandPanel({ row, canManage }: { row: PartnerListRow; canManage: boolean }) {
  const router = useRouter();
  const [data, setData] = React.useState<PartnerDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [dlg, setDlg] = React.useState<Dlg>(null);
  const [access, setAccess] = React.useState<{ self: AccessUser; contacts: Record<string, AccessUser> } | null>(null);
  const [accessDlg, setAccessDlg] = React.useState<{ kind: 'partner-contact' | 'partner'; id: string; name: string; email: string | null; mode: 'grant' | 'password' } | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/partners/${row.id}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Αποτυχία φόρτωσης');
      setData(await res.json());
      const a = await fetch(`/api/admin/partners/${row.id}/access`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      setAccess(a);
    } catch (e) { setError((e as Error).message); }
  }, [row.id]);

  React.useEffect(() => { void load(); }, [load]);
  usePartnerChanged(row.id, () => { void load(); router.refresh(); });

  const closeDlg = (o: boolean) => { if (!o) setDlg(null); };

  const act = async (url: string, method: string, ok: string, body?: unknown) => {
    const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(d.message ?? 'Η ενέργεια απέτυχε'); return; }
    toast.success(typeof ok === 'string' ? ok : 'OK');
    emitPartnerChanged(row.id);
  };

  if (error && !data) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[length:var(--fs-12)]">
        <FiAlertTriangle className="size-4 text-destructive" aria-hidden /><span className="flex-1">{error}</span>
        <button type="button" onClick={load} className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-border bg-background px-2.5 hover:bg-muted"><FiRefreshCw className="size-3.5" aria-hidden /> Δοκιμή ξανά</button>
      </div>
    );
  }
  if (!data) return <div className="h-40 animate-pulse rounded-md bg-muted motion-reduce:animate-none" aria-busy="true" aria-label="Φόρτωση" />;

  const p = data.partner;
  const company = p.type === 'COMPANY';
  const primary = data.contacts.find((c) => c.isPrimary);

  return (
    <>
      <Tabs defaultValue="details" className="gap-3">
        <div className="flex items-center gap-2 border-b border-border">
          <TabsList variant="line" className="!h-auto min-h-9 flex-wrap min-w-0 flex-1 justify-start gap-0 p-0">
            <TabsTrigger value="details" className={TRIGGER} style={{ ['--tab-tone' as string]: TONE.info }}><FiInfo className="hidden size-3.5 sm:inline" aria-hidden /> Στοιχεία</TabsTrigger>
            {company && (
              <TabsTrigger value="contacts" className={TRIGGER} style={{ ['--tab-tone' as string]: TONE.contacts }}><FiUsers className="hidden size-3.5 sm:inline" aria-hidden /> Πρόσωπα <Badge n={data.contacts.length} tone={TONE.contacts} /></TabsTrigger>
            )}
            <TabsTrigger value="customers" className={TRIGGER} style={{ ['--tab-tone' as string]: TONE.customers }}><FiUserCheck className="hidden size-3.5 sm:inline" aria-hidden /> Πελάτες <Badge n={data.customers.length} tone={TONE.customers} /></TabsTrigger>
            <TabsTrigger value="projects" className={TRIGGER} style={{ ['--tab-tone' as string]: TONE.projects }}><FiBriefcase className="hidden size-3.5 sm:inline" aria-hidden /> Έργα <Badge n={data.projects.length} tone={TONE.projects} /></TabsTrigger>
          </TabsList>
        </div>

        {/* ── Στοιχεία ─────────────────────────────────────────────────────────────── */}
        <TabsContent value="details" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: soft(TONE.info, 30), backgroundColor: soft(TONE.info, 5) }}>
            <span className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[length:var(--fs-11)] font-semibold" style={{ color: company ? TONE.info : TONE.contacts, backgroundColor: soft(company ? TONE.info : TONE.contacts, 14) }}>
              {company ? <FiBriefcase className="size-3" aria-hidden /> : <FiUsers className="size-3" aria-hidden />}
              {company ? 'Εταιρία' : 'Φυσικό πρόσωπο'}
            </span>
            <span className="min-w-0 truncate text-[length:var(--fs-14)] font-semibold">{p.name}</span>
            {p.tradeName && <span className="truncate text-[length:var(--fs-12)] text-muted-foreground">«{p.tradeName}»</span>}
            {p.specialty && <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[length:var(--fs-11)]">{p.specialty}</span>}
            <span className={cn('ml-auto inline-flex items-center gap-1 text-[length:var(--fs-12)]', !p.isActive && 'text-muted-foreground')} style={p.isActive ? { color: '#047857' } : undefined}>
              {p.isActive ? <><FiCheck className="size-3.5" aria-hidden /> Ενεργός</> : <><FiSlash className="size-3.5" aria-hidden /> Ανενεργός</>}
            </span>
            {canManage && (
              <button type="button" onClick={() => setDlg({ kind: 'edit' })} className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-[length:var(--fs-12)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <FiEdit3 className="size-3.5" aria-hidden /> Επεξεργασία
              </button>
            )}
          </div>
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            <Info icon={<FiFileText />} label="ΑΦΜ · Δ.Ο.Υ.">{p.afm ? <span className="tabular-nums">{p.afm}{p.doy ? ` · ${p.doy}` : ''}</span> : null}</Info>
            <Info icon={<FiMapPin />} label="Διεύθυνση">{[p.address, [p.zip, p.city].filter(Boolean).join(' '), p.country && p.country !== 'GR' ? p.country : null].filter(Boolean).join(', ') || null}</Info>
            <Info icon={<FiPhone />} label="Τηλέφωνο">{p.phone ? <a className="tabular-nums hover:underline" href={`tel:${p.phone}`}>{p.phone}</a> : null}</Info>
            <Info icon={<FiSmartphone />} label="Κινητό">{p.mobile ? <a className="tabular-nums hover:underline" href={`tel:${p.mobile}`}>{p.mobile}</a> : null}</Info>
            <Info icon={<FiMail />} label="Email">{p.email ? <a className="hover:underline" href={`mailto:${p.email}`}>{p.email}</a> : null}</Info>
            <Info icon={<FiGlobe />} label="Ιστότοπος">{p.website ? <a className="hover:underline" href={p.website} target="_blank" rel="noreferrer">{p.website.replace(/^https?:\/\//, '')}</a> : null}</Info>
            {company && <Info icon={<FiStar />} label="Κύριο πρόσωπο">{primary ? `${primary.name}${primary.role ? ` · ${primary.role}` : ''}` : null}</Info>}
          </div>
          {p.notes && <p className="whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-[length:var(--fs-12)]">{p.notes}</p>}
          {!company && (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
              <span className="text-[length:var(--fs-12)] font-semibold">Πρόσβαση στην πλατφόρμα</span>
              <AccessStatus user={access?.self ?? null} />
              {canManage && (
                <span className="ml-auto">
                  <RowMenu label="Ενέργειες πρόσβασης">
                    <AccessMenuItems kind="partner" holderId={p.id} holderName={p.name} user={access?.self ?? null}
                      onGrant={() => setAccessDlg({ kind: 'partner', id: p.id, name: p.name, email: p.email, mode: 'grant' })}
                      onPassword={() => setAccessDlg({ kind: 'partner', id: p.id, name: p.name, email: p.email, mode: 'password' })}
                      onChanged={() => void load()} />
                  </RowMenu>
                </span>
              )}
            </div>
          )}
          <p className="text-[length:var(--fs-11)] text-muted-foreground">
            Καταχώριση {new Date(p.createdAt).toLocaleDateString('el-GR')} · τελευταία αλλαγή {new Date(p.updatedAt).toLocaleString('el-GR')}
          </p>
        </TabsContent>

        {/* ── Πρόσωπα ──────────────────────────────────────────────────────────────── */}
        {company && (
          <TabsContent value="contacts" className="space-y-2">
            {canManage && <div className="flex justify-end"><AddButton tone={TONE.contacts} onClick={() => setDlg({ kind: 'contact', contact: null })}>Νέο πρόσωπο</AddButton></div>}
            {data.contacts.length === 0 ? <Empty>Δεν έχουν καταχωριστεί πρόσωπα επικοινωνίας.</Empty> : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full">
                  <thead className="bg-muted/40"><tr>
                    <th className={TH}>Ονοματεπώνυμο</th><th className={TH}>Ιδιότητα</th>
                    <th className={cn(TH, 'hidden md:table-cell')}>Τηλέφωνα</th><th className={cn(TH, 'hidden sm:table-cell')}>Email</th><th className={TH}>Πρόσβαση</th>
                    {canManage && <th className={TH}><span className="sr-only">Ενέργειες</span></th>}
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {data.contacts.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/30">
                        <td className={TD}>
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            {c.isPrimary && <FiStar className="size-3.5 shrink-0 fill-current" style={{ color: TONE.projects }} aria-label="Κύριο πρόσωπο" />}
                            {c.name}
                          </span>
                          {c.notes && <div className="text-[length:var(--fs-11)] text-muted-foreground">{c.notes}</div>}
                        </td>
                        <td className={TD}>{c.role ? <span className="rounded-sm px-1.5 py-0.5 text-[length:var(--fs-11)] font-medium" style={{ color: TONE.contacts, backgroundColor: soft(TONE.contacts, 10) }}>{c.role}</span> : DASH}</td>
                        <td className={cn(TD, 'hidden tabular-nums md:table-cell')}>
                          {[c.phone, c.mobile].filter(Boolean).map((t) => <a key={t} href={`tel:${t}`} className="block hover:underline">{t}</a>)}
                          {!c.phone && !c.mobile && DASH}
                        </td>
                        <td className={cn(TD, 'hidden sm:table-cell')}>{c.email ? <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a> : DASH}</td>
                        <td className={TD}><AccessStatus user={access?.contacts[c.id] ?? null} compact /></td>
                        {canManage && (
                          <td className={cn(TD, 'w-10 text-right')}>
                            <RowMenu label={`Ενέργειες για ${c.name}`}>
                              <DropdownMenuItem className={ITEM} onSelect={() => setDlg({ kind: 'contact', contact: c })}><FiEdit3 className="size-3.5" aria-hidden /> Επεξεργασία</DropdownMenuItem>
                              {!c.isPrimary && (
                                <DropdownMenuItem className={ITEM} onSelect={() => act(`/api/admin/partners/${p.id}/contacts/${c.id}`, 'PUT', `Κύριο πρόσωπο: ${c.name}`, { ...c, isPrimary: true })}>
                                  <FiStar className="size-3.5" aria-hidden /> Ορισμός ως κύριο
                                </DropdownMenuItem>
                              )}
                              <AccessMenuItems kind="partner-contact" holderId={c.id} holderName={c.name} user={access?.contacts[c.id] ?? null}
                                onGrant={() => setAccessDlg({ kind: 'partner-contact', id: c.id, name: c.name, email: c.email, mode: 'grant' })}
                                onPassword={() => setAccessDlg({ kind: 'partner-contact', id: c.id, name: c.name, email: c.email, mode: 'password' })}
                                onChanged={() => void load()} />
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className={cn(ITEM, 'text-destructive focus:text-destructive')}
                                onSelect={async () => { if (await confirmAction(`Διαγραφή του προσώπου «${c.name}»;${access?.contacts[c.id] ? ' Διαγράφεται και η πρόσβασή του.' : ''}`)) await act(`/api/admin/partners/${p.id}/contacts/${c.id}`, 'DELETE', 'Το πρόσωπο διαγράφηκε'); }}
                              >
                                <FiTrash2 className="size-3.5" aria-hidden /> Διαγραφή
                              </DropdownMenuItem>
                            </RowMenu>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        )}

        {/* ── Πελάτες ──────────────────────────────────────────────────────────────── */}
        <TabsContent value="customers" className="space-y-2">
          {canManage && <div className="flex justify-end"><AddButton tone={TONE.customers} onClick={() => setDlg({ kind: 'customers' })}>Σύνδεση πελατών</AddButton></div>}
          {data.customers.length === 0 ? <Empty>Δεν έχει συνδεθεί με πελάτες.</Empty> : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full">
                <thead className="bg-muted/40"><tr>
                  <th className={cn(TH, 'hidden sm:table-cell')}>Κωδικός</th><th className={TH}>Πελάτης</th>
                  <th className={cn(TH, 'hidden md:table-cell')}>ΑΦΜ</th><th className={cn(TH, 'hidden md:table-cell')}>Πόλη</th>
                  <th className={cn(TH, 'text-right')}>Έργα</th>
                  {canManage && <th className={TH}><span className="sr-only">Ενέργειες</span></th>}
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {data.customers.map((c) => {
                    const linkedHere = data.projects.filter((x) => x.trdr === c.trdr).length;
                    return (
                      <tr key={c.trdr} className="hover:bg-muted/30">
                        <td className={cn(TD, 'hidden font-mono tabular-nums text-muted-foreground sm:table-cell')}>{c.code ?? DASH}</td>
                        <td className={cn(TD, 'font-medium')}>{c.name}</td>
                        <td className={cn(TD, 'hidden tabular-nums md:table-cell')}>{c.afm ?? DASH}</td>
                        <td className={cn(TD, 'hidden md:table-cell')}>{c.city ?? DASH}</td>
                        <td className={cn(TD, 'text-right tabular-nums')}>
                          <span style={{ color: linkedHere ? TONE.projects : undefined }}>{linkedHere}</span>
                          <span className="text-muted-foreground"> / {c.projectCount}</span>
                        </td>
                        {canManage && (
                          <td className={cn(TD, 'w-10 text-right')}>
                            <RowMenu label={`Ενέργειες για ${c.name}`}>
                              <DropdownMenuItem className={ITEM} disabled={c.projectCount === 0} onSelect={() => setDlg({ kind: 'project', preset: null })}>
                                <FiBriefcase className="size-3.5" style={{ color: TONE.projects }} aria-hidden /> Σύνδεση με έργο
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className={cn(ITEM, 'text-destructive focus:text-destructive')}
                                onSelect={async () => {
                                  const extra = linkedHere ? `\nΘα αποσυνδεθούν και ${linkedHere} έργα του.` : '';
                                  if (await confirmAction({ message: `Αποσύνδεση του πελάτη «${c.name}»;${extra}`, destructive: true })) {
                                    await act(`/api/admin/partners/${p.id}/customers/${c.trdr}`, 'DELETE', 'Ο πελάτης αποσυνδέθηκε');
                                  }
                                }}
                              >
                                <FiTrash2 className="size-3.5" aria-hidden /> Αποσύνδεση
                              </DropdownMenuItem>
                            </RowMenu>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[length:var(--fs-11)] text-muted-foreground">«Έργα» = συνδεδεμένα με τον συνεργάτη / σύνολο έργων του πελάτη.</p>
        </TabsContent>

        {/* ── Έργα ─────────────────────────────────────────────────────────────────── */}
        <TabsContent value="projects" className="space-y-2">
          {canManage && (
            <div className="flex justify-end">
              <AddButton tone={TONE.projects} onClick={() => setDlg({ kind: 'project', preset: null })} disabled={data.customers.length === 0}>Σύνδεση με έργο</AddButton>
            </div>
          )}
          {data.projects.length === 0 ? (
            <Empty>{data.customers.length === 0 ? 'Σύνδεσε πρώτα πελάτη — τα έργα επιλέγονται από τους πελάτες του.' : 'Δεν έχει συνδεθεί με έργα.'}</Empty>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full">
                <thead className="bg-muted/40"><tr>
                  <th className={cn(TH, 'hidden sm:table-cell')}>Κωδικός</th><th className={TH}>Έργο</th>
                  <th className={cn(TH, 'hidden md:table-cell')}>Πελάτης</th><th className={TH}>Ρόλος</th>
                  {canManage && <th className={TH}><span className="sr-only">Ενέργειες</span></th>}
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {data.projects.map((x) => (
                    <tr key={x.prjc} className="hover:bg-muted/30">
                      <td className={cn(TD, 'hidden font-mono tabular-nums text-muted-foreground sm:table-cell')}>{x.code ?? DASH}</td>
                      <td className={TD}>
                        <Link href={`/admin/projects/${x.prjc}`} className="font-medium hover:text-primary hover:underline">{x.name}</Link>
                        {!x.isActive && <span className="ml-1.5 text-[length:var(--fs-11)] text-muted-foreground">(ανενεργό)</span>}
                      </td>
                      <td className={cn(TD, 'hidden md:table-cell')}>{x.customer ?? DASH}</td>
                      <td className={TD}>{x.role ? <span className="rounded-sm px-1.5 py-0.5 text-[length:var(--fs-11)] font-medium" style={{ color: TONE.projects, backgroundColor: soft(TONE.projects, 10) }}>{x.role}</span> : DASH}</td>
                      {canManage && (
                        <td className={cn(TD, 'w-10 text-right')}>
                          <RowMenu label={`Ενέργειες για ${x.name}`}>
                            <DropdownMenuItem className={ITEM} onSelect={() => setDlg({ kind: 'project', preset: { prjc: x.prjc, role: x.role } })}><FiEdit3 className="size-3.5" aria-hidden /> Αλλαγή ρόλου</DropdownMenuItem>
                            <DropdownMenuItem className={ITEM} onSelect={() => router.push(`/admin/projects/${x.prjc}`)}><FiExternalLink className="size-3.5" aria-hidden /> Άνοιγμα έργου</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className={cn(ITEM, 'text-destructive focus:text-destructive')}
                              onSelect={async () => { if (await confirmAction({ message: `Αποσύνδεση από το έργο «${x.name}»;`, destructive: true })) await act(`/api/admin/partners/${p.id}/projects/${x.prjc}`, 'DELETE', 'Το έργο αποσυνδέθηκε'); }}
                            >
                              <FiLink className="size-3.5" aria-hidden /> Αποσύνδεση
                            </DropdownMenuItem>
                          </RowMenu>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {canManage && (
        <>
          <PartnerFormDialog open={dlg?.kind === 'edit'} onOpenChange={closeDlg} partnerId={dlg?.kind === 'edit' ? p.id : null} />
          <ContactDialog open={dlg?.kind === 'contact'} onOpenChange={closeDlg} partnerId={p.id} partnerName={p.name} contact={dlg?.kind === 'contact' ? dlg.contact : null} />
          <LinkCustomersDialog open={dlg?.kind === 'customers'} onOpenChange={closeDlg} partnerId={p.id} partnerName={p.name} />
          {accessDlg && (
            <AccessDialog open onOpenChange={(o) => { if (!o) setAccessDlg(null); }} kind={accessDlg.kind} holderId={accessDlg.id}
              holderName={accessDlg.kind === 'partner' ? accessDlg.name : `${accessDlg.name} · ${p.name}`} defaultEmail={accessDlg.email} mode={accessDlg.mode}
              onDone={() => void load()} />
          )}
          <LinkProjectDialog open={dlg?.kind === 'project'} onOpenChange={closeDlg} partnerId={p.id} partnerName={p.name} presetPrjc={dlg?.kind === 'project' ? dlg.preset : null} />
        </>
      )}
    </>
  );
}
