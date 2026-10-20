'use client';

import * as React from 'react';
import {
  FiTool, FiMic, FiSquare, FiEdit3, FiMoreVertical, FiRefreshCw, FiTrash2, FiCheck, FiFilm, FiImage,
  FiFileText, FiExternalLink, FiAlertTriangle, FiLoader, FiUploadCloud, FiPlus, FiCamera, FiHelpCircle,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { InstallGuideDTO, InstallGuideState, InstallNoteDTO } from '@/lib/install-guide/service';
import type { ItemMediaDTO } from '@/lib/item-media/service';
import { UploadProgressDialog, type MediaKind } from './upload-progress-dialog';
import { toggleInstallSample, uploadVideoFrames } from './video-frames';

const TONE = '#B45309';
const REC = '#DC2626';
const soft = (hex: string, pct: number) => `color-mix(in srgb, ${hex} ${pct}%, var(--background))`;
const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';
const MAX_SECONDS = 10 * 60;
const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtWhen = (iso: string) => new Date(iso).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short' });

/** Η πρώτη μορφή που υποστηρίζει ο browser (Chrome/Firefox: webm, Safari: mp4). */
function recorderMime(): string {
  const prefs = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return prefs.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';
}

function SectionTitle({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="mb-2 flex items-start gap-2">
      <span className="grid size-6 shrink-0 place-items-center rounded-full text-(length:--fs-12) font-bold text-white" style={{ backgroundColor: TONE }}>{n}</span>
      <div className="min-w-0">
        <h3 className="text-(length:--fs-14) font-semibold text-foreground">{title}</h3>
        {hint && <p className="text-(length:--fs-11) text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

/** Ηχογράφηση με MediaRecorder: χρονόμετρο, ένδειξη έντασης, αυτόματο σταμάτημα στα 10 λεπτά. */
function Recorder({ disabled, onRecorded }: { disabled: boolean; onRecorded: (blob: Blob, seconds: number) => Promise<void> }) {
  const [state, setState] = React.useState<'idle' | 'recording' | 'sending'>('idle');
  const [secs, setSecs] = React.useState(0);
  const [level, setLevel] = React.useState(0);
  const rec = React.useRef<{ mr: MediaRecorder; stream: MediaStream; ctx: AudioContext; started: number; raf: number; timer: number } | null>(null);

  const cleanup = React.useCallback(() => {
    const r = rec.current;
    if (!r) return;
    cancelAnimationFrame(r.raf);
    clearInterval(r.timer);
    r.stream.getTracks().forEach((t) => t.stop());
    void r.ctx.close().catch(() => null);
    rec.current = null;
    setLevel(0);
  }, []);
  React.useEffect(() => () => { if (rec.current?.mr.state === 'recording') rec.current.mr.stop(); cleanup(); }, [cleanup]);

  const stop = React.useCallback(() => { if (rec.current?.mr.state === 'recording') rec.current.mr.stop(); }, []);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Ο browser δεν υποστηρίζει ηχογράφηση.');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast.error('Δεν δόθηκε πρόσβαση στο μικρόφωνο — επέτρεψέ τη από τη γραμμή διευθύνσεων του browser.');
      return;
    }
    const mime = recorderMime();
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      setLevel(Math.min(1, peak / 64));
      if (rec.current) rec.current.raf = requestAnimationFrame(tick);
    };
    const started = Date.now();
    const timer = window.setInterval(() => {
      const s = (Date.now() - started) / 1000;
      setSecs(s);
      if (s >= MAX_SECONDS) stop();
    }, 250);
    mr.onstop = async () => {
      const seconds = (Date.now() - started) / 1000;
      cleanup();
      const blob = new Blob(chunks, { type: mr.mimeType || mime || 'audio/webm' });
      if (seconds < 1 || !blob.size) { setState('idle'); toast.error('Πολύ σύντομη ηχογράφηση.'); return; }
      setState('sending');
      try { await onRecorded(blob, seconds); } finally { setState('idle'); setSecs(0); }
    };
    rec.current = { mr, stream, ctx, started, raf: 0, timer };
    rec.current.raf = requestAnimationFrame(tick);
    mr.start(1000);
    setSecs(0);
    setState('recording');
  };

  const recording = state === 'recording';
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5"
      style={{ borderColor: recording ? REC : soft(TONE, 35), backgroundColor: recording ? soft(REC, 6) : soft(TONE, 5) }}
    >
      <button
        type="button"
        onClick={recording ? stop : start}
        disabled={disabled || state === 'sending'}
        aria-label={recording ? 'Τέλος ηχογράφησης' : 'Έναρξη ηχογράφησης'}
        className="relative grid size-12 shrink-0 cursor-pointer place-items-center rounded-full text-white shadow-xs transition-transform duration-150 hover:scale-105 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
        style={{ backgroundColor: REC }}
      >
        {recording && <span className="absolute inset-0 animate-ping rounded-full opacity-30 motion-reduce:hidden" style={{ backgroundColor: REC }} aria-hidden />}
        {state === 'sending' ? <FiLoader className="size-5 animate-spin motion-reduce:animate-none" aria-hidden />
          : recording ? <FiSquare className="size-5 fill-current" aria-hidden /> : <FiMic className="size-5" aria-hidden />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-(length:--fs-13) font-semibold text-foreground">
          {state === 'sending' ? 'Απομαγνητοφώνηση…' : recording ? 'Ηχογράφηση — μίλα κανονικά' : 'Πάτα και εκφώνησε τις οδηγίες'}
        </p>
        <p className="text-(length:--fs-11) text-muted-foreground">
          {state === 'sending' ? 'Ο ήχος αποθηκεύεται και γίνεται κείμενο (λίγα δευτερόλεπτα).'
            : recording ? `Πάτα ■ για τέλος · έως ${MAX_SECONDS / 60} λεπτά ανά ηχογράφηση`
              : 'Μπορείς να κάνεις πολλές ηχογραφήσεις — π.χ. μία ανά φάση της εργασίας.'}
        </p>
      </div>
      {recording && (
        <div className="flex items-center gap-2" aria-live="off">
          <div className="flex h-6 items-end gap-0.5" aria-hidden>
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className="w-1 rounded-sm transition-[height] duration-75" style={{ height: `${Math.max(12, Math.min(100, level * 140 - i * 6 + (i % 3) * 8))}%`, backgroundColor: REC, opacity: level * 8 > i ? 1 : 0.25 }} />
            ))}
          </div>
          <span className="text-(length:--fs-14) font-semibold tabular-nums" style={{ color: REC }}>{fmtDur(secs)}</span>
        </div>
      )}
    </div>
  );
}

function NoteCard({ mtrl, note, index, canManage, onSaved, onRetranscribe, onDelete }: {
  mtrl: number; note: InstallNoteDTO; index: number; canManage: boolean;
  onSaved: (n: InstallNoteDTO) => void; onRetranscribe: () => Promise<void>; onDelete: () => void;
}) {
  const [text, setText] = React.useState(note.transcript);
  const [saving, setSaving] = React.useState<'idle' | 'saving' | 'saved'>('idle');
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { setText(note.transcript); }, [note.transcript]);

  // Αποθήκευση στο blur — μόνο αν άλλαξε το κείμενο.
  const save = async () => {
    if (text.trim() === note.transcript.trim()) return;
    setSaving('saving');
    try {
      const res = await fetch(`/api/admin/items/${mtrl}/install-guide/notes/${note.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Το κείμενο δεν αποθηκεύτηκε');
      onSaved(body.note); setSaving('saved');
    } catch (e) { setSaving('idle'); toast.error((e as Error).message); }
  };

  return (
    <li className="rounded-lg border border-border bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-2.5 py-1.5">
        <span className="rounded-full px-2 text-(length:--fs-11) font-semibold tabular-nums" style={{ color: TONE, backgroundColor: soft(TONE, 14) }}>#{index + 1}</span>
        {note.audioUrl ? (
          <audio src={note.audioUrl} controls preload="none" className="h-8 min-w-0 max-w-full flex-1 sm:max-w-xs" aria-label={`Ηχογράφηση ${index + 1}`} />
        ) : (
          <span className="flex-1 text-(length:--fs-11) text-muted-foreground"><FiEdit3 className="mr-1 inline size-3" aria-hidden />Γραπτή σημείωση</span>
        )}
        <span className="text-(length:--fs-11) tabular-nums text-muted-foreground">
          {note.durationSec ? `${fmtDur(note.durationSec)} · ` : ''}{fmtWhen(note.createdAt)}
        </span>
        <span className="min-w-18 text-right text-(length:--fs-11) text-muted-foreground" aria-live="polite">
          {busy ? 'Απομαγνητοφώνηση…' : saving === 'saving' ? 'Αποθήκευση…' : saving === 'saved' ? <><FiCheck className="inline size-3" aria-hidden /> Αποθηκεύτηκε</> : ''}
        </span>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ενέργειες για την ηχογράφηση ${index + 1}`}>
              <FiMoreVertical className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {note.audioUrl && (
                <DropdownMenuItem className={ITEM} disabled={busy} onSelect={async () => { setBusy(true); try { await onRetranscribe(); } finally { setBusy(false); } }}>
                  <FiRefreshCw className="size-3.5" aria-hidden /> Νέα απομαγνητοφώνηση
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" className={ITEM} onSelect={onDelete}>
                <FiTrash2 className="size-3.5" aria-hidden /> Διαγραφή
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setSaving('idle'); }}
        onBlur={() => void save()}
        readOnly={!canManage}
        rows={Math.min(10, Math.max(3, Math.ceil(text.length / 90)))}
        placeholder={note.audioUrl ? 'Κενό κείμενο — δοκίμασε «Νέα απομαγνητοφώνηση» ή γράψε εδώ.' : ''}
        aria-label={`Κείμενο ηχογράφησης ${index + 1}`}
        className="block w-full resize-y rounded-b-lg bg-transparent px-3 py-2 text-(length:--fs-13) leading-relaxed text-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />
    </li>
  );
}

function SampleTile({ m, canManage, busy, onToggle, onFrames }: {
  m: ItemMediaDTO; canManage: boolean; busy: boolean; onToggle: () => void; onFrames: () => void;
}) {
  const on = m.isInstallSample;
  const noFrames = m.kind === 'VIDEO' && on && !m.sampleFrames.length;
  return (
    <div className={cn('group relative overflow-hidden rounded-md border-2 bg-muted transition-colors duration-150', on ? '' : 'border-transparent')} style={on ? { borderColor: TONE } : undefined}>
      <button
        type="button" disabled={!canManage || busy} onClick={onToggle} aria-pressed={on}
        aria-label={`${on ? 'Αφαίρεση από' : 'Σήμανση ως'} δείγμα εγκατάστασης: ${m.name}`}
        className="block aspect-square w-full cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
      >
        {m.kind === 'VIDEO' ? (
          m.sampleFrames[0] || m.thumbUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={m.sampleFrames[0] ?? m.thumbUrl ?? ''} alt="" className={cn('size-full object-cover', !on && 'opacity-70')} />
            : <video src={`${m.url}#t=0.5`} preload="metadata" muted playsInline className={cn('pointer-events-none size-full object-cover', !on && 'opacity-70')} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.thumbUrl ?? m.url} alt="" loading="lazy" className={cn('size-full object-cover', !on && 'opacity-70')} />
        )}
        <span
          className={cn('absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-md border-2 shadow-xs', on ? 'text-white' : 'border-white bg-black/30 text-transparent')}
          style={on ? { backgroundColor: TONE, borderColor: TONE } : undefined} aria-hidden
        >
          {busy ? <FiLoader className="size-3.5 animate-spin text-white motion-reduce:animate-none" /> : <FiCheck className="size-3.5" />}
        </span>
        {m.kind === 'VIDEO' && (
          <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5 text-(length:--fs-10) font-semibold text-white">
            <FiFilm className="size-3" aria-hidden /> {m.sampleFrames.length ? `${m.sampleFrames.length} καρέ` : 'βίντεο'}
          </span>
        )}
      </button>
      {noFrames && canManage && (
        <button
          type="button" onClick={onFrames} disabled={busy}
          className="absolute inset-x-1.5 bottom-1.5 inline-flex cursor-pointer items-center justify-center gap-1 rounded-md bg-amber-500 px-1.5 py-1 text-(length:--fs-10) font-semibold text-amber-950 shadow-xs hover:bg-amber-400"
        >
          <FiCamera className="size-3" aria-hidden /> Λήψη καρέ
        </button>
      )}
    </div>
  );
}

function GuideCard({ g, latest }: { g: InstallGuideDTO; latest: boolean }) {
  const c = g.content;
  return (
    <article className={cn('rounded-lg border bg-background', latest ? 'border-2' : 'border-border')} style={latest ? { borderColor: soft(TONE, 60) } : undefined}>
      <div className="flex flex-wrap items-start gap-2 px-3 py-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-md" style={{ backgroundColor: soft(TONE, 14), color: TONE }} aria-hidden><FiFileText className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-(length:--fs-13) font-semibold text-foreground">{c.title || 'Οδηγός εγκατάστασης'}</p>
          <p className="text-(length:--fs-11) text-muted-foreground">
            {fmtWhen(g.createdAt)} · {c.steps.length} βήματα · προφίλ {g.profileLabel}{c.difficulty ? ` · ${c.difficulty}` : ''}
          </p>
        </div>
        {g.pdfUrl && (
          <a
            href={g.pdfUrl} target="_blank" rel="noopener"
            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 text-(length:--fs-12) font-medium text-white transition-opacity duration-150 hover:opacity-90"
            style={{ backgroundColor: TONE }}
          >
            <FiExternalLink className="size-3.5" aria-hidden /> Άνοιγμα PDF
          </a>
        )}
      </div>
      {latest && (
        <div className="border-t border-border/70 px-3 py-2">
          {c.summary && <p className="mb-2 text-(length:--fs-12) text-foreground">{c.summary}</p>}
          <ol className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
            {c.steps.map((s, i) => (
              <li key={i} className="flex gap-1.5 text-(length:--fs-12) text-muted-foreground">
                <span className="font-semibold tabular-nums" style={{ color: TONE }}>{i + 1}.</span>
                <span className="min-w-0 truncate" title={s.title}>{s.title}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </article>
  );
}

/** «Οδηγίες εγκατάστασης» ενός είδους: ηχογραφήσεις → κείμενο, δείγματα, οδηγός + PDF. */
export function InstallGuideDialog({ mtrl, open, onOpenChange, canManage, onChanged }: {
  mtrl: number; open: boolean; onOpenChange: (o: boolean) => void; canManage: boolean;
  /** Άλλαξαν μέσα/αρχεία του είδους (δείγματα, νέο PDF) — για ανανέωση του panel. */
  onChanged?: () => void;
}) {
  const [state, setState] = React.useState<InstallGuideState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busyMedia, setBusyMedia] = React.useState<Set<string>>(new Set());
  const [writing, setWriting] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [generating, setGenerating] = React.useState(false);
  const [upload, setUpload] = React.useState<{ kind: MediaKind; files: File[]; before: Set<string> } | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [pickKind, setPickKind] = React.useState<MediaKind>('IMAGE');

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/items/${mtrl}/install-guide`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Αποτυχία φόρτωσης');
      setState(body as InstallGuideState); setError(null);
      return body as InstallGuideState;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [mtrl]);
  React.useEffect(() => { if (open) void load(); }, [open, load]);

  const setNotes = (fn: (n: InstallNoteDTO[]) => InstallNoteDTO[]) => setState((s) => (s ? { ...s, notes: fn(s.notes) } : s));

  const onRecorded = async (blob: Blob, seconds: number) => {
    const fd = new FormData();
    const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    fd.append('audio', blob, `odigies.${ext}`);
    fd.append('durationSec', String(seconds));
    const res = await fetch(`/api/admin/items/${mtrl}/install-guide/notes`, { method: 'POST', body: fd });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.message || 'Η ηχογράφηση δεν αποθηκεύτηκε'); return; }
    setNotes((n) => [...n, body.note]);
    if (body.error) toast.warning(body.error); else toast.success('Η ηχογράφηση έγινε κείμενο — έλεγξέ το και διόρθωσε ό,τι χρειάζεται.');
  };

  const addText = async () => {
    const res = await fetch(`/api/admin/items/${mtrl}/install-guide/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: draft }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.message || 'Η σημείωση δεν αποθηκεύτηκε'); return; }
    setNotes((n) => [...n, body.note]); setDraft(''); setWriting(false);
  };

  const retranscribe = async (id: string) => {
    const res = await fetch(`/api/admin/items/${mtrl}/install-guide/notes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ retranscribe: true }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.message || 'Η απομαγνητοφώνηση απέτυχε'); return; }
    setNotes((n) => n.map((x) => (x.id === id ? body.note : x)));
    toast.success('Νέο κείμενο από την ηχογράφηση');
  };

  const removeNote = async (n: InstallNoteDTO, i: number) => {
    const ok = await confirmAction({
      title: 'Διαγραφή ηχογράφησης', message: `Να διαγραφεί η ηχογράφηση #${i + 1}${n.audioUrl ? ' (και ο ήχος της)' : ''}; Δεν αναιρείται.`,
      confirmLabel: 'Διαγραφή', destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/items/${mtrl}/install-guide/notes/${n.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Η διαγραφή απέτυχε'); return; }
    setNotes((list) => list.filter((x) => x.id !== n.id));
  };

  const withBusy = async (id: string, fn: () => Promise<void>) => {
    setBusyMedia((s) => new Set(s).add(id));
    try { await fn(); } finally { setBusyMedia((s) => { const n = new Set(s); n.delete(id); return n; }); }
  };

  const toggle = (m: ItemMediaDTO, on = !m.isInstallSample) => withBusy(m.id, async () => {
    try {
      const { framesError } = await toggleInstallSample(mtrl, m, on);
      if (framesError) toast.warning(`Το βίντεο μαρκαρίστηκε, αλλά τα καρέ του δεν τραβήχτηκαν (${framesError}). Χωρίς καρέ δεν μπαίνει στον οδηγό — πάτα «Λήψη καρέ».`);
      await load(); onChanged?.();
    } catch (e) { toast.error((e as Error).message); }
  });

  const frames = (m: ItemMediaDTO) => withBusy(m.id, async () => {
    try { await uploadVideoFrames(mtrl, m.id, m.url); toast.success('Τα καρέ του βίντεο αποθηκεύτηκαν'); await load(); } catch (e) { toast.error((e as Error).message); }
  });

  // Μετά το ανέβασμα από εδώ, τα νέα αρχεία μαρκάρονται αυτόματα ως δείγματα.
  const afterUpload = async () => {
    const before = upload?.before ?? new Set<string>();
    const s = await load();
    const fresh = (s?.media ?? []).filter((m) => !before.has(m.id) && !m.isInstallSample);
    for (const m of fresh) await toggle(m, true);
    onChanged?.();
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/admin/items/${mtrl}/install-guide`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Η δημιουργία του οδηγού απέτυχε');
      setState((s) => (s ? { ...s, guides: [body.guide, ...s.guides] } : s));
      toast.success('Ο οδηγός δημιουργήθηκε και το PDF αποθηκεύτηκε στα Αρχεία του είδους.');
      onChanged?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setGenerating(false); }
  };

  const samples = state?.media.filter((m) => m.isInstallSample) ?? [];
  const hasText = !!state?.notes.some((n) => n.transcript.trim());
  const usable = samples.filter((m) => m.kind === 'IMAGE' || m.sampleFrames.length).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!generating) onOpenChange(o); }}>
      <DialogContent className="flex max-h-[92dvh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="flex-row items-center gap-3 border-b border-border px-4 py-2.5 pr-12">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: soft(TONE, 14), color: TONE }}><FiTool className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-(length:--fs-15)">Οδηγίες εγκατάστασης</DialogTitle>
            <DialogDescription className="truncate text-(length:--fs-11)">
              {state ? `${state.item.code} · ${state.item.name}` : 'Φόρτωση…'}
            </DialogDescription>
          </div>
          {state && (
            <span className="hidden shrink-0 rounded-full px-2.5 py-0.5 text-(length:--fs-11) font-semibold sm:inline" style={{ color: TONE, backgroundColor: soft(TONE, 12) }} title={state.profile.focus.join(' · ')}>
              Προφίλ: {state.profile.label}
            </span>
          )}
          {/* Βοήθεια (wiki: reference-data/install-guide, helpAnchor «install-guide»). */}
          <a
            href="/wiki/reference-data/install-guide" target="_blank" rel="noopener"
            title="Βοήθεια: Οδηγίες εγκατάστασης" aria-label="Βοήθεια: Οδηγίες εγκατάστασης"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          >
            <FiHelpCircle className="size-4" aria-hidden />
          </a>
        </DialogHeader>

        <DialogBody className="space-y-5 py-4">
          {error && !state && (
            <div role="alert" className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-(length:--fs-12)">
              <FiAlertTriangle className="size-4 text-destructive" aria-hidden /><span className="flex-1">{error}</span>
              <Button variant="outline" size="sm" onClick={() => void load()}><FiRefreshCw aria-hidden /> Δοκιμή ξανά</Button>
            </div>
          )}
          {!state && !error && <div className="h-40 animate-pulse rounded-md bg-muted motion-reduce:animate-none" aria-busy="true" aria-label="Φόρτωση" />}

          {state && (
            <>
              <section aria-labelledby="ig-notes">
                <SectionTitle n={1} title="Εκφώνησε τις οδηγίες" hint="Η φωνή γίνεται κείμενο που μπορείς να διορθώσεις. Πες τα όπως θα τα εξηγούσες στο μάστορα." />
                <span id="ig-notes" className="sr-only">Ηχογραφήσεις</span>
                {canManage && <Recorder disabled={generating} onRecorded={onRecorded} />}
                {state.notes.length > 0 && (
                  <ol className="mt-2 space-y-2">
                    {state.notes.map((n, i) => (
                      <NoteCard
                        key={n.id} mtrl={mtrl} note={n} index={i} canManage={canManage}
                        onSaved={(x) => setNotes((list) => list.map((y) => (y.id === x.id ? x : y)))}
                        onRetranscribe={() => retranscribe(n.id)}
                        onDelete={() => void removeNote(n, i)}
                      />
                    ))}
                  </ol>
                )}
                {canManage && (writing ? (
                  <div className="mt-2 space-y-2 rounded-lg border border-border p-2">
                    <textarea
                      value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} autoFocus
                      placeholder="Γράψε οδηγίες ή συμπληρώσεις (π.χ. χρόνοι αναμονής, ποσότητες)…" aria-label="Νέα γραπτή σημείωση"
                      className="block w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-(length:--fs-13) outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => { setWriting(false); setDraft(''); }}>Άκυρο</Button>
                      <Button size="sm" disabled={!draft.trim()} onClick={() => void addText()}><FiCheck aria-hidden /> Προσθήκη</Button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setWriting(true)} className="mt-2 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-(length:--fs-12) text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground">
                    <FiPlus className="size-3.5" aria-hidden /> Γραπτή σημείωση
                  </button>
                ))}
              </section>

              <section aria-label="Δείγματα εγκατάστασης">
                <SectionTitle
                  n={2} title={`Δείγματα εγκατάστασης · ${samples.length}`}
                  hint="Μάρκαρε φωτογραφίες/βίντεο της εγκατάστασης. Χρησιμοποιούνται ΜΟΝΟ για τον οδηγό — δεν εμφανίζονται σε προσφορές, portal ή site."
                />
                {canManage && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    <input
                      ref={fileInput} type="file" multiple hidden
                      accept={pickKind === 'VIDEO' ? 'video/mp4,video/webm,video/quicktime' : 'image/*'}
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = '';
                        if (files.length) setUpload({ kind: pickKind, files, before: new Set(state.media.map((m) => m.id)) });
                      }}
                    />
                    {(['IMAGE', 'VIDEO'] as const).map((k) => (
                      <Button key={k} variant="outline" size="sm" disabled={!!upload} onClick={() => { setPickKind(k); setTimeout(() => fileInput.current?.click(), 0); }}>
                        <FiUploadCloud aria-hidden /> {k === 'IMAGE' ? 'Ανέβασμα φωτογραφιών' : 'Ανέβασμα βίντεο'}
                      </Button>
                    ))}
                  </div>
                )}
                {state.media.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-5 text-center text-(length:--fs-12) text-muted-foreground">
                    <FiImage className="mr-1 inline size-3.5" aria-hidden /> Το είδος δεν έχει ακόμη φωτογραφίες ή βίντεο.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
                    {state.media.map((m) => (
                      <SampleTile key={m.id} m={m} canManage={canManage} busy={busyMedia.has(m.id)} onToggle={() => void toggle(m)} onFrames={() => void frames(m)} />
                    ))}
                  </div>
                )}
              </section>

              <section aria-label="Οδηγός">
                <SectionTitle n={3} title="Οδηγός για τα μαστόρια" hint={`Το AI συνθέτει τα κείμενα, τα δείγματα και την κατηγορία (${state.profile.label}) σε οδηγό και τον σώζει ως PDF στα Αρχεία του είδους.`} />
                {canManage && (
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-3 py-2.5" style={{ borderColor: soft(TONE, 45) }}>
                    <Button onClick={() => void generate()} disabled={!hasText || generating} className="text-white" style={{ backgroundColor: TONE }}>
                      {generating ? <FiLoader className="animate-spin motion-reduce:animate-none" aria-hidden /> : <FiFileText aria-hidden />}
                      {generating ? 'Δημιουργία…' : state.guides.length ? 'Νέος οδηγός & PDF' : 'Δημιουργία οδηγού & PDF'}
                    </Button>
                    <p className="min-w-0 flex-1 text-(length:--fs-11) text-muted-foreground" aria-live="polite">
                      {generating ? 'Συνθέτω τον οδηγό και φτιάχνω το PDF — περίπου 30-60 δευτερόλεπτα.'
                        : !hasText ? 'Χρειάζεται τουλάχιστον μία ηχογράφηση με κείμενο.'
                          : `${state.notes.filter((n) => n.transcript.trim()).length} κείμενα · ${usable} δείγματα με εικόνα`}
                    </p>
                  </div>
                )}
                {state.guides.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {state.guides.map((g, i) => <GuideCard key={g.id} g={g} latest={i === 0} />)}
                  </div>
                ) : !canManage && (
                  <p className="text-(length:--fs-12) text-muted-foreground">Δεν υπάρχει ακόμη οδηγός.</p>
                )}
              </section>
            </>
          )}
        </DialogBody>

        {upload && (
          <UploadProgressDialog
            mtrl={mtrl} kind={upload.kind} files={upload.files} open
            onOpenChange={(o) => { if (!o) setUpload(null); }}
            onFinished={() => { void afterUpload(); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
