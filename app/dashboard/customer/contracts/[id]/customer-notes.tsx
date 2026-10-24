'use client';

// Επικοινωνία του πελάτη στην προσφορά του: ερωτήσεις, αιτήματα αλλαγής και σημειώσεις — γενικά ή για
// συγκεκριμένη γραμμή / χώρο / πληρωμή / εργασία (κουμπί «Επισήμανση» δίπλα σε κάθε σημείο), με φωτογραφίες.
// Κάθε θέμα είναι νήμα με τις απαντήσεις μας και την κατάστασή του. Ύφος website.
import * as React from 'react';
import { FiCamera, FiCheck, FiCornerDownRight, FiHelpCircle, FiLoader, FiMessageCircle, FiEdit3, FiSend, FiX } from 'react-icons/fi';
import { addCustomerNoteAction } from '../actions';

export type PortalNote = {
  id: string; body: string; author: string; mine: boolean; when: string; target: string | null; instruction: boolean; photos: string[];
  kind: 'NOTE' | 'INSTRUCTION' | 'QUESTION' | 'CHANGE'; replyToId: string | null; resolved: boolean; revision: number | null;
};
export type PortalTarget = { value: string; label: string };

const ANNOTATE = 'portal:annotate';
/** Κουμπί δίπλα σε γραμμή / εργασία: ανοίγει τη φόρμα με το σημείο ήδη επιλεγμένο. */
export function AnnotateButton({ value, label, name }: { value: string; label: string; name: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(ANNOTATE, { detail: { value, label } }))}
      aria-label={`Ερώτηση ή αλλαγή για: ${name}`}
      className="inline-flex min-h-9 cursor-pointer items-center gap-1 text-(length:--fs-12) text-(--s-mute) transition-colors hover:text-(--s-ink) focus-visible:text-(--s-ink)">
      <FiMessageCircle className="size-3.5" aria-hidden /><span className="s-link">Ερώτηση / αλλαγή</span>
    </button>
  );
}

const KINDS = [
  { v: 'QUESTION', l: 'Ερώτηση', icon: FiHelpCircle, hint: 'Θέλετε να μάθετε κάτι για την προσφορά' },
  { v: 'CHANGE', l: 'Αίτημα αλλαγής', icon: FiEdit3, hint: 'Θέλετε να αλλάξει κάτι — ποσότητα, υλικό, χρόνος' },
  { v: 'NOTE', l: 'Σημείωση', icon: FiMessageCircle, hint: 'Κάτι να προσέξουμε — πρόσβαση, ώρες, χρώματα' },
] as const;
const KIND_LABEL: Record<string, string> = { QUESTION: 'Ερώτηση', CHANGE: 'Αίτημα αλλαγής', NOTE: 'Σημείωση', INSTRUCTION: 'Ειδική οδηγία' };

function status(n: PortalNote, replies: PortalNote[]) {
  if (n.kind !== 'QUESTION' && n.kind !== 'CHANGE') return null;
  if (n.resolved) return { l: 'Ολοκληρώθηκε', cls: 'text-[#2F6B3A]' };
  if (replies.some((r) => !r.mine)) return { l: 'Απαντήθηκε', cls: 'text-(--s-ink)' };
  return { l: 'Σε αναμονή απάντησης', cls: 'text-(--s-accent)' };
}

function Photos({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {ids.map((p, i) => (
        <li key={p}><a href={`/api/portal/note-files/${p}`} target="_blank" rel="noopener noreferrer"><img src={`/api/portal/note-files/${p}`} alt={`Φωτογραφία ${i + 1}`} loading="lazy" className="size-20 object-cover" /></a></li>
      ))}
    </ul>
  );
}

function Reply({ id, parent, onDone }: { id: string; parent: string; onDone: () => void }) {
  const [body, setBody] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const send = () => start(async () => {
    setError(null);
    const fd = new FormData();
    fd.set('data', JSON.stringify({ targetType: 'CONTRACT', body, replyToId: parent }));
    const r = await addCustomerNoteAction(id, fd);
    if (!r.ok) { setError(r.message); return; }
    setBody(''); onDone();
  });
  return (
    <div className="mt-3 space-y-2">
      <label htmlFor={`rp-${parent}`} className="sr-only">Απάντηση</label>
      <textarea id={`rp-${parent}`} value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={4000} placeholder="Γράψτε την απάντησή σας…"
        className="w-full border border-(--s-line) bg-white px-3 py-2 text-(length:--fs-15) outline-hidden focus-visible:border-(--s-ink)" />
      {error && <p role="alert" className="text-(length:--fs-13) text-[#B42318]">{error}</p>}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onDone} className="min-h-11 cursor-pointer px-3 text-(length:--fs-14) text-(--s-mute) hover:text-(--s-ink)">Άκυρο</button>
        <button type="button" onClick={send} disabled={pending || !body.trim()} className="p-btn p-btn-primary">
          {pending ? <FiLoader className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <FiSend className="size-4" aria-hidden />} Απάντηση
        </button>
      </div>
    </div>
  );
}

export function CustomerNotes({ id, notes, targets, disabledReason, canRequestChanges }: {
  id: string; notes: PortalNote[]; targets: PortalTarget[]; disabledReason?: string | null; canRequestChanges: boolean;
}) {
  const [body, setBody] = React.useState('');
  const [kind, setKind] = React.useState<'QUESTION' | 'CHANGE' | 'NOTE'>('QUESTION');
  const [target, setTarget] = React.useState('CONTRACT');
  const [extra, setExtra] = React.useState<PortalTarget[]>([]);
  const [files, setFiles] = React.useState<File[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [replyTo, setReplyTo] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const formRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const allTargets = React.useMemo(() => [...targets, ...extra.filter((e) => !targets.some((t) => t.value === e.value))], [targets, extra]);
  const kinds = KINDS.filter((k) => canRequestChanges || k.v !== 'CHANGE');

  // «Ερώτηση / αλλαγή» δίπλα σε γραμμή ή εργασία: επιλέγει το σημείο και πάει στη φόρμα.
  React.useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<PortalTarget>).detail;
      setExtra((x) => (x.some((t) => t.value === d.value) ? x : [...x, d]));
      setTarget(d.value);
      setSent(false);
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => bodyRef.current?.focus({ preventScroll: true }), 350);
    };
    window.addEventListener(ANNOTATE, h);
    return () => window.removeEventListener(ANNOTATE, h);
  }, []);

  const submit = () => start(async () => {
    setError(null);
    const [type, ...rest] = target.split(':');
    const tid = rest.join(':') || null;
    const label = allTargets.find((t) => t.value === target)?.label ?? null;
    const fd = new FormData();
    fd.set('data', JSON.stringify({ targetType: type, targetId: tid, targetLabel: type === 'CONTRACT' ? null : label, kind, body }));
    for (const f of files) fd.append('photos', f);
    const r = await addCustomerNoteAction(id, fd);
    if (!r.ok) { setError(r.message); return; }
    setBody(''); setFiles([]); setTarget('CONTRACT'); setSent(true);
  });

  const roots = notes.filter((n) => !n.replyToId);
  const repliesOf = (rid: string) => notes.filter((n) => n.replyToId === rid);
  const openCount = roots.filter((n) => (n.kind === 'QUESTION' || n.kind === 'CHANGE') && !n.resolved).length;

  return (
    <div className="space-y-8">
      {roots.length === 0 ? (
        <p className="text-(length:--fs-15) text-(--s-ink-2)">Δεν υπάρχουν μηνύματα ακόμη. Ρωτήστε μας ό,τι θέλετε ή ζητήστε αλλαγή — και από το «Ερώτηση / αλλαγή» δίπλα σε κάθε γραμμή.</p>
      ) : (
        <>
          {openCount > 0 && <p className="text-(length:--fs-14) text-(--s-ink-2)" aria-live="polite">{openCount} {openCount === 1 ? 'θέμα περιμένει' : 'θέματα περιμένουν'} απάντηση ή ολοκλήρωση.</p>}
          <ul className="space-y-4">
            {roots.map((n) => {
              const replies = repliesOf(n.id);
              const st = status(n, replies);
              return (
                <li key={n.id} className={n.mine ? 'border-l-2 border-(--s-accent) bg-(--s-paper) px-5 py-4' : 'border-l-2 border-(--s-ink) bg-white px-5 py-4'}>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-(length:--fs-12) uppercase tracking-[0.12em] text-(--s-mute)">
                    <span className="font-medium text-(--s-ink)">{KIND_LABEL[n.kind]}</span>
                    <span>{n.mine ? 'Εσείς' : n.author} · {n.when}</span>
                    {n.target && <span>· {n.target}</span>}
                    {n.revision != null && <span>· στην έκδοση {n.revision}</span>}
                    {st && <span className={`ml-auto inline-flex items-center gap-1 normal-case tracking-normal ${st.cls}`}>{n.resolved && <FiCheck className="size-3.5" aria-hidden />}{st.l}</span>}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-(length:--fs-15) text-(--s-ink)">{n.body}</p>
                  <Photos ids={n.photos} />
                  {replies.length > 0 && (
                    <ul className="mt-4 space-y-3 border-t border-(--s-line) pt-3">
                      {replies.map((r) => (
                        <li key={r.id} className="flex gap-2">
                          <FiCornerDownRight className="mt-1 size-4 shrink-0 text-(--s-mute)" aria-hidden />
                          <div className="min-w-0">
                            <p className="text-(length:--fs-12) uppercase tracking-[0.12em] text-(--s-mute)">{r.mine ? 'Εσείς' : r.author} · {r.when}</p>
                            <p className="mt-1 whitespace-pre-wrap text-(length:--fs-15) text-(--s-ink)">{r.body}</p>
                            <Photos ids={r.photos} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!disabledReason && (replyTo === n.id
                    ? <Reply id={id} parent={n.id} onDone={() => setReplyTo(null)} />
                    : <button type="button" onClick={() => setReplyTo(n.id)} className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-(length:--fs-14) text-(--s-ink)"><FiCornerDownRight className="size-4 text-(--s-accent)" aria-hidden /><span className="s-link">Απάντηση</span></button>)}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {disabledReason ? (
        <p className="border-l-2 border-(--s-accent) bg-(--s-paper) px-5 py-4 text-(length:--fs-14) text-(--s-ink-2)">{disabledReason}</p>
      ) : (
        <div ref={formRef} className="space-y-4 border border-(--s-line) bg-white p-5">
          <fieldset>
            <legend className="text-(length:--fs-13) text-(--s-mute)">Τι θέλετε να μας στείλετε;</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {kinds.map((k) => {
                const Icon = k.icon;
                const on = kind === k.v;
                return (
                  <label key={k.v} className={`flex min-h-12 cursor-pointer items-start gap-2 border px-3 py-2.5 text-(length:--fs-14) transition-colors ${on ? 'border-(--s-ink) bg-(--s-paper)' : 'border-(--s-line) hover:border-(--s-ink)'}`}>
                    <input type="radio" name="cn-kind" value={k.v} checked={on} onChange={() => setKind(k.v)} className="sr-only" />
                    <Icon className={`mt-0.5 size-4 shrink-0 ${on ? 'text-(--s-accent)' : 'text-(--s-mute)'}`} aria-hidden />
                    <span><span className="block text-(--s-ink)">{k.l}</span><span className="block text-(length:--fs-12) text-(--s-mute)">{k.hint}</span></span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div>
            <label className="block text-(length:--fs-13) text-(--s-mute)" htmlFor="cn-target">Αφορά</label>
            <select id="cn-target" value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1 min-h-12 w-full border border-(--s-line) bg-white px-3 text-(length:--fs-15)">
              {allTargets.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-(length:--fs-13) text-(--s-mute)" htmlFor="cn-body">{kind === 'QUESTION' ? 'Η ερώτησή σας' : kind === 'CHANGE' ? 'Τι θέλετε να αλλάξει' : 'Η σημείωσή σας'}</label>
            <textarea ref={bodyRef} id="cn-body" value={body} onChange={(e) => { setBody(e.target.value); setSent(false); }} rows={4} maxLength={4000}
              placeholder={kind === 'CHANGE' ? 'π.χ. Στο μπάνιο θέλουμε τραβερτίνο μόνο στο δάπεδο, όχι στους τοίχους.' : kind === 'QUESTION' ? 'π.χ. Πόσες μέρες θα χρειαστεί το μπάνιο; Μπορούμε να το χρησιμοποιούμε στο μεταξύ;' : 'π.χ. Πρόσβαση στο κτήριο μόνο 08:00–15:00.'}
              className="mt-1 w-full border border-(--s-line) bg-white px-3 py-2 text-(length:--fs-15) outline-hidden focus-visible:border-(--s-ink)" />
          </div>
          {files.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 bg-(--s-paper) px-2 py-1 text-(length:--fs-13)">
                  <FiCamera className="size-3.5" aria-hidden /><span className="max-w-40 truncate">{f.name}</span>
                  <button type="button" aria-label={`Αφαίρεση ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="inline-flex size-8 cursor-pointer items-center justify-center text-(--s-mute) hover:text-(--s-ink)"><FiX className="size-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
          {error && <p role="alert" className="border-l-2 border-[#B42318] bg-[#B42318]/5 px-3 py-2 text-(length:--fs-13) text-[#B42318]">{error}</p>}
          {sent && <p role="status" className="border-l-2 border-[#2F6B3A] bg-(--s-paper) px-3 py-2 text-(length:--fs-14) text-(--s-ink-2)">Το λάβαμε. Θα σας απαντήσουμε εδώ — μένει στο ιστορικό της προσφοράς.</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-(length:--fs-14) text-(--s-ink) focus-within:underline">
              <FiCamera className="size-4 text-(--s-accent)" aria-hidden /><span className="s-link">Φωτογραφία</span>
              <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => { const l = e.target.files; if (l) setFiles((x) => [...x, ...[...l]].slice(0, 8)); e.target.value = ''; }} />
            </label>
            <button type="button" onClick={submit} disabled={pending || !body.trim()} className="p-btn p-btn-primary">
              {pending ? <FiLoader className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <FiSend className="size-4" aria-hidden />}
              {pending ? 'Αποστολή…' : 'Αποστολή'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
