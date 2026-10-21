// Τα widgets της αρχικής — server components. Το καθένα φορτώνει ΜΟΝΟ του (το τυλίγει δικό του
// <Suspense> στη σελίδα) και πιάνει τα δικά του σφάλματα, ώστε ένα αργό ή χαλασμένο να μην κρατά/
// ρίχνει τα υπόλοιπα. Καμία κλήση στο SoftOne: μόνο βάση εφαρμογής (καθρέφτες/στιγμιότυπα).
import * as React from 'react';
import Link from 'next/link';
import {
  FiAlertTriangle, FiArrowDownRight, FiArrowUpRight, FiMinus, FiCheckCircle, FiChevronRight, FiClock, FiUser, FiMapPin,
} from 'react-icons/fi';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DocsDailyChart } from '@/components/admin/dashboard/docs-daily-chart';
import { fmtInt, fmtPct } from '@/components/admin/dashboard/format';
import { ColumnChart, BarRows } from './charts';
import {
  todayAthens, loadFinance, loadAppointments, loadTasks, loadOrderRequests, loadOffers, loadOcr, loadAccounting, loadLeads, loadActivity, loadAssistant,
  type TaskRow,
} from '@/lib/dashboard/home-data';
import { RISK_LABEL, type RiskReason } from '@/lib/dashboard/finance';
import { APPOINTMENT_LABEL, type AppointmentStatus } from '@/lib/appointments-core';
import { addDays } from '@/lib/appointments-core';
import { PHASES } from '@/lib/project-tasks-core';

const FOCUS = 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring';
const ROW = `cx-transition -mx-1.5 flex min-h-[44px] items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-(--cx-hover) ${FOCUS}`;

const eurCompact = (n: number) => new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', notation: Math.abs(n) >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: Math.abs(n) >= 100_000 ? 1 : 0 }).format(n);
const dateTime = (iso: string) => new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Athens' }).format(new Date(iso));
const shortDate = (ymd: string) => new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${ymd}T00:00:00Z`));
const hhmm = (iso: string) => new Intl.DateTimeFormat('el-GR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Athens' }).format(new Date(iso));
function ago(iso: string) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return 'μόλις τώρα';
  if (m < 60) return `πριν ${m}′`;
  const h = Math.round(m / 60);
  if (h < 24) return `πριν ${h} ώρ.`;
  return `πριν ${Math.round(h / 24)} ημ.`;
}

/** Κάθε widget: δεδομένα → περιεχόμενο, αλλιώς μήνυμα σφάλματος μέσα στο ίδιο το widget. */
async function guard(load: () => Promise<React.ReactNode>): Promise<React.ReactNode> {
  try {
    return await load();
  } catch (e) {
    console.warn('[admin-home] widget', (e as Error).message);
    return (
      <p role="alert" className="flex items-start gap-2 rounded-md bg-(--muted) p-3 text-(length:--fs-13) text-muted-foreground">
        <FiAlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-600" />
        Δεν φόρτωσαν τα στοιχεία αυτή τη φορά. Δοκίμασε «Ανανέωση δεδομένων» από το «Προσαρμογή».
      </p>
    );
  }
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="flex items-center gap-2 py-4 text-(length:--fs-13) text-muted-foreground"><FiCheckCircle aria-hidden className="size-4 text-emerald-600" />{children}</p>;
}

function Big({ value, label, tone }: { value: React.ReactNode; label: string; tone?: 'warn' | 'ok' }) {
  return (
    <div className="min-w-0">
      <div className={`text-(length:--fs-28) font-semibold leading-none tracking-tight ${tone === 'warn' ? 'dash-text-warn' : 'text-foreground'}`}>{value}</div>
      <div className="mt-1 text-(length:--fs-12) text-muted-foreground">{label}</div>
    </div>
  );
}

function Delta({ cur, prev, vs, invert = false }: { cur: number; prev: number; vs: string; invert?: boolean }) {
  if (prev === 0 && cur === 0) return <span className="text-muted-foreground">χωρίς κίνηση</span>;
  const pct = prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null;
  const dir = cur > prev ? 'up' : cur < prev ? 'down' : 'flat';
  const good = dir === 'flat' ? null : (dir === 'up') !== invert;
  const Icon = dir === 'up' ? FiArrowUpRight : dir === 'down' ? FiArrowDownRight : FiMinus;
  const cls = good == null ? 'bg-muted text-muted-foreground' : good ? 'dash-tone-good' : 'dash-tone-bad';
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-px font-semibold ${cls}`}>
        <Icon aria-hidden className="size-3" />
        <span className="tabular-nums">{pct == null ? `${cur > prev ? '+' : '−'}${eurCompact(Math.abs(cur - prev))}` : fmtPct(Math.abs(pct), Math.abs(pct) < 10 ? 1 : 0)}</span>
      </span>
      <span className="text-muted-foreground">έναντι {vs}</span>
    </span>
  );
}

/** Μικρή γραμμή τάσης 12 μηνών: αχνή γραμμή, ο τρέχων μήνας τονισμένος με κουκκίδα. */
function Sparkline({ values, label }: { values: number[]; label: string }) {
  const W = 120, H = 32, n = values.length;
  if (n < 2) return null;
  const max = Math.max(...values), min = Math.min(0, ...values);
  const span = max - min || 1;
  const x = (i: number) => 4 + (i * (W - 8)) / (n - 1);
  const y = (v: number) => 4 + (1 - (v - min) / span) * (H - 8);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label} className="block max-w-full">
      <path d={d} fill="none" stroke="var(--viz-axis)" strokeOpacity={0.55} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(n - 1)} cy={y(values[n - 1])} r={4} fill="var(--viz-1)" stroke="var(--card)" strokeWidth={2} />
    </svg>
  );
}

function Tile({ label, value, children, trend }: { label: string; value: string; children?: React.ReactNode; trend?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-md border border-border/70 bg-(--background) p-3">
      <div className="truncate text-(length:--fs-12) font-medium text-muted-foreground">{label}</div>
      <div className="truncate text-(length:--fs-24) font-semibold leading-none tracking-tight text-foreground">{value}</div>
      {children && <div className="text-(length:--fs-11) leading-snug">{children}</div>}
      {trend && <div className="mt-auto pt-1">{trend}</div>}
    </div>
  );
}

function Stamp({ iso, href, label = 'Στιγμιότυπο κερδοφορίας' }: { iso: string | null; href: string; label?: string }) {
  return (
    <p className="mt-3 flex items-center gap-1.5 text-(length:--fs-11) text-muted-foreground">
      <FiClock aria-hidden className="size-3" />
      {iso ? `${label}: ${dateTime(iso)} (${ago(iso)})` : 'Δεν έχει υπολογιστεί ακόμη η κερδοφορία.'}
      <Link href={href} className={`ml-auto font-medium text-primary hover:underline ${FOCUS}`}>Λεπτομέρειες</Link>
    </p>
  );
}

// ── Οικονομικά ───────────────────────────────────────────────────────────────

export function FinanceKpisWidget() {
  return guard(async () => {
    const f = await loadFinance();
    if (!f.projects) return <><Empty>Δεν υπάρχουν ακόμη οικονομικά έργων.</Empty><Stamp iso={null} href="/admin/projects" /></>;
    const cur = f.months.at(-1)!;
    const { mtd } = f;
    // «1–18 Σεπ»: η σύγκριση είναι με το ίδιο διάστημα του προηγούμενου μήνα.
    const vs = `1–${Number(todayAthens().slice(8, 10))} ${f.months.at(-2)!.label.split(' ')[0]}`;
    const over90 = f.ageing.find((b) => b.label.startsWith('>'))?.amount ?? 0;
    return (
      <>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
          <Tile label={`Τιμολογήσεις ${cur.label}`} value={eurCompact(mtd.cur.revenue)} trend={<Sparkline values={f.months.map((m) => m.revenue)} label="Τιμολογήσεις 12 μηνών" />}>
            <Delta cur={mtd.cur.revenue} prev={mtd.prev.revenue} vs={vs} />
          </Tile>
          <Tile label={`Εισπράξεις ${cur.label}`} value={eurCompact(mtd.cur.collected)} trend={<Sparkline values={f.months.map((m) => m.collected)} label="Εισπράξεις 12 μηνών" />}>
            <Delta cur={mtd.cur.collected} prev={mtd.prev.collected} vs={vs} />
          </Tile>
          <Tile label="Ανοιχτό υπόλοιπο πελατών" value={eurCompact(f.totals.open)}>
            <span className={over90 > 0 ? 'font-medium dash-text-bad' : 'text-muted-foreground'}>
              {over90 > 0 ? <><FiAlertTriangle aria-hidden className="mr-1 inline size-3 align-[-1px]" />{eurCompact(over90)} πάνω από 90 ημέρες</> : 'Τίποτα πάνω από 90 ημέρες'}
            </span>
            {f.totals.advances > 0 && <span className="block text-muted-foreground">Εισπράξεις πάνω από την τιμολόγηση {eurCompact(f.totals.advances)}</span>}
          </Tile>
          <Tile label="Καθαρό κέρδος έργων" value={eurCompact(f.totals.netProfit)}>
            <span className="text-muted-foreground">Περιθώριο {f.totals.marginPct == null ? '—' : fmtPct(f.totals.marginPct, 1)} σε τιμολογήσεις {eurCompact(f.totals.revenue)}</span>
          </Tile>
          <Tile label="Έργα σε κίνδυνο" value={fmtInt(f.riskCount)}>
            <span className="text-muted-foreground">ζημιά ή χαμηλό περιθώριο, από {fmtInt(f.projects)} έργα{f.issuesOnly ? ` · ${fmtInt(f.issuesOnly)} ακόμη με ελλείψεις δεδομένων` : ''}</span>
          </Tile>
        </div>
        <Stamp iso={f.computedAt} href="/admin/projects" />
      </>
    );
  });
}

export function RevenueChartWidget() {
  return guard(async () => {
    const f = await loadFinance();
    const rev = f.months.reduce((s, m) => s + m.revenue, 0), cost = f.months.reduce((s, m) => s + m.costs, 0);
    return (
      <>
        <ColumnChart
          caption="Τιμολογήσεις και άμεσο κόστος έργων ανά μήνα, τελευταίοι 12 μήνες"
          points={f.months.map((m) => ({ label: m.label, values: [m.revenue, m.costs] }))}
          series={[{ key: 'rev', name: 'Τιμολογήσεις (καθαρά)', color: 'var(--viz-1)' }, { key: 'cost', name: 'Άμεσο κόστος', color: 'var(--viz-2)' }]}
          format="eur"
        />
        <p className="mt-2 text-(length:--fs-12) text-muted-foreground">
          12 μήνες: τιμολογήσεις <strong className="font-semibold text-foreground">{eurCompact(rev)}</strong> · κόστος <strong className="font-semibold text-foreground">{eurCompact(cost)}</strong> · διαφορά <strong className="font-semibold text-foreground">{eurCompact(rev - cost)}</strong>
        </p>
        <Stamp iso={f.computedAt} href="/admin/projects" />
      </>
    );
  });
}

export function AgeingWidget() {
  return guard(async () => {
    const f = await loadFinance();
    const total = f.ageing.reduce((s, b) => s + b.amount, 0);
    if (total <= 0) return <><Empty>Δεν υπάρχουν ανείσπρακτα τιμολόγια έργων.</Empty><Stamp iso={f.computedAt} href="/admin/projects" /></>;
    return (
      <>
        <Big value={eurCompact(total)} label="ανείσπρακτα συνολικά" />
        <div className="mt-3">
          <BarRows caption="Ανείσπρακτα ανά ηλικία τιμολογίου" rows={f.ageing.map((b) => ({ label: b.label, value: b.amount }))} format="eurCompact" />
        </div>
        <Stamp iso={f.computedAt} href="/admin/projects" />
      </>
    );
  });
}

const RISK_TONE: Record<RiskReason, string> = {
  loss: 'dash-tone-bad',
  'no-revenue': 'dash-tone-bad',
  'low-margin': 'dash-tone-warn',
  issues: 'dash-tone-info',
};

export function ProjectsRiskWidget() {
  return guard(async () => {
    const f = await loadFinance();
    if (!f.risk.length) return <><Empty>Κανένα έργο με ζημιά, χαμηλό περιθώριο ή ελλείψεις.</Empty><Stamp iso={f.computedAt} href="/admin/projects" /></>;
    return (
      <>
        <ul className="divide-y divide-(--cx-divider)">
          {f.risk.map((r) => (
            <li key={r.prjc}>
              <Link href={`/admin/projects/${r.prjc}`} className={ROW}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-(length:--fs-13) font-medium text-foreground"><span className="text-muted-foreground">{r.code}</span> · {r.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {r.reasons.map((x) => (
                      <span key={x} className={`rounded px-1.5 py-px text-(length:--fs-11) font-medium ${RISK_TONE[x]}`}>
                        {x === 'issues' ? `${RISK_LABEL[x]} (${r.issues})` : RISK_LABEL[x]}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`text-(length:--fs-13) font-semibold tabular-nums ${r.netProfit < 0 ? 'dash-text-bad' : 'text-foreground'}`}>{eurCompact(r.netProfit)}</div>
                  <div className="text-(length:--fs-11) text-muted-foreground">{r.marginPct == null ? 'χωρίς έσοδα' : `περιθώριο ${fmtPct(r.marginPct, 1)}`}</div>
                </div>
                <FiChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
        {f.riskCount + f.issuesOnly > f.risk.length && <p className="mt-1 text-(length:--fs-12) text-muted-foreground">και {fmtInt(f.riskCount + f.issuesOnly - f.risk.length)} ακόμη στη λίστα έργων</p>}
        <Stamp iso={f.computedAt} href="/admin/projects" />
      </>
    );
  });
}

// ── Ραντεβού ─────────────────────────────────────────────────────────────────

const STATUS_TONE: Record<string, string> = {
  PENDING: 'dash-tone-warn',
  CONFIRMED: 'dash-tone-good',
};

export function AppointmentsWidget({ userId }: { userId: string }) {
  return guard(async () => {
    const a = await loadAppointments(userId);
    const todayCount = a.items.filter((x) => x.day === a.today).length;
    const days = [...new Set(a.items.map((x) => x.day))];
    const dayName = (d: string) => (d === a.today ? 'Σήμερα' : d === addDays(a.today, 1) ? 'Αύριο' : new Intl.DateTimeFormat('el-GR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`)));
    return (
      <>
        <div className="mb-3 flex flex-wrap gap-6">
          <Big value={fmtInt(todayCount)} label="σήμερα" />
          <Big value={fmtInt(a.items.length)} label="επόμενες 7 ημέρες" />
          <Big value={fmtInt(a.pending)} label="περιμένουν επιβεβαίωση" tone={a.pending ? 'warn' : undefined} />
        </div>
        {!a.items.length ? <Empty>Κανένα ραντεβού την επόμενη εβδομάδα.</Empty> : (
          <div className="max-h-80 space-y-3 overflow-y-auto overflow-x-hidden px-1.5">
            {days.map((d) => (
              <div key={d}>
                <h3 className="mb-1 text-(length:--fs-11) font-semibold uppercase tracking-wide text-muted-foreground">{dayName(d)}</h3>
                <ul className="space-y-0.5">
                  {a.items.filter((x) => x.day === d).map((x) => (
                    <li key={x.id}>
                      <Link href="/admin/appointments" className={ROW}>
                        <span className="w-12 shrink-0 text-(length:--fs-13) font-semibold tabular-nums text-foreground">{hhmm(x.startsAt)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-(length:--fs-13) text-foreground">{x.name}{x.company ? <span className="text-muted-foreground"> · {x.company}</span> : null}</div>
                          <div className="flex items-center gap-1 truncate text-(length:--fs-11) text-muted-foreground">
                            {x.place !== 'atelier' && <FiMapPin aria-hidden className="size-3 shrink-0" />}
                            {x.topic ?? 'Ραντεβού'}
                          </div>
                        </div>
                        {x.mine && <span className="shrink-0 rounded bg-(--cx-accent-soft) px-1.5 py-px text-(length:--fs-11) font-medium text-primary"><FiUser aria-hidden className="mr-0.5 inline size-3 align-[-1px]" />εμένα</span>}
                        <span className={`shrink-0 rounded px-1.5 py-px text-(length:--fs-11) font-medium ${STATUS_TONE[x.status] ?? 'bg-muted text-muted-foreground'}`}>{APPOINTMENT_LABEL[x.status as AppointmentStatus] ?? x.status}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </>
    );
  });
}

// ── Εργασίες ─────────────────────────────────────────────────────────────────

function TaskList({ rows, today, empty }: { rows: TaskRow[]; today: string; empty: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="max-h-72 space-y-0.5 overflow-y-auto overflow-x-hidden px-1.5">
      {rows.slice(0, 12).map((t) => {
        const late = t.end < today;
        return (
          <li key={t.id}>
            <Link href={`/admin/projects/${t.prjc}/tasks`} className={ROW}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-(length:--fs-13) font-medium text-foreground">{t.name}</div>
                <div className="truncate text-(length:--fs-11) text-muted-foreground">{t.projectCode} · {t.projectName}</div>
              </div>
              <div className="w-20 shrink-0" aria-label={`Πρόοδος ${t.progress}%`}>
                <div className="h-1.5 rounded-full bg-(--viz-track)"><div className="h-full rounded-full bg-(--viz-1)" style={{ width: `${t.progress}%` }} /></div>
                <div className="mt-0.5 text-right text-(length:--fs-11) tabular-nums text-muted-foreground">{t.progress}%</div>
              </div>
              <span className={`w-16 shrink-0 text-right text-(length:--fs-12) tabular-nums ${late ? 'font-semibold dash-text-bad' : 'text-muted-foreground'}`}>
                {late && <FiAlertTriangle aria-label="Καθυστερεί" className="mr-0.5 inline size-3 align-[-1px]" />}{shortDate(t.end)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function TasksWidget({ userId }: { userId: string }) {
  return guard(async () => {
    const t = await loadTasks(userId);
    if (!t.open) return <Empty>Δεν υπάρχουν ανοιχτές εργασίες έργων.</Empty>;
    return (
      <Tabs defaultValue={t.overdue.length && !t.mine.length ? 'overdue' : 'mine'}>
        <TabsList className="mb-2 flex-wrap">
          <TabsTrigger value="mine">Δικές μου ({t.mine.length})</TabsTrigger>
          <TabsTrigger value="overdue">Καθυστερούν ({t.overdue.length})</TabsTrigger>
          <TabsTrigger value="soon">Λήγουν σε 7 ημ. ({t.soon.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="mine"><TaskList rows={t.mine} today={t.today} empty="Καμία ανοιχτή εργασία ανατεθειμένη σε σένα." /></TabsContent>
        <TabsContent value="overdue"><TaskList rows={t.overdue} today={t.today} empty="Καμία εργασία σε καθυστέρηση." /></TabsContent>
        <TabsContent value="soon"><TaskList rows={t.soon} today={t.today} empty="Καμία εργασία δεν λήγει την επόμενη εβδομάδα." /></TabsContent>
      </Tabs>
    );
  });
}

export function TasksPipelineWidget({ userId }: { userId: string }) {
  return guard(async () => {
    const t = await loadTasks(userId);
    if (!t.open) return <Empty>Δεν υπάρχουν ανοιχτές εργασίες έργων.</Empty>;
    const color = new Map<string, string>(PHASES.map((p) => [p.key, p.color]));
    return (
      <>
        <div className="mb-3 flex gap-6">
          <Big value={fmtInt(t.open)} label="ανοιχτές εργασίες" />
          <Big value={fmtInt(t.overdue.length)} label="σε καθυστέρηση" tone={t.overdue.length ? 'warn' : undefined} />
        </div>
        <BarRows caption="Ανοιχτές εργασίες ανά φάση" rows={t.phases.map((p) => ({ label: p.label, value: p.count, color: color.get(p.key) }))} format="int" />
      </>
    );
  });
}

// ── Αιτήματα παραγγελίας / προσφορές ─────────────────────────────────────────

export function OrderRequestsWidget() {
  return guard(async () => {
    const o = await loadOrderRequests();
    return (
      <>
        <Big value={fmtInt(o.pending)} label="περιμένουν απάντηση" tone={o.pending ? 'warn' : undefined} />
        {!o.items.length ? <Empty>Κανένα ανοιχτό αίτημα.</Empty> : (
          <ul className="mt-3 space-y-0.5">
            {o.items.map((r) => (
              <li key={r.id}>
                <Link href="/admin/order-requests" className={ROW}>
                  <span className="shrink-0 text-(length:--fs-12) font-semibold tabular-nums text-muted-foreground">ΑΠ-{String(r.number).padStart(6, '0')}</span>
                  <span className="min-w-0 flex-1 truncate text-(length:--fs-13) text-foreground">{r.trader}</span>
                  <span className="shrink-0 text-(length:--fs-11) text-muted-foreground">{r.lines} γρ. · {ago(r.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  });
}

export function OffersWidget() {
  return guard(async () => {
    const o = await loadOffers();
    const daysLeft = (iso: string | null) => (iso ? Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000) : null);
    return (
      <>
        <div className="flex gap-6">
          <Big value={fmtInt(o.items.length)} label="ανοιχτά container" />
          <Big value={fmtInt(o.requests)} label="αιτήματα κράτησης" tone={o.requests ? 'warn' : undefined} />
        </div>
        {!o.items.length ? <Empty>Καμία ανοιχτή προσφορά{o.drafts ? ` (${o.drafts} πρόχειρες)` : ''}.</Empty> : (
          <ul className="mt-3 space-y-2.5">
            {o.items.map((x) => {
              const d = daysLeft(x.closesAt);
              return (
                <li key={x.id}>
                  <Link href="/admin/dynamic-offers" className={`block rounded-md ${FOCUS}`}>
                    <div className="flex items-baseline justify-between gap-2 text-(length:--fs-13)">
                      <span className="truncate font-medium text-foreground">{x.title}</span>
                      <span className={`shrink-0 text-(length:--fs-11) ${d != null && d <= 3 ? 'font-semibold dash-text-warn' : 'text-muted-foreground'}`}>
                        {x.status === 'SCHEDULED' ? 'προγραμματισμένη' : d == null ? 'χωρίς προθεσμία' : d < 0 ? 'έληξε' : d === 0 ? 'λήγει σήμερα' : `λήγει σε ${d} ημ.`}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-(--viz-track)" aria-label={`Πληρότητα ${Math.round(x.percent)}%`}>
                      <div className="h-full rounded-full bg-(--viz-1)" style={{ width: `${x.percent}%` }} />
                    </div>
                    <div className="mt-0.5 text-(length:--fs-11) tabular-nums text-muted-foreground">{fmtInt(Math.round(x.percent))}% · {x.filled}/{x.capacity} παλέτες · {x.customers} πελάτες</div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </>
    );
  });
}

// ── OCR ──────────────────────────────────────────────────────────────────────

export function OcrActivityWidget() {
  return guard(async () => {
    const d = await loadOcr();
    const k = d.kpis;
    return (
      <>
        <div className="mb-3 flex flex-wrap gap-6">
          <Big value={fmtInt(k.created.value)} label="νέα έγγραφα" />
          <Big value={fmtInt(k.posted.value)} label="στο SoftOne" />
          <Big value={fmtInt(k.review.value)} label="σε έλεγχο" tone={k.review.value ? 'warn' : undefined} />
          <Big value={fmtInt(k.failed.value)} label="αποτυχίες" tone={k.failed.value ? 'warn' : undefined} />
        </div>
        <DocsDailyChart data={d.docsDaily} />
      </>
    );
  });
}

export function OcrAttentionWidget() {
  return guard(async () => {
    const d = await loadOcr();
    const total = d.attention.reduce((s, r) => s + r.count, 0);
    return (
      <>
        <Big value={fmtInt(total)} label="εκκρεμότητες OCR" tone={total ? 'warn' : undefined} />
        <ul className="mt-2 divide-y divide-(--cx-divider)">
          {d.attention.map((r) => (
            <li key={r.key}>
              <Link href={r.href} className={`${ROW} ${r.count ? 'text-foreground' : 'text-muted-foreground'}`}>
                <span className="min-w-0 flex-1 truncate text-(length:--fs-13)">{r.label}</span>
                {r.count ? (
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-(length:--fs-12) font-semibold tabular-nums dash-tone-bad">{fmtInt(r.count)}</span>
                ) : <FiCheckCircle aria-label="Τίποτα εκκρεμές" className="size-4 shrink-0 text-emerald-600" />}
              </Link>
            </li>
          ))}
        </ul>
      </>
    );
  });
}

// ── Λογιστήριο ───────────────────────────────────────────────────────────────

export function AccountingWidget() {
  return guard(async () => {
    const a = await loadAccounting();
    return (
      <div className="grid grid-cols-2 gap-2.5">
        <Link href="/admin/accounting/questions" className={`rounded-md border border-border/70 p-3 hover:bg-(--cx-hover) ${FOCUS}`}>
          <Big value={fmtInt(a.questions)} label="ερωτήματα λογιστή" tone={a.questions ? 'warn' : undefined} />
        </Link>
        <Link href="/admin/accounting/integrator" className={`rounded-md border border-border/70 p-3 hover:bg-(--cx-hover) ${FOCUS}`}>
          <Big value={fmtInt(a.integrator)} label="θέματα integrator" tone={a.high ? 'warn' : undefined} />
          {a.integrator > 0 && <p className="mt-1.5 text-(length:--fs-11) text-muted-foreground">{a.high} υψηλής · {a.mid} μέσης · {a.low} χαμηλής</p>}
        </Link>
      </div>
    );
  });
}

// ── Leads ────────────────────────────────────────────────────────────────────

export function LeadsWidget() {
  return guard(async () => {
    const l = await loadLeads();
    return (
      <>
        <div className="mb-3 flex flex-wrap gap-6">
          <Big value={fmtInt(l.last30)} label="νέα leads, 30 ημέρες" />
          <Big value={fmtInt(l.subscribers)} label="συνδρομητές newsletter" />
          <Big value={fmtInt(l.toSoftone)} label="εκκρεμούν για SoftOne" tone={l.toSoftone ? 'warn' : undefined} />
        </div>
        <ColumnChart
          height={150}
          caption="Νέα leads ανά εβδομάδα, τελευταίες 12 εβδομάδες"
          points={l.weeks.map((w) => ({ label: shortDate(w.start), values: [w.count] }))}
          series={[{ key: 'leads', name: 'Νέα leads', color: 'var(--viz-1)' }]}
          format="int"
        />
        {l.latest.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {l.latest.slice(0, 3).map((x) => (
              <li key={x.id}>
                <Link href="/admin/leads" className={ROW}>
                  <span className="min-w-0 flex-1 truncate text-(length:--fs-13) text-foreground">{x.name || x.email}{x.company ? <span className="text-muted-foreground"> · {x.company}</span> : null}</span>
                  <span className="shrink-0 text-(length:--fs-11) text-muted-foreground">{ago(x.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  });
}

// ── Δραστηριότητα / Air Jordan ───────────────────────────────────────────────

export function ActivityWidget() {
  return guard(async () => {
    const rows = await loadActivity();
    if (!rows.length) return <Empty>Καμία καταγεγραμμένη ενέργεια.</Empty>;
    return (
      <ul className="max-h-80 divide-y divide-(--cx-divider) overflow-y-auto overflow-x-hidden px-1.5">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2.5 py-1.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-(length:--fs-12) text-foreground">{r.action}</span>
              <span className="block truncate text-(length:--fs-11) text-muted-foreground">{r.userEmail ?? 'σύστημα'}{r.resourceId ? ` · ${r.resource} ${r.resourceId}` : ''}</span>
            </span>
            <span className="shrink-0 text-(length:--fs-11) text-muted-foreground">{ago(r.createdAt)}</span>
          </li>
        ))}
      </ul>
    );
  });
}

export function AssistantWidget({ userId }: { userId: string }) {
  return guard(async () => {
    const convs = await loadAssistant(userId);
    return (
      <>
        <p className="text-(length:--fs-13) text-muted-foreground">
          Ρώτα με κείμενο ή φωνή: «Ποια έργα έχουν ανείσπρακτα πάνω από 90 ημέρες;», «Τι υλικά πήραμε για το έργο Χ;»
        </p>
        <Link href="/admin/assistant" className={`mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-4 text-(length:--fs-14) font-semibold text-primary-foreground hover:opacity-90 ${FOCUS}`}>
          Νέα ερώτηση
        </Link>
        {convs.length > 0 && (
          <ul className="mt-3 space-y-0.5">
            {convs.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/assistant?c=${c.id}`} className={ROW}>
                  <span className="min-w-0 flex-1 truncate text-(length:--fs-13) text-foreground">{c.title}</span>
                  <span className="shrink-0 text-(length:--fs-11) text-muted-foreground">{ago(c.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  });
}
