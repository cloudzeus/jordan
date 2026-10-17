import { FiAlertTriangle, FiTrendingUp, FiTrendingDown, FiInfo } from 'react-icons/fi';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { COST_CATEGORIES, COST_CATEGORY_LABEL, type DocRef, type ProjectProfit } from '@/lib/project-profit/calc';
import type { DataIssue } from '@/lib/project-profit/issues';
import { IssueLinks } from '../financials-actions';
import { DocRowActions } from './doc-row-actions';

const eur = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' });
const pct = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('el-GR', { maximumFractionDigits: 1 })}%`);
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('el-GR', { timeZone: 'UTC' }) : '—');
const MUTED = 'text-[length:var(--fs-12)] text-muted-foreground';
// Status χρώματα — πάντα μαζί με εικονίδιο + κείμενο, ποτέ μόνο χρώμα.
const GOOD = '#047857';
const BAD = '#B91C1C';

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-3">
      <p className="text-[length:var(--fs-11)] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-[length:var(--fs-20)] font-semibold tabular-nums text-foreground">{value}</p>
      {sub && <div className="mt-0.5 text-[length:var(--fs-11)] text-muted-foreground" style={tone ? { color: tone === 'good' ? GOOD : BAD } : undefined}>{sub}</div>}
    </div>
  );
}

function Row({ label, value, strong, indent, note }: { label: React.ReactNode; value: number; strong?: boolean; indent?: boolean; note?: string }) {
  return (
    <tr className="border-t border-border first:border-t-0">
      <td className={`py-1.5 pr-3 ${indent ? 'pl-4 text-muted-foreground' : ''} ${strong ? 'font-semibold text-foreground' : ''}`}>
        {label}{note && <span className="ml-1.5 text-[length:var(--fs-11)] text-muted-foreground">{note}</span>}
      </td>
      <td className={`py-1.5 text-right tabular-nums ${strong ? 'font-semibold text-foreground' : ''}`}>{eur.format(value)}</td>
    </tr>
  );
}

function DocsTable({ docs, gross }: { docs: DocRef[]; gross?: boolean }) {
  if (!docs.length) return <p className={`${MUTED} py-2`}>Κανένα παραστατικό.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[length:var(--fs-12)]">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1 pr-3 font-medium">Παραστατικό</th>
            <th className="py-1 pr-3 font-medium">Ημ/νία</th>
            <th className="py-1 pr-3 font-medium">Σειρά</th>
            <th className="py-1 pr-3 font-medium">Συναλλασσόμενος</th>
            {!gross && <th className="py-1 pr-3 text-right font-medium">Καθαρή</th>}
            <th className="py-1 text-right font-medium">{gross ? 'Ποσό' : 'Μικτή'}</th>
            <th className="w-8 py-1"><span className="sr-only">Ενέργειες</span></th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.findoc} className="border-t border-border align-top">
              <td className="py-1 pr-3">
                <span className="font-mono text-foreground">{d.fincode}</span>
                <span className="ml-1.5 font-mono text-[length:var(--fs-11)] text-muted-foreground">#{d.findoc}</span>
                {d.partial && <span className="ml-1.5 rounded-sm bg-muted px-1 text-[length:var(--fs-11)] text-muted-foreground" title="Μόνο μέρος των γραμμών αφορά το έργο">μερικό</span>}
                {d.mark && <span className="block font-mono text-[length:var(--fs-11)] text-muted-foreground">ΜΑΡΚ {d.mark}</span>}
              </td>
              <td className="py-1 pr-3 tabular-nums text-muted-foreground">{fmtDate(d.date)}</td>
              <td className="py-1 pr-3 text-muted-foreground">{d.seriesName ?? d.series}</td>
              <td className="py-1 pr-3">{d.traderName ?? '—'}</td>
              {!gross && <td className="py-1 pr-3 text-right tabular-nums">{eur.format(d.net)}</td>}
              <td className="py-1 text-right tabular-nums">{eur.format(d.gross)}</td>
              <td className="py-0.5 pl-1 text-right">
                <DocRowActions findoc={d.findoc} fincode={d.fincode} mark={d.mark ?? null} qrUrl={d.qrUrl ?? null} providerPdf={!!d.providerPdf} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ value, title, count, total, children }: { value: string; title: string; count: number; total: string; children: React.ReactNode }) {
  return (
    <AccordionItem value={value} className="rounded-lg border border-border not-last:border-b">
      <AccordionTrigger className="items-center gap-2 px-3 py-2 hover:bg-muted/40 hover:no-underline">
        <span className="flex flex-1 items-center justify-between gap-2 text-[length:var(--fs-13)]">
          <span className="font-medium text-foreground">{title} <span className="font-normal text-muted-foreground">({count})</span></span>
          <span className="font-normal tabular-nums text-muted-foreground">{total}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="border-t border-border px-3 py-2">{children}</AccordionContent>
    </AccordionItem>
  );
}

const AUDIENCE_LABEL = { accountant: 'Λογιστής', integrator: 'Integrator' } as const;

function MissingData({ issues }: { issues: DataIssue[] }) {
  if (!issues.length) return null;
  return (
    <div role="region" aria-label="Δεδομένα που λείπουν" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
      <p className="flex items-center gap-1.5 text-[length:var(--fs-13)] font-semibold">
        <FiAlertTriangle className="size-4 shrink-0" aria-hidden /> Δεδομένα που λείπουν ({issues.length})
      </p>
      <p className="mt-1 text-[length:var(--fs-12)]">
        Τα ποσά αυτών των θεμάτων <strong>δεν</strong> μετρούν στα νούμερα του έργου μέχρι να διορθωθούν στο SoftOne. Οι οδηγίες έχουν σταλεί αυτόματα: <IssueLinks />
      </p>
      <Accordion type="multiple" className="mt-2 gap-1.5">
        {issues.map((i) => (
          <AccordionItem key={i.key} value={i.key} className="rounded-md bg-background/70 not-last:border-b-0 dark:bg-background/20">
            <AccordionTrigger className="items-center gap-2 px-2.5 py-1.5 hover:no-underline">
              <span className="flex flex-1 flex-wrap items-center justify-between gap-2 text-[length:var(--fs-12)]">
                <span className="font-medium">{i.title}</span>
                <span className="flex items-center gap-2 font-normal">
                  {i.amount != null && <span className="tabular-nums">{eur.format(i.amount)}</span>}
                  <span className="rounded-full border border-current/30 px-1.5 text-[length:var(--fs-11)]">{AUDIENCE_LABEL[i.audience]}</span>
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-2.5 pb-2 text-[length:var(--fs-12)] leading-relaxed">{i.detail}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

/** Οικονομικά έργου: KPIs, ανάλυση, ενηλικίωση υπολοίπου, παραστατικά, δεδομένα που λείπουν. */
export function ProjectFinancials({ profit: r, issues, computedAt, error }: { profit: ProjectProfit; issues: DataIssue[]; computedAt: string; error: string | null }) {
  const profitTone = r.netProfit > 0 ? 'good' : r.netProfit < 0 ? 'bad' : undefined;
  const ageingMax = Math.max(...r.collections.ageing.map((b) => b.amount), 0);
  const estimate = r.costs.stock.filter((s) => s.source === 'estimate' && !s.suspect).reduce((a, s) => a + s.value, 0);

  return (
    // Accordion, ΚΛΕΙΣΤΟ αρχικά (χωρίς defaultValue): στην κεφαλίδα φαίνονται τα βασικά νούμερα.
    <Accordion type="single" collapsible className="mt-4 rounded-xl border border-border bg-card text-card-foreground shadow-sm">
      <AccordionItem value="financials" className="border-b-0">
      <AccordionTrigger className="items-center gap-3 px-3 py-3 hover:no-underline sm:px-6">
        <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-2 text-[length:var(--fs-14)] font-semibold text-foreground">
            Οικονομικά έργου
            {issues.length > 0 && <FiAlertTriangle className="size-3.5 text-amber-600" title={`${issues.length} θέματα «Δεδομένα που λείπουν»`} />}
          </span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[length:var(--fs-12)] font-normal tabular-nums text-muted-foreground">
            <span>Τιμολογήθηκε <strong className="font-semibold text-foreground">{eur.format(r.revenue.net)}</strong></span>
            <span>Εισπράχθηκε <strong className="font-semibold text-foreground">{eur.format(r.collections.collected)}</strong></span>
            <span>Καθαρό κέρδος <strong className="font-semibold" style={{ color: profitTone === 'good' ? GOOD : profitTone === 'bad' ? BAD : undefined }}>{eur.format(r.netProfit)}</strong></span>
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 border-t border-border px-3 pt-3 pb-4 sm:px-6 [&_p:not(:last-child)]:mb-0">
        <p className={MUTED}>
          Από τα παραστατικά του SoftOne · υπολογισμός {new Date(computedAt).toLocaleString('el-GR')}. Έσοδα και κόστος χωρίς ΦΠΑ· εισπράξεις και υπόλοιπο με ΦΠΑ.
        </p>
        {error && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[length:var(--fs-12)] text-destructive">
            Το SoftOne δεν απάντησε ({error}) — εμφανίζεται ο προηγούμενος υπολογισμός.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="Τιμολογήθηκε" value={eur.format(r.revenue.net)} sub={r.revenue.credits ? `μετά από πιστωτικά ${eur.format(r.revenue.credits)}` : 'καθαρά'} />
          <Tile label="Εισπράχθηκε" value={eur.format(r.collections.collected)} sub={`ανοιχτό ${eur.format(r.collections.open)}`} />
          <Tile label="Άμεσο κόστος" value={eur.format(r.costs.total)} sub={estimate ? `εκ των οποίων εκτίμηση ${eur.format(estimate)}` : 'αγορές & αποθήκη'} />
          <Tile label="Γενικά έξοδα" value={eur.format(r.overhead.total)} sub={r.overhead.ratesDefined ? 'κατά τα ποσοστά περιόδου' : 'δεν έχει οριστεί ποσοστό'} />
          <Tile
            label="Καθαρό κέρδος" value={eur.format(r.netProfit)} tone={profitTone}
            sub={<span className="inline-flex items-center gap-1">{profitTone === 'good' ? <FiTrendingUp className="size-3" aria-hidden /> : profitTone === 'bad' ? <FiTrendingDown className="size-3" aria-hidden /> : null}{profitTone === 'bad' ? 'Ζημιά' : 'Περιθώριο'} {pct(r.marginPct)}</span>}
          />
          <Tile label="Ταμειακά" value={eur.format(r.cash)} sub={`εισπράξεις − πληρωμές ${eur.format(r.payments.paid)}`} />
        </div>

        <MissingData issues={issues} />

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-1 text-[length:var(--fs-13)] font-semibold text-foreground">Ανάλυση αποτελέσματος</h3>
            <table className="w-full text-[length:var(--fs-12)]">
              <tbody>
                <Row label="Τιμολόγια & αποδείξεις" value={r.revenue.invoiced} />
                {r.revenue.credits !== 0 && <Row label="Πιστωτικά" value={-r.revenue.credits} indent />}
                <Row label="Καθαρά έσοδα" value={r.revenue.net} strong />
                {COST_CATEGORIES.filter((c) => r.costs.byCategory[c] !== 0).map((c) => (
                  <Row key={c} label={COST_CATEGORY_LABEL[c]} value={-r.costs.byCategory[c]} indent note={c === 'stock' && estimate ? 'περιλαμβάνει εκτίμηση' : undefined} />
                ))}
                {r.overhead.lines.map((l) => (
                  <Row key={`${l.category}:${l.percent}`} label={`Γενικά έξοδα ${l.percent.toLocaleString('el-GR')}%`} value={-l.amount} indent note={`επί ${eur.format(l.base)} · ${COST_CATEGORY_LABEL[l.category].toLowerCase()}`} />
                ))}
                <Row label={r.netProfit < 0 ? 'Καθαρή ζημιά' : 'Καθαρό κέρδος'} value={r.netProfit} strong />
              </tbody>
            </table>
            {r.budget.total > 0 ? (
              <p className={`mt-2 ${MUTED}`}>
                Προϋπολογισμός κόστους {eur.format(r.budget.total)} · πραγματικό {eur.format(r.costs.total)} ·{' '}
                <span className="font-medium" style={{ color: (r.budget.costVsBudget ?? 0) > 0 ? BAD : GOOD }}>
                  {(r.budget.costVsBudget ?? 0) > 0 ? `υπέρβαση ${eur.format(r.budget.costVsBudget!)}` : `εντός κατά ${eur.format(-(r.budget.costVsBudget ?? 0))}`}
                </span>
              </p>
            ) : (
              <p className={`mt-2 inline-flex items-center gap-1 ${MUTED}`}><FiInfo className="size-3" aria-hidden /> Δεν υπάρχει προϋπολογισμός για σύγκριση.</p>
            )}
          </div>

          <div>
            <h3 className="mb-1 text-[length:var(--fs-13)] font-semibold text-foreground">Ανοιχτό υπόλοιπο πελάτη ανά παλαιότητα</h3>
            {r.collections.open > 0.005 ? (
              <table className="w-full text-[length:var(--fs-12)]">
                <tbody>
                  {r.collections.ageing.map((b) => (
                    <tr key={b.label} className="border-t border-border first:border-t-0">
                      <td className="w-24 py-1.5 pr-3 text-muted-foreground">{b.label}</td>
                      <td className="py-1.5 pr-3">
                        <div className="h-2 rounded-full bg-muted" aria-hidden>
                          <div className="h-2 rounded-full bg-foreground/45" style={{ width: `${ageingMax ? (b.amount / ageingMax) * 100 : 0}%` }} />
                        </div>
                      </td>
                      <td className="w-28 py-1.5 text-right tabular-nums">{eur.format(b.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className={MUTED}>{r.collections.open < -0.005 ? `Εισπράχθηκαν ${eur.format(-r.collections.open)} περισσότερα από την τιμολόγηση (προκαταβολή ή τιμολόγιο χωρίς έργο).` : 'Δεν υπάρχει ανοιχτό υπόλοιπο.'}</p>
            )}
            <p className={`mt-2 ${MUTED}`}>Οι εισπράξεις εξοφλούν πρώτα τα παλαιότερα τιμολόγια (FIFO).</p>
          </div>
        </div>

        <Accordion type="multiple" className="gap-2">
          <Section value="sales" title="Πωλήσεις" count={r.revenue.docs.length} total={eur.format(r.revenue.net)}><DocsTable docs={r.revenue.docs} /></Section>
          <Section value="receipts" title="Εισπράξεις (εμβάσματα πελατών)" count={r.collections.docs.length} total={eur.format(r.collections.collected)}><DocsTable docs={r.collections.docs} gross /></Section>
          <Section value="costs" title="Αγορές, υπηρεσίες & αποθήκη" count={r.costs.docs.length} total={eur.format(r.costs.total - estimate)}><DocsTable docs={r.costs.docs} /></Section>
          <Section value="payments" title="Πληρωμές (εμβάσματα προμηθευτών)" count={r.payments.docs.length} total={eur.format(r.payments.paid)}><DocsTable docs={r.payments.docs} gross /></Section>
        </Accordion>
      </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
