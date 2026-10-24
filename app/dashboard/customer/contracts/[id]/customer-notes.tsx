'use client';

// Σημειώσεις & ειδικές οδηγίες του πελάτη στην προσφορά του: βλέπει όσες μοιραζόμαστε μαζί του και τις
// δικές του, και γράφει νέα — γενικά ή για συγκεκριμένο χώρο / πληρωμή / εργασία, με φωτογραφίες. Ύφος website.
import * as React from 'react';
import { FiCamera, FiLoader, FiSend, FiX } from 'react-icons/fi';
import { addCustomerNoteAction } from '../actions';

export type PortalNote = { id: string; body: string; author: string; mine: boolean; when: string; target: string | null; instruction: boolean; photos: string[] };
export type PortalTarget = { value: string; label: string };

export function CustomerNotes({ id, notes, targets, disabledReason }: { id: string; notes: PortalNote[]; targets: PortalTarget[]; disabledReason?: string | null }) {
  const [body, setBody] = React.useState('');
  const [target, setTarget] = React.useState('CONTRACT');
  const [files, setFiles] = React.useState<File[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const submit = () => start(async () => {
    setError(null);
    const [type, tid] = target.split(':');
    const label = targets.find((t) => t.value === target)?.label ?? null;
    const fd = new FormData();
    fd.set('data', JSON.stringify({ targetType: type, targetId: tid ?? null, targetLabel: type === 'CONTRACT' ? null : label, body }));
    for (const f of files) fd.append('photos', f);
    const r = await addCustomerNoteAction(id, fd);
    if (!r.ok) { setError(r.message); return; }
    setBody(''); setFiles([]); setTarget('CONTRACT');
  });

  return (
    <div className="space-y-6">
      {notes.length === 0 ? (
        <p className="text-(length:--fs-15) text-(--s-ink-2)">Δεν υπάρχουν σημειώσεις ακόμη. Γράψτε μας ό,τι θέλετε να προσέξουμε — π.χ. ώρες πρόσβασης, χρώμα αρμού, προστασία επίπλων.</p>
      ) : (
        <ul className="space-y-4">
          {notes.map((n) => (
            <li key={n.id} className={n.mine ? 'border-l-2 border-(--s-accent) bg-(--s-paper) px-5 py-4' : 'border-l-2 border-(--s-ink) bg-white px-5 py-4'}>
              <p className="text-(length:--fs-12) uppercase tracking-[0.12em] text-(--s-mute)">
                {n.mine ? 'Εσείς' : n.author} · {n.when}{n.target ? ` · ${n.target}` : ''}{n.instruction ? ' · ειδική οδηγία' : ''}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-(length:--fs-15) text-(--s-ink)">{n.body}</p>
              {n.photos.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {n.photos.map((p, i) => (
                    <li key={p}><a href={`/api/portal/note-files/${p}`} target="_blank" rel="noopener noreferrer"><img src={`/api/portal/note-files/${p}`} alt={`Φωτογραφία ${i + 1}`} loading="lazy" className="size-20 object-cover" /></a></li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {disabledReason ? (
        <p className="border-l-2 border-(--s-accent) bg-(--s-paper) px-5 py-4 text-(length:--fs-14) text-(--s-ink-2)">{disabledReason}</p>
      ) : (
        <div className="space-y-3 border border-(--s-line) bg-white p-5">
          <label className="block text-(length:--fs-13) text-(--s-mute)" htmlFor="cn-target">Αφορά</label>
          <select id="cn-target" value={target} onChange={(e) => setTarget(e.target.value)} className="min-h-12 w-full border border-(--s-line) bg-white px-3 text-(length:--fs-15)">
            {targets.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <label className="block text-(length:--fs-13) text-(--s-mute)" htmlFor="cn-body">Σημείωση ή οδηγία</label>
          <textarea id="cn-body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={4000}
            placeholder="π.χ. Στο μπάνιο θέλουμε τον αρμό ανοιχτό γκρι. Πρόσβαση στο κτήριο μόνο 08:00–15:00."
            className="w-full border border-(--s-line) bg-white px-3 py-2 text-(length:--fs-15) outline-hidden focus-visible:border-(--s-ink)" />
          {files.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 bg-(--s-paper) px-2 py-1 text-(length:--fs-13)">
                  <FiCamera className="size-3.5" aria-hidden /><span className="max-w-40 truncate">{f.name}</span>
                  <button type="button" aria-label={`Αφαίρεση ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="cursor-pointer text-(--s-mute) hover:text-(--s-ink)"><FiX className="size-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
          {error && <p role="alert" className="border-l-2 border-[#B42318] bg-[#B42318]/5 px-3 py-2 text-(length:--fs-13) text-[#B42318]">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-(length:--fs-14) text-(--s-ink) focus-within:underline">
              <FiCamera className="size-4 text-(--s-accent)" aria-hidden /><span className="s-link">Φωτογραφία</span>
              <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => { const l = e.target.files; if (l) setFiles((x) => [...x, ...[...l]].slice(0, 8)); e.target.value = ''; }} />
            </label>
            <button type="button" onClick={submit} disabled={pending || !body.trim()} className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 bg-(--s-ink) px-6 text-(length:--fs-15) font-medium text-white transition-colors hover:bg-[#2C4556] disabled:cursor-not-allowed disabled:opacity-40">
              {pending ? <FiLoader className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <FiSend className="size-4" aria-hidden />}
              {pending ? 'Αποστολή…' : 'Αποστολή'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
