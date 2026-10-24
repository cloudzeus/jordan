'use client';

// AI οδηγός «Ζητήστε προσφορά»: συνομιλία (μία ερώτηση τη φορά, έτοιμες απαντήσεις) αριστερά και ζωντανή κάρτα
// «Το αίτημά σας» δεξιά — τι έχει συμπληρωθεί, αν το αναλαμβάνουμε, και αποστολή. Ο βοηθός δεν δίνει τιμές.
// Μετά την αποστολή: σαφή επόμενα βήματα, ώστε ο πελάτης να ξέρει τι ακολουθεί. Ύφος website.
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FiAlertTriangle, FiCamera, FiCheck, FiCheckCircle, FiCircle, FiCpu, FiLoader, FiRefreshCw, FiSend, FiX } from 'react-icons/fi';
import { emptyDraft, verdictText, type AgentTurn, type ChatMsg, type RfpDraft } from '@/lib/rfp-agent-core';
import { createOfferRequestAction, rfpAgentAction } from './actions';
import { RequestForm } from './request-form';
import { SitePicker, type PickSite } from './site-picker';

const GREETING = 'Γεια σας! Είμαι ο ψηφιακός βοηθός μας. Πείτε μου με λίγα λόγια τι θα θέλατε να φτιάξουμε — θα σας κάνω μερικές απλές ερωτήσεις και θα ετοιμάσουμε μαζί το αίτημα προσφοράς.';
const STARTERS = ['Πέτρινο δάπεδο', 'Τσιμεντοκονία στο μπάνιο', 'Πάγκος κουζίνας από πέτρα', 'Βεράντα ή εξωτερικός χώρος'];

const CHECKS: { k: string; l: string; ok: (d: RfpDraft, photos: number) => boolean }[] = [
  { k: 'what', l: 'Τι θέλετε', ok: (d) => !!d.title },
  { k: 'where', l: 'Ποιοι χώροι', ok: (d) => d.areas.length > 0 },
  { k: 'size', l: 'Μέγεθος ή φωτογραφία', ok: (d, ph) => d.areas.some((a) => a.m2 != null) || ph > 0 },
  { k: 'material', l: 'Υλικό / στυλ', ok: (d) => !!d.material },
  { k: 'kind', l: 'Υλικά ή και τοποθέτηση', ok: (d) => d.kind !== 'UNKNOWN' },
  { k: 'site', l: 'Πού είναι το έργο', ok: (d) => d.site.trim().length >= 2 },
  { k: 'when', l: 'Πότε', ok: (d) => !!d.timing },
];
const VERDICT = {
  YES: { cls: 'text-[#15803D]', bg: 'bg-[#15803D]/8', icon: FiCheckCircle },
  PARTIAL: { cls: 'text-[#B45309]', bg: 'bg-[#B45309]/8', icon: FiAlertTriangle },
  NO: { cls: 'text-[#B42318]', bg: 'bg-[#B42318]/8', icon: FiAlertTriangle },
  UNKNOWN: { cls: 'text-(--s-mute)', bg: 'bg-(--s-paper)', icon: FiCircle },
} as const;

export function RfpWizard({ disabledReason, sites = [] }: { disabledReason?: string | null; sites?: PickSite[] }) {
  const router = useRouter();
  const [msgs, setMsgs] = React.useState<ChatMsg[]>([{ role: 'assistant', text: GREETING }]);
  const [quick, setQuick] = React.useState<string[]>(STARTERS);
  const [draft, setDraft] = React.useState<RfpDraft>(emptyDraft);
  const [scope, setScope] = React.useState<AgentTurn['scope']>({ verdict: 'UNKNOWN', can: [], cannot: [] });
  const [ready, setReady] = React.useState(false);
  const [input, setInput] = React.useState('');
  const [files, setFiles] = React.useState<File[]>([]);
  const [thinking, setThinking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState<string | null>(null);
  const [manual, setManual] = React.useState(false);
  const [siteId, setSiteId] = React.useState(() => (sites.find((s) => s.isDefault) ?? sites[0])?.id ?? '');
  const endRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [msgs, thinking]);

  const ask = async (text: string) => {
    const t = text.trim();
    if (!t || thinking) return;
    const history: ChatMsg[] = [...msgs, { role: 'user', text: t }];
    setMsgs(history); setInput(''); setQuick([]); setError(null); setThinking(true);
    const known = sites.find((s) => s.id === siteId);
    const r = await rfpAgentAction({ history: history.slice(1), draft, photos: files.length, knownSite: known ? `${known.label}${known.line ? ` — ${known.line}` : ''}` : null }).catch(() => null);
    setThinking(false);
    if (!r?.ok) { setError(r && 'message' in r ? r.message : 'Ο βοηθός δεν απάντησε — δοκιμάστε ξανά.'); return; }
    setMsgs((m) => [...m, { role: 'assistant', text: r.data.reply }]);
    setQuick(r.data.quickReplies); setDraft(r.data.draft); setScope(r.data.scope); setReady(r.data.ready);
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
  };

  const retry = () => {
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    setMsgs((m) => m.slice(0, m.lastIndexOf(lastUser)));
    void ask(lastUser.text);
  };

  // Μια αποθηκευμένη τοποθεσία καλύπτει το «Περιοχή» ακόμη κι αν ο βοηθός δεν τη ρώτησε.
  const picked = sites.find((s) => s.id === siteId);
  const eff = picked ? { ...draft, site: draft.site || picked.label } : draft;
  const done = CHECKS.filter((c) => c.ok(eff, files.length)).length;
  const userTurns = msgs.filter((m) => m.role === 'user').length;
  const hasSite = eff.site.trim().length >= 2;
  const canSend = !!draft.title && hasSite && (ready || userTurns >= 3);

  const send = async () => {
    setSending(true); setError(null);
    const fd = new FormData();
    fd.set('data', JSON.stringify({ rfp: draft, scope, siteId: siteId || null, transcript: msgs.slice(1).slice(-60) }));
    for (const f of files) fd.append('photos', f);
    const r = await createOfferRequestAction(fd).catch(() => null);
    setSending(false);
    if (!r?.ok) { setError(r && 'message' in r ? r.message : 'Η αποστολή δεν έγινε — δοκιμάστε ξανά.'); return; }
    setSent(r.data.ref);
    router.refresh();
  };

  if (manual) return (
    <div className="space-y-4">
      <button type="button" onClick={() => setManual(false)} className="s-link min-h-11 text-(length:--fs-14) text-(--s-ink)">← Με τον βοηθό</button>
      <RequestForm disabledReason={disabledReason} sites={sites} />
    </div>
  );

  if (sent) return (
    <div className="border border-(--s-ink) bg-white p-6 md:p-8" role="status">
      <p className="flex items-center gap-2 text-(length:--fs-18) text-[#15803D]"><FiCheckCircle className="size-5" aria-hidden />Λάβαμε το αίτημά σας <span className="p-amount tabular-nums text-(--s-ink)">{sent}</span></p>
      <p className="mt-2 text-(length:--fs-15) text-(--s-ink-2)">Σας στείλαμε και επιβεβαίωση με email. Τι ακολουθεί:</p>
      <ol className="mt-6 space-y-4">
        {[
          ['Ελέγχουμε το αίτημα', 'Ένας άνθρωπος της ομάδας μας το διαβάζει — αν χρειαστεί, σας καλούμε ή κανονίζουμε αυτοψία.'],
          ['Σας στέλνουμε προσφορά', 'Θα τη βρείτε στις «Προσφορές & συμβάσεις», με αναλυτικές γραμμές και χρονοδιάγραμμα.'],
          ['Ρωτάτε ή ζητάτε αλλαγές', 'Κατευθείαν πάνω στην προσφορά — όλα μένουν στο ιστορικό.'],
          ['Αποδοχή και ξεκινάμε', 'Με την αποδοχή γίνεται έργο και βλέπετε την πρόοδο μέρα με τη μέρα.'],
        ].map(([t, d], i) => (
          <li key={t} className="flex gap-4">
            <span className={`p-amount inline-flex size-8 shrink-0 items-center justify-center text-(length:--fs-14) ${i === 0 ? 'bg-(--s-ink) text-white' : 'border border-(--s-line) text-(--s-ink)'}`}>{i + 1}</span>
            <span><span className="block text-(length:--fs-16) text-(--s-ink)">{t}</span><span className="block text-(length:--fs-14) text-(--s-ink-2)">{d}</span></span>
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => { setSent(null); setMsgs([{ role: 'assistant', text: GREETING }]); setQuick(STARTERS); setDraft(emptyDraft()); setScope({ verdict: 'UNKNOWN', can: [], cannot: [] }); setReady(false); setFiles([]); }}
        className="s-link mt-6 min-h-11 text-(length:--fs-14) text-(--s-ink)">Νέο αίτημα</button>
    </div>
  );

  const V = VERDICT[scope.verdict];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      {/* ── Συνομιλία ── */}
      <section aria-label="Συνομιλία με τον βοηθό" className="flex min-h-[32rem] flex-col border border-(--s-line) bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-(--s-line) px-5 py-3">
          <span className="flex items-center gap-2 text-(length:--fs-14) text-(--s-ink)"><FiCpu className="size-4 text-(--s-accent)" aria-hidden />AI βοηθός προσφορών</span>
          <span className="text-(length:--fs-12) text-(--s-mute)">Τιμές δίνουμε μόνο με την προσφορά μας</span>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-live="polite">
          {msgs.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex'}>
              <p className={`max-w-[85%] whitespace-pre-wrap px-4 py-3 text-(length:--fs-15) leading-relaxed ${m.role === 'user' ? 'bg-(--s-ink) text-white' : 'bg-(--s-paper) text-(--s-ink)'}`}>
                {m.role === 'assistant' && <span className="sr-only">Βοηθός: </span>}{m.text}
              </p>
            </div>
          ))}
          {thinking && <p className="flex items-center gap-2 text-(length:--fs-14) text-(--s-mute)"><FiLoader className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />Ο βοηθός γράφει…</p>}
          {error && (
            <p role="alert" className="flex flex-wrap items-center gap-3 border-l-2 border-[#B42318] bg-[#B42318]/5 px-3 py-2 text-(length:--fs-14) text-[#B42318]">
              {error}
              <button type="button" onClick={retry} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-(--s-ink)"><FiRefreshCw className="size-4" aria-hidden /><span className="s-link">Ξανά</span></button>
            </p>
          )}
          <div ref={endRef} />
        </div>
        {quick.length > 0 && !thinking && (
          <div className="flex flex-wrap gap-2 px-5 pb-3">
            {quick.map((q) => (
              <button key={q} type="button" onClick={() => void ask(q)} disabled={!!disabledReason && false}
                className="min-h-11 cursor-pointer border border-(--s-line) bg-white px-3.5 text-(length:--fs-14) text-(--s-ink) transition-colors hover:border-(--s-ink)">{q}</button>
            ))}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); void ask(input); }} className="flex items-end gap-2 border-t border-(--s-line) p-3">
          <label className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center text-(--s-accent) hover:text-(--s-ink) focus-within:ring-2 focus-within:ring-(--s-ink)" title="Φωτογραφία ή κάτοψη">
            <FiCamera className="size-5" aria-hidden /><span className="sr-only">Φωτογραφία ή κάτοψη</span>
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { const l = e.target.files; if (l) setFiles((x) => [...x, ...[...l]].slice(0, 8)); e.target.value = ''; }} />
          </label>
          <label htmlFor="rfp-in" className="sr-only">Η απάντησή σας</label>
          <textarea id="rfp-in" ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} rows={1} maxLength={2000} placeholder="Γράψτε εδώ…"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(input); } }}
            className="max-h-40 min-h-11 flex-1 resize-none border border-(--s-line) bg-white px-3 py-2.5 text-(length:--fs-15) outline-hidden focus-visible:border-(--s-ink)" />
          <button type="submit" disabled={thinking || !input.trim()} aria-label="Αποστολή μηνύματος"
            className="p-btn p-btn-primary size-11 shrink-0 !px-0 !min-h-11">
            <FiSend className="size-4" aria-hidden />
          </button>
        </form>
      </section>

      {/* ── Το αίτημά σας ── */}
      <aside aria-labelledby="rfp-sum" className="space-y-4 lg:sticky lg:top-28 lg:self-start">
        <section className="border border-(--s-line) bg-white p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="rfp-sum" className="font-site text-(length:--fs-22) font-medium">Το αίτημά σας</h2>
            <span className="text-(length:--fs-13) tabular-nums text-(--s-mute)">{done}/{CHECKS.length}</span>
          </div>
          <div className="mt-3 h-1.5 bg-(--s-paper)" role="progressbar" aria-valuemin={0} aria-valuemax={CHECKS.length} aria-valuenow={done} aria-label="Πληρότητα αιτήματος">
            <div className="h-full bg-(--s-ink) transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${(done / CHECKS.length) * 100}%` }} />
          </div>
          {draft.title && <p className="mt-4 text-(length:--fs-16) text-(--s-ink)">{draft.title}</p>}
          <ul className="mt-3 space-y-1.5">
            {CHECKS.map((c) => {
              const ok = c.ok(eff, files.length);
              return (
                <li key={c.k} className={`flex items-center gap-2 text-(length:--fs-14) ${ok ? 'text-(--s-ink)' : 'text-(--s-mute)'}`}>
                  {ok ? <FiCheck className="size-4 shrink-0 text-[#15803D]" aria-hidden /> : <FiCircle className="size-3.5 shrink-0" aria-hidden />}
                  <span>{c.l}<span className="sr-only">{ok ? ' — έτοιμο' : ' — λείπει'}</span></span>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 border-t border-(--s-line) pt-3">
            <SitePicker id="rfp-site" sites={sites} value={siteId} onChange={setSiteId} text={draft.site ?? ''} onText={(v) => setDraft((d) => ({ ...d, site: v }))} showError={!!draft.title && !hasSite && userTurns >= 2} field="mt-1 w-full border border-(--s-line) bg-white px-3 text-(length:--fs-15) outline-hidden focus-visible:border-(--s-ink)" />
          </div>
          {draft.areas.length > 0 && (
            <ul className="mt-4 border-t border-(--s-line) pt-3 text-(length:--fs-14) text-(--s-ink-2)">
              {draft.areas.map((a, i) => <li key={i} className="flex justify-between gap-3 py-0.5"><span>{a.name}{a.surfaces ? ` · ${a.surfaces}` : ''}</span><span className="tabular-nums">{a.m2 != null ? `${a.m2.toLocaleString('el-GR')} m²` : '—'}</span></li>)}
            </ul>
          )}
          {files.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1 bg-(--s-paper) px-2 py-1 text-(length:--fs-12)">
                  <FiCamera className="size-3.5" aria-hidden /><span className="max-w-32 truncate">{f.name}</span>
                  <button type="button" aria-label={`Αφαίρεση ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="inline-flex size-8 cursor-pointer items-center justify-center text-(--s-mute) hover:text-(--s-ink)"><FiX className="size-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {scope.verdict !== 'UNKNOWN' && (
          <section className={`p-4 ${V.bg}`} aria-label="Αν το αναλαμβάνουμε">
            <p className={`flex items-center gap-2 text-(length:--fs-15) ${V.cls}`}><V.icon className="size-4 shrink-0" aria-hidden />{verdictText(scope.verdict)}</p>
            {scope.cannot.length > 0 && <p className="mt-1.5 text-(length:--fs-13) text-(--s-ink-2)">Δεν κάνουμε: {scope.cannot.join(', ')} — μπορούμε να σας συστήσουμε συνεργάτη.</p>}
            {scope.verdict === 'NO' && <p className="mt-1.5 text-(length:--fs-13) text-(--s-ink-2)">Μπορείτε να το στείλετε ως ερώτηση — θα σας απαντήσουμε.</p>}
          </section>
        )}

        {disabledReason ? (
          <p className="border-l-2 border-(--s-accent) bg-(--s-paper) px-4 py-3 text-(length:--fs-13) text-(--s-ink-2)">{disabledReason}</p>
        ) : (
          <button type="button" onClick={() => void send()} disabled={!canSend || sending}
            className="p-btn p-btn-primary w-full">
            {sending ? <FiLoader className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <FiSend className="size-4" aria-hidden />}
            {sending ? 'Αποστολή…' : ready ? 'Αποστολή αιτήματος' : 'Αποστολή όπως είναι'}
          </button>
        )}
        {!canSend && !disabledReason && <p className="text-(length:--fs-12) text-(--s-mute)">{draft.title && !hasSite ? 'Λείπει μόνο πού είναι το έργο — αρκεί η πόλη ή η περιοχή.' : 'Συνεχίστε τη συζήτηση — η αποστολή ενεργοποιείται μόλις ξέρουμε τι χρειάζεστε.'}</p>}
        <button type="button" onClick={() => setManual(true)} className="s-link min-h-11 text-(length:--fs-13) text-(--s-ink-2)">Προτιμώ να συμπληρώσω απλή φόρμα</button>
      </aside>
    </div>
  );
}
