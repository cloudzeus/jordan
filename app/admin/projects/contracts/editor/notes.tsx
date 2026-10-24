'use client';

// Σημειώσεις / ειδικές οδηγίες σε κάθε σημείο της προσφοράς (γενικά, χώρος, πληρωμή, εργασία). Δίπλα σε
// κάθε σημείο ένα κουμπί με μετρητή ανοίγει τη «συζήτηση»: ποιος έγραψε (εμείς / πελάτης), κοινοποίηση ανά
// σημείωση (πελάτης, συνεργεία), φωτογραφίες, «ειδική οδηγία» (μπαίνει στα έγγραφα) και «→ εργασία».
import * as React from 'react';
import { toast } from 'sonner';
import {
  FiAlertTriangle, FiCalendar, FiCamera, FiCheckCircle, FiLoader, FiMessageSquare, FiMoreVertical, FiRotateCcw, FiSend, FiShare2, FiTrash2, FiX,
} from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { NoteView } from '@/lib/contracts/notes';
import { cn } from '@/lib/utils';
import { addNoteAction, deleteNoteAction, linkNoteTaskAction, updateNoteAction } from '../actions';

export type NoteTarget = { type: 'CONTRACT' | 'ROOM' | 'MILESTONE' | 'TASK'; id: string | null; label: string };
type Ctx = {
  contractId: string | null;
  notes: NoteView[];
  parties: { key: string; name: string }[];
  taskKeys: Set<string>;
  onToTask: (n: NoteView) => string | null;
  readOnly: boolean;
};
const NotesCtx = React.createContext<Ctx | null>(null);
export const NotesProvider = NotesCtx.Provider;

const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';
const when = (iso: string) => new Date(iso).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fileUrl = (id: string) => `/api/admin/entity-files/file/${id}`;
const matches = (n: NoteView, t: NoteTarget) => n.targetType === t.type && (t.type === 'CONTRACT' || n.targetId === t.id);

/** Ετικέτες κοινοποίησης: «Εμείς» πάντα, μετά πελάτης / συνεργεία. */
function ShareChips({ share, parties }: { share: string[]; parties: Ctx['parties'] }) {
  const label = (s: string) => (s === 'CUSTOMER' ? 'Πελάτης' : parties.find((p) => `PARTY:${p.key}` === s)?.name ?? 'Συνεργείο');
  return (
    <span className="flex flex-wrap gap-1">
      {share.length === 0 && <span className="rounded bg-muted px-1.5 text-(length:--fs-10) text-muted-foreground">Μόνο εμείς</span>}
      {share.map((s) => <span key={s} className="rounded bg-sky-50 px-1.5 text-(length:--fs-10) text-sky-900 ring-1 ring-inset ring-sky-200">{label(s)}</span>)}
    </span>
  );
}

function NoteItem({ n, ctx }: { n: NoteView; ctx: Ctx }) {
  const [busy, setBusy] = React.useState(false);
  const run = async (f: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    const r = await f();
    setBusy(false);
    if (!r.ok) toast.error(r.message ?? 'Δεν έγινε');
  };
  const id = ctx.contractId!;
  const shareOpts = [{ v: 'CUSTOMER', l: 'Πελάτης' }, ...ctx.parties.map((p) => ({ v: `PARTY:${p.key}`, l: p.name }))];
  const isTask = !!n.taskId && ctx.taskKeys.has(n.taskId);
  return (
    <li className={cn('rounded-lg p-2.5', n.authorKind === 'CUSTOMER' ? 'bg-amber-50/70 ring-1 ring-inset ring-amber-200' : 'bg-muted/50', n.resolved && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <p className="flex flex-wrap items-center gap-1.5 text-(length:--fs-11) text-muted-foreground">
          <span className="font-semibold text-foreground">{n.authorKind === 'CUSTOMER' ? `Πελάτης · ${n.authorName ?? ''}` : n.authorName ?? 'Εμείς'}</span>
          <span>{when(n.createdAt)}</span>
          {n.kind === 'INSTRUCTION' && <span className="inline-flex items-center gap-1 rounded bg-orange-100 px-1.5 font-medium text-orange-900"><FiAlertTriangle className="size-3" aria-hidden />Ειδική οδηγία</span>}
          {n.resolved && <span className="inline-flex items-center gap-1 text-emerald-800"><FiCheckCircle className="size-3" aria-hidden />Επιλύθηκε</span>}
          {isTask && <span className="inline-flex items-center gap-1 text-primary"><FiCalendar className="size-3" aria-hidden />Εργασία</span>}
        </p>
        {!ctx.readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger disabled={busy} className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground" aria-label="Ενέργειες σημείωσης">
              {busy ? <FiLoader className="size-3.5 animate-spin" aria-hidden /> : <FiMoreVertical className="size-3.5" aria-hidden />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuItem className={ITEM} disabled={isTask} onSelect={() => {
                const key = ctx.onToTask(n);
                if (key) void run(() => linkNoteTaskAction(id, n.id, key)).then(() => toast.success('Έγινε εργασία στο χρονοδιάγραμμα — πατήστε «Αποθήκευση»'));
              }}><FiCalendar className="size-3.5" />{isTask ? 'Έχει γίνει εργασία' : 'Μετατροπή σε εργασία'}</DropdownMenuItem>
              <DropdownMenuItem className={ITEM} onSelect={() => void run(() => updateNoteAction(id, n.id, { kind: n.kind === 'INSTRUCTION' ? 'NOTE' : 'INSTRUCTION' }))}>
                <FiAlertTriangle className="size-3.5" />{n.kind === 'INSTRUCTION' ? 'Απλή σημείωση' : 'Ειδική οδηγία (στα έγγραφα)'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-1.5 text-(length:--fs-11) text-muted-foreground"><FiShare2 className="size-3" />Κοινοποίηση σε</DropdownMenuLabel>
              {shareOpts.map((o) => (
                <DropdownMenuCheckboxItem key={o.v} className="text-(length:--fs-12)" checked={n.shareWith.includes(o.v)} onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(on) => void run(() => updateNoteAction(id, n.id, { shareWith: on ? [...n.shareWith, o.v] : n.shareWith.filter((x) => x !== o.v) }))}>
                  {o.l}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className={ITEM} onSelect={() => void run(() => updateNoteAction(id, n.id, { resolved: !n.resolved }))}>
                {n.resolved ? <FiRotateCcw className="size-3.5" /> : <FiCheckCircle className="size-3.5" />}{n.resolved ? 'Άνοιγμα ξανά' : 'Επιλύθηκε'}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" className={ITEM} onSelect={() => void run(() => deleteNoteAction(id, n.id))}><FiTrash2 className="size-3.5" />Διαγραφή</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-(length:--fs-13) leading-relaxed">{n.body}</p>
      {n.photoFileIds.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {n.photoFileIds.map((f, i) => (
            <li key={f}><a href={fileUrl(f)} target="_blank" rel="noopener noreferrer"><img src={fileUrl(f)} alt={`Φωτογραφία ${i + 1} της σημείωσης`} loading="lazy" className="size-14 rounded-md object-cover ring-1 ring-border" /></a></li>
          ))}
        </ul>
      )}
      <div className="mt-1.5"><ShareChips share={n.shareWith} parties={ctx.parties} /></div>
    </li>
  );
}

/** Νέα σημείωση: κείμενο, ειδική οδηγία, κοινοποίηση, φωτογραφίες. */
function Composer({ target, ctx }: { target: NoteTarget; ctx: Ctx }) {
  const [body, setBody] = React.useState('');
  const [instruction, setInstruction] = React.useState(false);
  const [share, setShare] = React.useState<string[]>([]);
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    if (!body.trim() || !ctx.contractId) return;
    setBusy(true);
    const fd = new FormData();
    fd.set('data', JSON.stringify({ targetType: target.type, targetId: target.id, targetLabel: target.label, kind: instruction ? 'INSTRUCTION' : 'NOTE', body, shareWith: share }));
    for (const f of files) fd.append('photos', f);
    const r = await addNoteAction(ctx.contractId, fd);
    setBusy(false);
    if (!r.ok) { toast.error(r.message); return; }
    setBody(''); setFiles([]); setInstruction(false); setShare([]);
  };
  const opts = [{ v: 'CUSTOMER', l: 'Πελάτης' }, ...ctx.parties.map((p) => ({ v: `PARTY:${p.key}`, l: p.name }))];
  return (
    <div className="space-y-2 border-t border-border pt-2">
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={4000} aria-label="Νέα σημείωση"
        placeholder="Σημείωση ή ειδική οδηγία…" className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-(length:--fs-13) outline-hidden focus-visible:ring-2 focus-visible:ring-ring" />
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" aria-pressed={instruction} onClick={() => setInstruction((x) => !x)}
          className={cn('inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-(length:--fs-11) font-medium', instruction ? 'border-orange-300 bg-orange-100 text-orange-900' : 'border-border text-muted-foreground hover:text-foreground')}>
          <FiAlertTriangle className="size-3" aria-hidden />Ειδική οδηγία
        </button>
        {opts.map((o) => {
          const on = share.includes(o.v);
          return (
            <button key={o.v} type="button" aria-pressed={on} onClick={() => setShare((s) => (on ? s.filter((x) => x !== o.v) : [...s, o.v]))} title={`Κοινοποίηση: ${o.l}`}
              className={cn('inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-(length:--fs-11) font-medium', on ? 'border-sky-300 bg-sky-50 text-sky-900' : 'border-border text-muted-foreground hover:text-foreground')}>
              <FiShare2 className="size-3" aria-hidden />{o.l}
            </button>
          );
        })}
      </div>
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-(length:--fs-11)">
              <FiCamera className="size-3" aria-hidden /><span className="max-w-32 truncate">{f.name}</span>
              <button type="button" aria-label={`Αφαίρεση ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="cursor-pointer text-muted-foreground hover:text-destructive"><FiX className="size-3" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-2">
        <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-(length:--fs-12) text-muted-foreground hover:bg-muted hover:text-foreground focus-within:ring-2 focus-within:ring-ring">
          <FiCamera className="size-3.5" aria-hidden />Φωτογραφία
          <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => { const l = e.target.files; if (l) setFiles((x) => [...x, ...[...l]].slice(0, 8)); e.target.value = ''; }} />
        </label>
        <Button type="button" size="sm" onClick={() => void submit()} disabled={busy || !body.trim()} className="gap-1.5">
          {busy ? <FiLoader className="size-3.5 animate-spin" aria-hidden /> : <FiSend className="size-3.5" aria-hidden />}Προσθήκη
        </Button>
      </div>
      <p className="text-(length:--fs-10) text-muted-foreground">Χωρίς κοινοποίηση τη βλέπουμε μόνο εμείς. Η «ειδική οδηγία» μπαίνει στα έγγραφα όσων τη βλέπουν.</p>
    </div>
  );
}

/** Η συζήτηση ενός σημείου (λίστα + νέα σημείωση). */
export function NoteThread({ target }: { target: NoteTarget }) {
  const ctx = React.useContext(NotesCtx);
  if (!ctx) return null;
  if (!ctx.contractId) return <p className="text-(length:--fs-12) text-muted-foreground">Οι σημειώσεις γράφονται αφού δημιουργηθεί η προσφορά (πατήστε «Δημιουργία»).</p>;
  const list = ctx.notes.filter((n) => matches(n, target));
  return (
    <div className="space-y-2">
      {list.length === 0 ? <p className="text-(length:--fs-12) text-muted-foreground">Καμία σημείωση ακόμη.</p> : <ul className="space-y-1.5">{list.map((n) => <NoteItem key={n.id} n={n} ctx={ctx} />)}</ul>}
      {!ctx.readOnly && <Composer target={target} ctx={ctx} />}
    </div>
  );
}

/** Κουμπί σημειώσεων δίπλα σε ένα σημείο: μετρητής, πορτοκαλί όταν υπάρχει σημείωση του πελάτη ή οδηγία. */
export function NoteButton({ target, className }: { target: NoteTarget; className?: string }) {
  const ctx = React.useContext(NotesCtx);
  if (!ctx) return null;
  const list = ctx.notes.filter((n) => matches(n, target) && !n.resolved);
  const hot = list.some((n) => n.authorKind === 'CUSTOMER' || n.kind === 'INSTRUCTION');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Σημειώσεις: ${target.label}${list.length ? ` (${list.length})` : ''}`} title="Σημειώσεις & ειδικές οδηγίες"
          className={cn('relative inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring', list.length > 0 && (hot ? 'text-orange-700' : 'text-primary'), className)}>
          <FiMessageSquare className="size-4" aria-hidden />
          {list.length > 0 && <span className={cn('absolute right-0.5 top-0.5 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-4 text-white', hot ? 'bg-orange-600' : 'bg-primary')}>{list.length}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[70dvh] w-[min(24rem,92vw)] overflow-y-auto p-3">
        <p className="mb-2 text-(length:--fs-13) font-semibold">Σημειώσεις · {target.label}</p>
        <NoteThread target={target} />
      </PopoverContent>
    </Popover>
  );
}

export const useNotes = () => React.useContext(NotesCtx);
