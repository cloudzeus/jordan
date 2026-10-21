'use client';

import * as React from 'react';
import {
  FiAlertTriangle, FiDownload, FiEye, FiFileText, FiMonitor, FiPaperclip, FiSearch, FiSend, FiSmartphone, FiUser, FiUsers,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { confirmAction } from '@/components/ui/confirm-dialog';

export type TemplateView = {
  id: string; group: string; groupLabel: string; title: string; audience: 'customer' | 'staff'; trigger: string;
  attachments: string[]; subject: string; html: string; text: string;
};
type Customer = { trdr: number; label: string; email: string | null };
type Preview = {
  subject: string; html: string; text: string; recipient: string | null; customer: string; banks: number;
  summary: { closing: number; overdue: number; open: number; lines: number; opening: number; from: string | null; to: string };
};

const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(new Date());
const AUDIENCE = { customer: { label: 'Πελάτης', icon: FiUser, tone: '#8A5A12' }, staff: { label: 'Προσωπικό', icon: FiUsers, tone: '#475569' } } as const;
const soft = (hex: string, pct: number) => `color-mix(in srgb, ${hex} ${pct}%, var(--background))`;
const LABEL = 'text-(length:--fs-11) font-semibold uppercase tracking-wide text-muted-foreground';

/** Δύο επιλογές δίπλα-δίπλα (π.χ. Υπολογιστής / Κινητό). */
function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: React.ComponentType<{ className?: string }> }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border bg-muted/40 p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn('inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-[5px] px-2.5 text-(length:--fs-12) font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
            value === o.value ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}>
          {o.icon && <o.icon className="size-3.5" />}{o.label}
        </button>
      ))}
    </div>
  );
}

/** Το email σε iframe (απομονωμένο CSS, χωρίς scripts) με αυτόματο ύψος. */
function EmailFrame({ html, text, mode, device }: { html: string; text: string; mode: 'html' | 'text'; device: 'desktop' | 'mobile' }) {
  const ref = React.useRef<HTMLIFrameElement>(null);
  const [h, setH] = React.useState(900);
  const fit = () => { const d = ref.current?.contentDocument; if (d?.body) setH(Math.max(400, d.documentElement.scrollHeight + 4)); };
  React.useEffect(() => { const t = setTimeout(fit, 60); return () => clearTimeout(t); }, [html, device]);
  if (mode === 'text') {
    return <pre className="mx-auto max-w-[680px] whitespace-pre-wrap wrap-break-word rounded-md border bg-background p-5 font-mono text-(length:--fs-12-5) leading-relaxed text-foreground">{text}</pre>;
  }
  return (
    <div className="flex justify-center overflow-x-auto rounded-md bg-[#F4F1EC] p-3 sm:p-6">
      <iframe ref={ref} title="Προεπισκόπηση email" srcDoc={html} sandbox="allow-same-origin" onLoad={fit}
        className="block rounded-sm bg-white shadow-xs transition-[width] duration-200" style={{ width: device === 'mobile' ? 390 : 680, maxWidth: '100%', height: h, border: 0 }} />
    </div>
  );
}

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-(length:--fs-11) font-medium" style={{ color: tone, background: soft(tone, 12) }}>{children}</span>;
}

// ── Πρότυπα ──────────────────────────────────────────────────────────────────────────────────

function TemplatesTab({ templates, me }: { templates: TemplateView[]; me: string }) {
  const [sel, setSel] = React.useState(templates[0]?.id ?? '');
  const [q, setQ] = React.useState('');
  const [device, setDevice] = React.useState<'desktop' | 'mobile'>('desktop');
  const [mode, setMode] = React.useState<'html' | 'text'>('html');
  const [busy, setBusy] = React.useState(false);
  const t = templates.find((x) => x.id === sel) ?? templates[0];
  const fq = q.trim().toLocaleLowerCase('el');
  const list = fq ? templates.filter((x) => `${x.title} ${x.subject} ${x.groupLabel}`.toLocaleLowerCase('el').includes(fq)) : templates;
  const groups = [...new Set(list.map((x) => x.groupLabel))];

  async function sendTest() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/emails/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(d.error ?? 'Η αποστολή απέτυχε');
      else if (d.result === 'skipped') toast.info(`Δεν στάλθηκε (δοκιμαστικό περιβάλλον) → ${d.to}`);
      else toast.success(`Στάλθηκε στο ${d.to}`);
    } finally { setBusy(false); }
  }

  if (!t) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_1fr]">
      <aside className="rounded-md border bg-card lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
        <div className="border-b p-2.5">
          <label className="relative block">
            <span className="sr-only">Αναζήτηση προτύπου</span>
            <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση…" className="h-9 pl-8" />
          </label>
        </div>
        <nav aria-label="Πρότυπα email" className="p-1.5">
          {groups.map((g) => (
            <div key={g} className="mb-1.5">
              <div className={cn(LABEL, 'px-2 pb-1 pt-2')}>{g}</div>
              {list.filter((x) => x.groupLabel === g).map((x) => {
                const A = AUDIENCE[x.audience];
                return (
                  <button key={x.id} type="button" onClick={() => setSel(x.id)} aria-current={x.id === t.id ? 'true' : undefined}
                    className={cn('flex w-full min-h-11 cursor-pointer flex-col items-start gap-1 rounded-md px-2.5 py-2 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring',
                      x.id === t.id ? 'bg-(--cx-accent-soft) text-foreground' : 'hover:bg-muted')}>
                    <span className="text-(length:--fs-13) font-medium leading-snug">{x.title}</span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Pill tone={A.tone}><A.icon className="size-3" />{A.label}</Pill>
                      {x.attachments.length > 0 && <Pill tone="#64748B"><FiPaperclip className="size-3" />{x.attachments.length}</Pill>}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {!list.length && <p className="px-2 py-6 text-center text-(length:--fs-12) text-muted-foreground">Κανένα πρότυπο δεν ταιριάζει.</p>}
        </nav>
      </aside>

      <section className="min-w-0 space-y-3" aria-live="polite">
        <div className="rounded-md border bg-card p-3 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={LABEL}>Θέμα</div>
              <div className="mt-0.5 wrap-break-word text-(length:--fs-15) font-semibold">{t.subject}</div>
              <p className="mt-1 text-(length:--fs-12) text-muted-foreground">
                <span className="font-medium text-foreground">Πότε φεύγει:</span> {t.trigger}
                {t.attachments.length > 0 && <> · <span className="font-medium text-foreground">Συνημμένα:</span> {t.attachments.join(', ')}</>}
              </p>
            </div>
            <Button onClick={sendTest} disabled={busy} className="min-h-10 cursor-pointer gap-1.5">
              <FiSend className="size-4" />{busy ? 'Αποστολή…' : 'Δοκιμή σε εμένα'}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Segmented label="Συσκευή" value={device} onChange={setDevice} options={[{ value: 'desktop', label: 'Υπολογιστής', icon: FiMonitor }, { value: 'mobile', label: 'Κινητό', icon: FiSmartphone }]} />
            <Segmented label="Μορφή" value={mode} onChange={setMode} options={[{ value: 'html', label: 'HTML', icon: FiEye }, { value: 'text', label: 'Απλό κείμενο', icon: FiFileText }]} />
            <span className="text-(length:--fs-11-5) text-muted-foreground">Δείγμα δεδομένων · η δοκιμή πηγαίνει μόνο στο {me}</span>
          </div>
        </div>
        <EmailFrame html={t.html} text={t.text} mode={mode} device={device} />
      </section>
    </div>
  );
}

// ── Κατάσταση λογαριασμού ────────────────────────────────────────────────────────────────────

function StatementTab({ customers, me, canSend, banks, initialTrdr }: { customers: Customer[]; me: string; canSend: boolean; banks: number; initialTrdr: number | null }) {
  const [trdr, setTrdr] = React.useState<string | null>(initialTrdr ? String(initialTrdr) : null);
  const [from, setFrom] = React.useState(`${today().slice(0, 4)}-01-01`);
  const [to, setTo] = React.useState(today());
  const [message, setMessage] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [p, setP] = React.useState<Preview | null>(null);
  const [view, setView] = React.useState<'email' | 'pdf'>('email');
  const [mode, setMode] = React.useState<'html' | 'text'>('html');
  // Με αρχικό πελάτη η φόρτωση ξεκινά ήδη στο mount (βλ. effect παρακάτω).
  const [loading, setLoading] = React.useState(() => !!initialTrdr);
  const [sending, setSending] = React.useState<'me' | 'customer' | null>(null);
  const [key, setKey] = React.useState('');
  const target = trdr ?? 'sample';
  const qs = new URLSearchParams({ from, to }).toString();
  const items = React.useMemo(() => customers.map((c) => ({ value: String(c.trdr), label: c.label })), [customers]);

  // Τα setState μόνο μέσα στα callbacks του fetch· loading/καθαρισμός γίνονται στο load (χειριστές).
  function fetchStatement(id: string) {
    return fetch(`/api/admin/statements/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to, message }) })
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) { toast.error(d.error ?? 'Η κατάσταση δεν φορτώθηκε'); return; }
        setP(d);
        setEmail(d.recipient ?? customers.find((c) => String(c.trdr) === id)?.email ?? '');
        setKey(`${id}:${qs}:${Date.now()}`);
      })
      .finally(() => { setLoading(false); });
  }
  function load(id = target) {
    setLoading(true);
    setP(null);
    return fetchStatement(id);
  }
  React.useEffect(() => { if (initialTrdr) void fetchStatement(String(initialTrdr)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(targetKind: 'me' | 'customer') {
    if (targetKind === 'customer') {
      const ok = await confirmAction({
        title: 'Αποστολή στον πελάτη',
        message: `Θα σταλεί η κατάσταση λογαριασμού (${p?.customer}, υπόλοιπο ${eur(p?.summary.closing ?? 0)}) με συνημμένο PDF στο ${email}. Συνέχεια;`,
        confirmLabel: 'Αποστολή',
      });
      if (!ok) return;
    }
    setSending(targetKind);
    try {
      const res = await fetch(`/api/admin/statements/${target}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to, message, target: targetKind, email }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(d.error ?? 'Η αποστολή απέτυχε');
      else if (d.result === 'skipped') toast.info(`Δεν στάλθηκε (δοκιμαστικό περιβάλλον) → ${d.to}`);
      else toast.success(`Στάλθηκε στο ${d.to}`);
    } finally { setSending(null); }
  }

  const s = p?.summary;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,340px)_1fr]">
      <aside className="space-y-3 rounded-md border bg-card p-3 sm:p-4 lg:sticky lg:top-4 lg:self-start">
        <div>
          <div className={cn(LABEL, 'mb-1')}>Πελάτης</div>
          <div className="min-w-0 [&_button]:min-h-10 [&_button>span]:truncate [&_button>span]:text-left">
            <Combobox value={trdr} items={items} onSelect={(v) => { setTrdr(v); setP(null); }} placeholder="Επιλέξτε πελάτη…" />
          </div>
          <button type="button" onClick={() => { setTrdr(null); void load('sample'); }} className="mt-1.5 cursor-pointer text-(length:--fs-12) text-primary underline-offset-4 hover:underline">
            ή δείτε δείγμα με φανταστικό πελάτη
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className={LABEL}>Από</span><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-10" /></label>
          <label className="block"><span className={LABEL}>Έως</span><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="mt-1 h-10" /></label>
        </div>
        <label className="block">
          <span className={LABEL}>Μήνυμα (προαιρετικό)</span>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={600}
            placeholder="π.χ. Σας ευχαριστούμε για τη συνεργασία…" className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-(length:--fs-13) outline-hidden focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <Button onClick={() => load()} disabled={loading} className="min-h-10 w-full cursor-pointer gap-1.5">
          <FiEye className="size-4" />{loading ? 'Ανάγνωση καρτέλας από SoftOne…' : 'Προεπισκόπηση'}
        </Button>
        <p className="text-(length:--fs-11-5) text-muted-foreground">Η καρτέλα διαβάζεται ζωντανά από το SoftOne (μόνο ανάγνωση, ~5–10″). Τίποτα δεν γράφεται.</p>

        {banks === 0 && (
          <div className="flex gap-2 rounded-md p-2.5 text-(length:--fs-12)" style={{ background: soft('#B45309', 10), color: '#92400E' }}>
            <FiAlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>Δεν έχουν οριστεί τραπεζικοί λογαριασμοί — το email/PDF θα βγει χωρίς IBAN. Ρυθμίσεις → Εταιρεία → «Τραπεζικοί λογαριασμοί».</span>
          </div>
        )}

        {p && (
          <div className="space-y-2 border-t pt-3">
            <a href={`/api/admin/statements/${target}/pdf?${qs}&download=1`} className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border bg-background text-(length:--fs-13) font-medium hover:bg-muted">
              <FiDownload className="size-4" />Λήψη PDF
            </a>
            <Button variant="outline" onClick={() => send('me')} disabled={!!sending} className="min-h-10 w-full cursor-pointer gap-1.5">
              <FiSend className="size-4" />{sending === 'me' ? 'Αποστολή…' : `Δοκιμή σε εμένα (${me})`}
            </Button>
            {trdr && canSend && (
              <div className="space-y-1.5 rounded-md border border-dashed p-2.5">
                <label className="block"><span className={LABEL}>Email πελάτη</span>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="logistirio@…" className="mt-1 h-10" />
                </label>
                <Button onClick={() => send('customer')} disabled={!!sending || !email} className="min-h-10 w-full cursor-pointer gap-1.5">
                  <FiSend className="size-4" />{sending === 'customer' ? 'Αποστολή…' : 'Αποστολή στον πελάτη'}
                </Button>
                {!email && <p className="text-(length:--fs-11-5) text-muted-foreground">Ο πελάτης δεν έχει email στο SoftOne — συμπληρώστε το παραπάνω.</p>}
              </div>
            )}
          </div>
        )}
      </aside>

      <section className="min-w-0 space-y-3" aria-live="polite">
        {!p && !loading && (
          <div className="flex min-h-72 flex-col items-center justify-center rounded-md border border-dashed bg-card p-8 text-center">
            <FiFileText className="mb-2 size-7 text-muted-foreground" />
            <p className="text-(length:--fs-14) font-medium">Επιλέξτε πελάτη και περίοδο</p>
            <p className="mt-1 max-w-md text-(length:--fs-12-5) text-muted-foreground">Θα δείτε το email και το PDF της κατάστασης (υπόλοιπο, κινήσεις, ανοιχτά παραστατικά, στοιχεία πληρωμής) πριν σταλεί οτιδήποτε.</p>
          </div>
        )}
        {loading && <div className="h-72 animate-pulse rounded-md border bg-muted/50 motion-reduce:animate-none" aria-label="Φόρτωση" />}
        {p && s && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { k: s.closing < 0 ? 'Πιστωτικό υπόλοιπο' : 'Υπόλοιπο', v: eur(Math.abs(s.closing)), strong: true },
                { k: 'Ληξιπρόθεσμο >30 ημ.', v: eur(s.overdue), warn: s.overdue > 0 },
                { k: 'Ανοιχτά παραστατικά', v: String(s.open) },
                { k: 'Κινήσεις περιόδου', v: String(s.lines) },
              ].map((x) => (
                <div key={x.k} className={cn('rounded-md border p-3', x.strong ? 'bg-foreground text-background' : 'bg-card')}>
                  <div className={cn('text-(length:--fs-10) font-semibold uppercase tracking-wide', x.strong ? 'opacity-70' : 'text-muted-foreground')}>{x.k}</div>
                  <div className="mt-1 text-(length:--fs-18) font-semibold tabular-nums" style={x.warn ? { color: '#B45309' } : undefined}>{x.v}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2.5">
              <Segmented label="Προβολή" value={view} onChange={setView} options={[{ value: 'email', label: 'Email', icon: FiEye }, { value: 'pdf', label: 'PDF', icon: FiFileText }]} />
              {view === 'email' && <Segmented label="Μορφή" value={mode} onChange={setMode} options={[{ value: 'html', label: 'HTML' }, { value: 'text', label: 'Απλό κείμενο' }]} />}
              <span className="min-w-0 truncate text-(length:--fs-12) text-muted-foreground"><span className="font-medium text-foreground">Θέμα:</span> {p.subject}</span>
            </div>
            {view === 'email'
              ? <EmailFrame html={p.html} text={p.text} mode={mode} device="desktop" />
              : <iframe key={key} title="PDF κατάστασης λογαριασμού" src={`/api/admin/statements/${target}/pdf?${qs}`} className="h-[min(1100px,85dvh)] w-full rounded-md border bg-white" />}
          </>
        )}
      </section>
    </div>
  );
}

export function EmailsClient({ templates, customers, me, canSend, banks, initialTab, initialTrdr }: {
  templates: TemplateView[]; customers: Customer[]; me: string; canSend: boolean; banks: number; initialTab: 'templates' | 'statement'; initialTrdr: number | null;
}) {
  return (
    <Tabs defaultValue={initialTab}>
      <TabsList className="mb-3">
        <TabsTrigger value="templates" className="cursor-pointer">Όλα τα email ({templates.length})</TabsTrigger>
        <TabsTrigger value="statement" className="cursor-pointer">Κατάσταση λογαριασμού</TabsTrigger>
      </TabsList>
      <TabsContent value="templates"><TemplatesTab templates={templates} me={me} /></TabsContent>
      <TabsContent value="statement"><StatementTab customers={customers} me={me} canSend={canSend} banks={banks} initialTrdr={initialTrdr} /></TabsContent>
    </Tabs>
  );
}
