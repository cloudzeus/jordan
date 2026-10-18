'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  FiInfo, FiBookOpen, FiBriefcase, FiShoppingBag, FiFileText, FiShield, FiGlobe, FiEdit3, FiAlertTriangle,
  FiRefreshCw, FiCheckCircle, FiMapPin, FiPhone, FiMail, FiLink, FiHash, FiArrowDownLeft, FiArrowUpRight, FiUsers,
  FiMap, FiExternalLink, FiNavigation,
} from 'react-icons/fi';
import { formatCoords, validCoords } from '@/lib/coords';
import { TraderPointMap } from '@/components/admin/trader-point-map';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TraderDocsPanel } from '@/components/admin/trader-docs-panel';
import { CustomerContactsPanel } from '@/components/admin/customer-contacts-panel';
import type { TraderRecord } from '@/components/admin/traders-view';
import type { TraderDialogMode } from '@/components/admin/trader-edit-dialog';
import type { TraderActivity, TraderDoc } from '@/lib/trader-activity';

const eur = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' });
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString('el-GR', { timeZone: 'UTC' }) : '—');
const soft = (hex: string, pct: number) => `color-mix(in srgb, ${hex} ${pct}%, var(--background))`;

const TONE = { info: '#0369A1', people: '#BE185D', map: '#0F766E', ledger: '#047857', projects: '#7C3AED', orders: '#B45309', scans: '#475569' } as const;
const DOC_TONE: Record<string, string> = {
  invoice: '#B45309', credit: '#BE123C', payment: '#047857', order: '#0369A1', quote: '#7C3AED', movement: '#475569', other: '#475569',
};

const TRIGGER = cn(
  '!h-9 flex-none cursor-pointer gap-1 rounded-none px-2 text-[length:var(--fs-12)] text-muted-foreground sm:gap-1.5 sm:px-3',
  'hover:text-foreground data-[state=active]:font-semibold data-[state=active]:!text-[color:var(--tab-tone)]',
  'after:bg-[var(--tab-tone)] after:!h-[2px] after:!bottom-0',
);
const TH = 'px-1.5 sm:px-2 py-1.5 text-left text-[length:var(--fs-10)] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap';
const TD = 'px-1.5 sm:px-2 py-1.5 text-[length:var(--fs-12)] align-top';
const NUM = 'text-right tabular-nums whitespace-nowrap';

/** Ξένος ΑΦΜ = πρόθεμα χώρας (εκτός EL/GR). Ίδιος κανόνας με τη λίστα. */
const foreignAfm = (afm: string | null) => !!afm && /^[A-Z]{2,3}\d/i.test(afm.replace(/[\s.-]/g, '')) && !/^(EL|GR)/i.test(afm.trim());
const greekAfm = (afm: string | null) => !!afm && /^\d{9}$/.test(afm.replace(/\D/g, ''));

function Badge({ n, tone }: { n: number | null; tone: string }) {
  if (n == null) return null;
  return <span className="rounded-full px-1.5 text-[length:var(--fs-10)] font-semibold tabular-nums leading-4" style={{ color: tone, backgroundColor: soft(tone, 14) }}>{n}</span>;
}

function Skeleton({ h = 'h-32' }: { h?: string }) {
  return <div className={cn(h, 'animate-pulse rounded-md bg-muted motion-reduce:animate-none')} aria-busy="true" aria-label="Φόρτωση από το SoftOne" />;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-border px-3 py-5 text-center text-[length:var(--fs-12)] text-muted-foreground">{children}</p>;
}

function KindChip({ d }: { d: TraderDoc }) {
  const t = DOC_TONE[d.kind] ?? '#475569';
  return <span className="rounded-sm px-1 text-[length:var(--fs-10)] font-semibold" style={{ color: t, backgroundColor: soft(t, 12) }}>{d.kindLabel}</span>;
}

/* ───────────────────────── Στοιχεία ───────────────────────── */

function DetailsTab({ t, canManage, onAction }: { t: TraderRecord; canManage: boolean; onAction: (m: TraderDialogMode) => void }) {
  const foreign = foreignAfm(t.afm);
  const greek = !foreign && greekAfm(t.afm);
  const row = (icon: React.ReactNode, label: string, value: React.ReactNode) => (
    <div className="flex min-w-0 items-start gap-2">
      <span className="mt-0.5 text-muted-foreground [&_svg]:size-3.5" aria-hidden>{icon}</span>
      <div className="min-w-0">
        <p className="text-[length:var(--fs-10)] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="break-words text-[length:var(--fs-12)] text-foreground">{value || <span className="text-muted-foreground/50">—</span>}</p>
      </div>
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
        <FiHash className="size-4 text-muted-foreground" aria-hidden />
        <span className="font-mono text-[length:var(--fs-13)] font-semibold tabular-nums text-foreground">{t.afm || 'Χωρίς ΑΦΜ'}</span>
        <span
          className="rounded-full px-2 py-0.5 text-[length:var(--fs-10)] font-semibold"
          style={{ color: greek ? '#0369A1' : foreign ? '#7C3AED' : '#B45309', backgroundColor: soft(greek ? '#0369A1' : foreign ? '#7C3AED' : '#B45309', 12) }}
        >
          {greek ? 'Ελληνικός ΑΦΜ — ΑΑΔΕ' : foreign ? 'Ξένος ΑΦΜ — VIES' : 'Μη έγκυρος / χωρίς ΑΦΜ'}
        </span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {greek && (
            <button type="button" onClick={() => onAction('aade')} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[length:var(--fs-12)] font-medium text-white transition-opacity duration-150 hover:opacity-90" style={{ backgroundColor: '#0369A1' }}>
              <FiShield className="size-3.5" aria-hidden /> Επικαιροποίηση από ΑΑΔΕ
            </button>
          )}
          {foreign && (
            <button type="button" onClick={() => onAction('vies')} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[length:var(--fs-12)] font-medium text-white transition-opacity duration-150 hover:opacity-90" style={{ backgroundColor: '#7C3AED' }}>
              <FiGlobe className="size-3.5" aria-hidden /> Έλεγχος VIES
            </button>
          )}
          {canManage && (
            <button type="button" onClick={() => onAction('edit')} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-3 text-[length:var(--fs-12)] font-medium hover:bg-muted">
              <FiEdit3 className="size-3.5" aria-hidden /> Τροποποίηση
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-x-4 gap-y-3 rounded-md border border-border bg-background px-3 py-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {row(<FiInfo />, 'Επωνυμία', t.name)}
        {row(<FiShield />, 'ΔΟΥ', t.doy)}
        {row(<FiBriefcase />, 'Επάγγελμα', t.profession)}
        {row(<FiMapPin />, 'Διεύθυνση', [t.address, t.zip, t.city, t.district].filter(Boolean).join(', '))}
        {row(<FiPhone />, 'Τηλέφωνα', [t.phone, t.phone2].filter(Boolean).join(' · '))}
        {row(<FiMail />, 'Email', t.email ? <a href={`mailto:${t.email}`} className="text-primary hover:underline">{t.email}</a> : null)}
        {row(<FiLink />, 'Ιστοσελίδα', t.webpage ? <a href={/^https?:/i.test(t.webpage) ? t.webpage : `https://${t.webpage}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{t.webpage}</a> : null)}
        {row(<FiHash />, 'Κωδικός SoftOne', <span className="font-mono">{t.code}</span>)}
        {row(<FiInfo />, 'Τύπος', t.kind)}
      </div>
      <p className="text-[length:var(--fs-11)] text-muted-foreground">
        {greek ? 'Η επικαιροποίηση φέρνει επωνυμία, ΔΟΥ, διεύθυνση και δραστηριότητα από το μητρώο της ΑΑΔΕ και ζητά επιβεβαίωση πριν γράψει στο SoftOne.'
          : foreign ? 'Ο έλεγχος VIES επιβεβαιώνει ότι ο ευρωπαϊκός ΑΦΜ είναι ενεργός και δίνει την επίσημη επωνυμία και διεύθυνση.'
            : 'Για επικαιροποίηση χρειάζεται έγκυρος ΑΦΜ — ελληνικός (ΑΑΔΕ) ή με πρόθεμα χώρας ΕΕ (VIES).'}
      </p>
    </div>
  );
}

/* ───────────────────────── Καρτέλα ───────────────────────── */

type LedgerFilter = 'all' | 'invoice' | 'payment' | 'credit';

function LedgerTab({ data }: { data: TraderActivity }) {
  const [f, setF] = React.useState<LedgerFilter>('all');
  const customer = data.side === 'customer';
  const bal = data.softone.balance;
  // Θετικό = χρεωστικό. Πελάτης χρεωστικός → μας οφείλει· προμηθευτής πιστωτικός → του οφείλουμε.
  const meaning = bal === 0 ? 'Εξοφλημένος'
    : customer ? (bal > 0 ? 'Μας οφείλει' : 'Πιστωτικό υπόλοιπο (προκαταβολή)')
      : (bal < 0 ? 'Του οφείλουμε' : 'Χρεωστικό υπόλοιπο (προκαταβολή)');
  const owed = customer ? bal > 0 : bal < 0;
  const balTone = bal === 0 ? '#047857' : owed ? '#B45309' : '#0369A1';
  const rows = data.ledger.filter((d) => f === 'all' || (f === 'payment' ? d.kind === 'payment' : d.kind === f));
  const counts = {
    all: data.ledger.length,
    invoice: data.ledger.filter((d) => d.kind === 'invoice').length,
    payment: data.ledger.filter((d) => d.kind === 'payment').length,
    credit: data.ledger.filter((d) => d.kind === 'credit').length,
  };
  const chip = (k: LedgerFilter, label: string, tone: string) => (
    <button
      key={k} type="button" onClick={() => setF(k)} aria-pressed={f === k}
      className={cn('inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-[length:var(--fs-11)] font-medium transition-colors duration-150', f === k ? 'text-white shadow-sm' : 'border-border bg-background hover:bg-muted')}
      style={f === k ? { backgroundColor: tone, borderColor: tone } : { color: tone }}
    >
      {label} <span className="tabular-nums opacity-80">{counts[k]}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-stretch gap-2">
        <div className="min-w-[11rem] flex-1 rounded-md border px-3 py-2 sm:flex-none" style={{ backgroundColor: soft(balTone, 9), borderColor: soft(balTone, 35), boxShadow: `inset 3px 0 0 ${balTone}` }}>
          <p className="text-[length:var(--fs-11)] font-semibold" style={{ color: balTone }}>Υπόλοιπο · {meaning}</p>
          <p className="text-[length:var(--fs-20)] font-bold tabular-nums text-foreground">{eur.format(Math.abs(bal))}</p>
        </div>
        {[
          [customer ? 'Χρεώσεις (τιμολόγια)' : 'Χρεώσεις (πληρωμές)', data.softone.debit, <FiArrowUpRight key="d" className="size-3.5" aria-hidden />],
          [customer ? 'Πιστώσεις (εισπράξεις)' : 'Πιστώσεις (τιμολόγια)', data.softone.credit, <FiArrowDownLeft key="c" className="size-3.5" aria-hidden />],
        ].map(([label, v, icon]) => (
          <div key={String(label)} className="min-w-[9.5rem] flex-1 rounded-md border border-border bg-background px-3 py-2 sm:flex-none">
            <p className="flex items-center gap-1 text-[length:var(--fs-11)] font-medium text-muted-foreground">{icon} {label}</p>
            <p className="text-[length:var(--fs-14)] font-semibold tabular-nums text-foreground">{eur.format(Number(v))}</p>
          </div>
        ))}
        <div className="min-w-[9.5rem] flex-1 rounded-md border border-border bg-background px-3 py-2 sm:flex-none">
          <p className="text-[length:var(--fs-11)] font-medium text-muted-foreground">{customer ? 'Τελευταία είσπραξη' : 'Τελευταία πληρωμή'}</p>
          <p className="text-[length:var(--fs-14)] font-semibold tabular-nums text-foreground">{data.lastPayment ? eur.format(data.lastPayment.amount) : '—'}</p>
          {data.lastPayment && <p className="text-[length:var(--fs-10)] text-muted-foreground">{fmtDate(data.lastPayment.date)} · {data.lastPayment.fincode}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[length:var(--fs-11)]">
        {data.softone.matches ? (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium" style={{ color: '#047857', backgroundColor: soft('#047857', 12) }}>
            <FiCheckCircle className="size-3.5" aria-hidden /> Συμφωνεί με την καρτέλα του SoftOne
          </span>
        ) : (
          <span role="status" className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium" style={{ color: '#B45309', backgroundColor: soft('#B45309', 12) }}>
            <FiAlertTriangle className="size-3.5" aria-hidden /> Διαφορά {eur.format(data.softone.diff)} από το SoftOne — υπόλοιπο SoftOne {eur.format(data.softone.balance)}
          </span>
        )}
        {data.byYear.length > 0 && (
          <span className="text-muted-foreground">
            Ανά χρήση: {data.byYear.map((y) => `${y.year}: ${eur.format(y.debit - y.credit)}`).join(' · ')}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Φίλτρο κινήσεων">
        {chip('all', 'Όλες', '#475569')}
        {chip('invoice', 'Τιμολόγια', DOC_TONE.invoice)}
        {chip('payment', customer ? 'Εισπράξεις' : 'Πληρωμές', DOC_TONE.payment)}
        {counts.credit > 0 && chip('credit', 'Πιστωτικά', DOC_TONE.credit)}
      </div>

      {rows.length === 0 ? <Empty>Καμία κίνηση.</Empty> : (
        <div className="overflow-hidden rounded-md border border-border bg-background">
          <table className="w-full border-collapse">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th scope="col" className={TH}>Ημ/νία</th>
                <th scope="col" className={TH}>Παραστατικό</th>
                <th scope="col" className={cn(TH, 'hidden lg:table-cell')}>Έργο</th>
                <th scope="col" className={cn(TH, 'text-right')}>Χρέωση</th>
                <th scope="col" className={cn(TH, 'text-right')}>Πίστωση</th>
                <th scope="col" className={cn(TH, 'hidden text-right sm:table-cell')}>Υπόλοιπο</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d, i) => (
                <tr key={`${d.findoc}-${i}`} className="border-t border-border/60 transition-colors duration-150 hover:bg-muted/30">
                  <td className={cn(TD, 'tabular-nums whitespace-nowrap')} style={{ boxShadow: `inset 3px 0 0 ${DOC_TONE[d.kind] ?? '#475569'}` }}>{fmtDate(d.date)}</td>
                  <td className={TD}>
                    <span className="font-mono font-medium text-foreground">{d.fincode}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1">
                      <KindChip d={d} />
                      <span className="text-[length:var(--fs-10)] text-muted-foreground">{d.seriesName ?? d.family}{d.viaRemittance ? ' · μέσω τράπεζας' : ''}</span>
                    </span>
                  </td>
                  <td className={cn(TD, 'hidden lg:table-cell')}>
                    {d.prjc ? <Link href={`/admin/projects/${d.prjc}`} className="text-primary hover:underline">{d.project}</Link> : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className={cn(TD, NUM)}>{d.side === 'D' ? eur.format(d.amount) : ''}</td>
                  <td className={cn(TD, NUM)}>{d.side === 'C' ? eur.format(d.amount) : ''}</td>
                  <td className={cn(TD, NUM, 'hidden font-medium sm:table-cell', (d.balance ?? 0) < 0 ? 'text-sky-700 dark:text-sky-400' : 'text-foreground')}>{d.balance != null ? eur.format(d.balance) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Έργα ───────────────────────── */

function ProjectsTab({ data }: { data: TraderActivity }) {
  if (data.projects.length === 0) return <Empty>Ο συναλλασσόμενος δεν συνδέεται με κανένα έργο.</Empty>;
  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <table className="w-full border-collapse">
        <thead className="border-b border-border bg-muted/40">
          <tr>
            <th scope="col" className={TH}>Έργο</th>
            <th scope="col" className={TH}>Ρόλος</th>
            <th scope="col" className={cn(TH, 'hidden md:table-cell')}>Έναρξη</th>
            <th scope="col" className={cn(TH, 'hidden md:table-cell')}>Λήξη</th>
            <th scope="col" className={cn(TH, 'text-right')}>Τιμολογήθηκαν</th>
          </tr>
        </thead>
        <tbody>
          {data.projects.map((p) => (
            <tr key={p.prjc} className="border-t border-border/60 transition-colors duration-150 hover:bg-muted/30">
              <td className={TD}>
                <Link href={`/admin/projects/${p.prjc}`} className="font-medium text-foreground hover:text-primary hover:underline">{p.name}</Link>
                <span className="ml-1.5 font-mono text-[length:var(--fs-10)] text-muted-foreground">{p.code}</span>
                {!p.isActive && <span className="ml-1.5 rounded-sm bg-muted px-1 text-[length:var(--fs-10)]">ανενεργό</span>}
              </td>
              <td className={TD}><span className="text-muted-foreground">{p.role}</span></td>
              <td className={cn(TD, 'hidden tabular-nums md:table-cell')}>{fmtDate(p.fromDate)}</td>
              <td className={cn(TD, 'hidden tabular-nums md:table-cell')}>{fmtDate(p.finalDate)}</td>
              <td className={cn(TD, NUM, p.invoiced ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                {p.invoiced ? eur.format(p.invoiced) : '—'}
                {p.docs > 0 && <span className="block text-[length:var(--fs-10)] font-normal text-muted-foreground">{p.docs} τιμολόγια</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────── Παραγγελίες ───────────────────────── */

function OrdersTab({ data }: { data: TraderActivity }) {
  const [showQuotes, setShowQuotes] = React.useState(false);
  const rows = showQuotes ? data.quotes : data.orders;
  const total = rows.reduce((s, d) => s + d.amount, 0);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Παραγγελίες ή προσφορές">
        {([['orders', 'Παραγγελίες', data.orders.length, DOC_TONE.order], ['quotes', 'Προσφορές', data.quotes.length, DOC_TONE.quote]] as const).map(([k, label, n, tone]) => {
          const active = (k === 'quotes') === showQuotes;
          return (
            <button
              key={k} type="button" aria-pressed={active} onClick={() => setShowQuotes(k === 'quotes')}
              className={cn('inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-[length:var(--fs-11)] font-medium transition-colors duration-150', active ? 'text-white shadow-sm' : 'border-border bg-background hover:bg-muted')}
              style={active ? { backgroundColor: tone, borderColor: tone } : { color: tone }}
            >
              {label} <span className="tabular-nums opacity-80">{n}</span>
            </button>
          );
        })}
        {rows.length > 0 && <span className="ml-auto text-[length:var(--fs-11)] tabular-nums text-muted-foreground">Σύνολο {eur.format(total)}</span>}
      </div>
      {rows.length === 0 ? <Empty>{showQuotes ? 'Καμία προσφορά.' : 'Καμία παραγγελία.'}</Empty> : (
        <div className="overflow-hidden rounded-md border border-border bg-background">
          <table className="w-full border-collapse">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th scope="col" className={TH}>Ημ/νία</th>
                <th scope="col" className={TH}>Παραστατικό</th>
                <th scope="col" className={cn(TH, 'hidden md:table-cell')}>Έργο</th>
                <th scope="col" className={cn(TH, 'text-right')}>Αξία</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d, i) => (
                <tr key={`${d.findoc}-${i}`} className="border-t border-border/60 transition-colors duration-150 hover:bg-muted/30">
                  <td className={cn(TD, 'tabular-nums whitespace-nowrap')}>{fmtDate(d.date)}</td>
                  <td className={TD}>
                    <span className="font-mono font-medium text-foreground">{d.fincode}</span>
                    <span className="block text-[length:var(--fs-10)] text-muted-foreground">{d.seriesName ?? d.family}</span>
                  </td>
                  <td className={cn(TD, 'hidden md:table-cell')}>
                    {d.prjc ? <Link href={`/admin/projects/${d.prjc}`} className="text-primary hover:underline">{d.project}</Link> : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className={cn(TD, NUM, 'font-semibold text-foreground')}>{eur.format(d.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Χάρτης ───────────────────────── */

/**
 * Η θέση του συναλλασσομένου (TRDR.LATITUDE / LONGITUDE), διαβασμένη ΖΩΝΤΑΝΑ από το SoftOne όταν ανοίγει
 * η καρτέλα. Χάρτης Leaflet σε όλο το πλάτος (TraderPointMap). Χωρίς θέση ⇒ «Ορισμός θέσης» ανοίγει την καρτέλα.
 */
function MapTab({ t, canManage, onAction }: { t: TraderRecord; canManage: boolean; onAction: (m: TraderDialogMode) => void }) {
  const [state, setState] = React.useState<{ pos: { lat: number; lng: number } | null } | 'loading' | { error: string }>('loading');
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch(`/api/admin/traders/${t.trdr}?only=geo`, { cache: 'no-store' });
        const d = await r.json().catch(() => null);
        if (!alive) return;
        if (!r.ok || !d) { setState({ error: d?.message ?? 'Η θέση δεν διαβάστηκε από το SoftOne.' }); return; }
        setState({ pos: validCoords(d.values?.lat, d.values?.lng) });
      } catch { if (alive) setState({ error: 'Σφάλμα δικτύου.' }); }
    })();
    return () => { alive = false; };
  }, [t.trdr]);

  if (state === 'loading') return <Skeleton h="h-[260px]" />;
  if ('error' in state) return <Empty>{state.error}</Empty>;
  const address = [t.address, [t.zip, t.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (!state.pos) {
    return (
      <div className="space-y-2 rounded-md border border-dashed border-border px-3 py-5 text-center">
        <p className="text-[length:var(--fs-12)] text-muted-foreground">Δεν έχει οριστεί γεωγραφική θέση στο SoftOne{address ? ` · διεύθυνση: ${address}` : ''}.</p>
        {canManage && (
          <button type="button" onClick={() => onAction('edit')}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-3 text-[length:var(--fs-12)] hover:bg-muted">
            <FiMapPin className="size-3.5" aria-hidden /> Ορισμός θέσης
          </button>
        )}
      </div>
    );
  }
  const { lat, lng } = state.pos;
  return (
    <div className="w-full overflow-hidden rounded-md border border-border bg-background">
      <div className="h-[260px] w-full bg-muted sm:h-[340px]">
        <TraderPointMap lat={lat} lng={lng} label={t.name} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-[length:var(--fs-12)]">
        <span className="font-mono tabular-nums text-muted-foreground">{formatCoords(state.pos)}</span>
        {address && <span className="min-w-0 flex-1 truncate text-foreground">{address}</span>}
        <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <FiExternalLink className="size-3" aria-hidden /> Μεγάλος χάρτης
        </a>
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <FiNavigation className="size-3" aria-hidden /> Οδηγίες
        </a>
        {canManage && (
          <button type="button" onClick={() => onAction('edit')} className="inline-flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground">
            <FiEdit3 className="size-3" aria-hidden /> Αλλαγή θέσης
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Το panel ───────────────────────── */

/** Ανοιγμένη γραμμή συναλλασσομένου: Στοιχεία · (Πρόσωπα) · Χάρτης · Καρτέλα · Έργα · Παραγγελίες · Σκαναρίσματα. */
export function TraderExpandPanel({ trader, canManage, onAction }: {
  trader: TraderRecord; canManage: boolean; onAction: (mode: TraderDialogMode) => void;
}) {
  const [data, setData] = React.useState<TraderActivity | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [people, setPeople] = React.useState<number | null>(null);
  const isCustomer = trader.sodtype === 13;
  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/traders/${trader.trdr}/activity`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Αποτυχία ανάγνωσης από το SoftOne');
      setData(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [trader.trdr]);
  React.useEffect(() => { void load(); }, [load]);

  const remote = (child: (d: TraderActivity) => React.ReactNode) =>
    error && !data ? (
      <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[length:var(--fs-12)]">
        <FiAlertTriangle className="size-4 text-destructive" aria-hidden /><span className="flex-1">{error}</span>
        <button type="button" onClick={load} className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-border bg-background px-2.5 hover:bg-muted"><FiRefreshCw className="size-3.5" aria-hidden /> Δοκιμή ξανά</button>
      </div>
    ) : !data ? <Skeleton /> : child(data);

  return (
    <Tabs defaultValue="details" className="gap-3">
      <div className="flex items-center gap-2 border-b border-border">
        <TabsList variant="line" className="!h-auto min-h-9 flex-wrap min-w-0 flex-1 justify-start gap-0 p-0">
          <TabsTrigger value="details" className={TRIGGER} style={{ ['--tab-tone' as string]: TONE.info }}><FiInfo className="hidden size-3.5 sm:inline" aria-hidden /> Στοιχεία</TabsTrigger>
          {isCustomer && <TabsTrigger value="people" className={TRIGGER} style={{ ['--tab-tone' as string]: TONE.people }}><FiUsers className="hidden size-3.5 sm:inline" aria-hidden /> Πρόσωπα & πρόσβαση <Badge n={people} tone={TONE.people} /></TabsTrigger>}
          <TabsTrigger value="map" className={TRIGGER} style={{ ['--tab-tone' as string]: TONE.map }}><FiMap className="hidden size-3.5 sm:inline" aria-hidden /> Χάρτης</TabsTrigger>
          <TabsTrigger value="ledger" className={TRIGGER} style={{ ['--tab-tone' as string]: TONE.ledger }}><FiBookOpen className="hidden size-3.5 sm:inline" aria-hidden /> Καρτέλα <Badge n={data?.ledger.length ?? null} tone={TONE.ledger} /></TabsTrigger>
          <TabsTrigger value="projects" className={TRIGGER} style={{ ['--tab-tone' as string]: TONE.projects }}><FiBriefcase className="hidden size-3.5 sm:inline" aria-hidden /> Έργα <Badge n={data?.projects.length ?? null} tone={TONE.projects} /></TabsTrigger>
          <TabsTrigger value="orders" className={TRIGGER} style={{ ['--tab-tone' as string]: TONE.orders }}><FiShoppingBag className="hidden size-3.5 sm:inline" aria-hidden /> Παραγγελίες <Badge n={data?.orders.length ?? null} tone={TONE.orders} /></TabsTrigger>
          <TabsTrigger value="scans" className={TRIGGER} style={{ ['--tab-tone' as string]: TONE.scans }}><FiFileText className="hidden size-3.5 sm:inline" aria-hidden /> Σκαναρίσματα <Badge n={trader.docCount ?? 0} tone={TONE.scans} /></TabsTrigger>
        </TabsList>
        <button
          type="button" onClick={load} disabled={loading} title={data ? `Από SoftOne · ${new Date(data.fetchedAt).toLocaleTimeString('el-GR')}` : undefined}
          className="hidden h-8 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-[length:var(--fs-11)] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:opacity-50 sm:inline-flex"
        >
          <FiRefreshCw className={cn('size-3.5', loading && 'animate-spin motion-reduce:animate-none')} aria-hidden /> Ανανέωση
        </button>
      </div>
      <TabsContent value="details"><DetailsTab t={trader} canManage={canManage} onAction={onAction} /></TabsContent>
      {isCustomer && (
        <TabsContent value="people" forceMount className="data-[state=inactive]:hidden">
          <CustomerContactsPanel trdr={trader.trdr} customer={trader.name} defaultEmail={trader.email?.split(';').map((x) => x.trim()).find(Boolean) ?? null} canManage={canManage} onCount={setPeople} />
        </TabsContent>
      )}
      <TabsContent value="map"><MapTab t={trader} canManage={canManage} onAction={onAction} /></TabsContent>
      <TabsContent value="ledger">{remote((d) => <LedgerTab data={d} />)}</TabsContent>
      <TabsContent value="projects">{remote((d) => <ProjectsTab data={d} />)}</TabsContent>
      <TabsContent value="orders">{remote((d) => <OrdersTab data={d} />)}</TabsContent>
      <TabsContent value="scans"><TraderDocsPanel trdr={trader.trdr} count={trader.docCount ?? 0} /></TabsContent>
    </Tabs>
  );
}
