'use client';

// «Αρχεία» πελάτη/προμηθευτή ή έργου: υποφάκελοι, drag & drop με πρόοδο, λίστα με ⋮ ανά αρχείο.
// Στον πελάτη/προμηθευτή φαίνονται ΚΑΙ οι φάκελοι των έργων του (ό,τι ανέβηκε από το έργο).
import * as React from 'react';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import {
  FiAlertTriangle, FiBriefcase, FiChevronRight, FiDownload, FiEdit3, FiEye, FiFile, FiFileText, FiFolder,
  FiFolderPlus, FiGrid, FiMessageSquare, FiMoreVertical, FiMove, FiRefreshCw, FiTrash2, FiUploadCloud, FiX,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { confirmAction } from '@/components/ui/confirm-dialog';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ACCEPT_EXTENSIONS, ALLOWED_HINT, DEFAULT_SUBFOLDERS, MAX_ENTITY_FILE_BYTES, extOf, typeOfExt, type FileFamily,
} from '@/lib/entity-files/core';
import type { EntityFileDTO, EntityFolderDTO } from '@/lib/entity-files/service';

type Scope = 'traders' | 'projects';
type ProjectFolder = EntityFolderDTO & { role: 'customer' | 'supplier' };
interface Payload { folder: EntityFolderDTO; projects: ProjectFolder[]; canManage: boolean }
type Job = { id: string; file: File; progress: number; status: 'uploading' | 'processing' | 'error'; error?: string };

const FAMILY: Record<FileFamily, { tone: string; label: string; icon: React.ComponentType<{ className?: string }> }> = {
  cad: { tone: '#B91C1C', label: 'CAD', icon: FiGrid },
  pdf: { tone: '#C2410C', label: 'PDF', icon: FiFileText },
  excel: { tone: '#047857', label: 'XLS', icon: FiGrid },
  word: { tone: '#1D4ED8', label: 'DOC', icon: FiFileText },
};
const soft = (hex: string, pct: number) => `color-mix(in srgb, ${hex} ${pct}%, var(--background))`;
const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fmtDate = (v: string) => new Date(v).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const ITEM = 'cursor-pointer gap-2 text-[length:var(--fs-12)]';
const urlOf = (scope: Scope, id: number) => `/api/admin/entity-files/${scope}/${id}`;
const fileUrl = (id: string) => `/api/admin/entity-files/file/${id}`;

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: init?.body ? { 'Content-Type': 'application/json' } : undefined });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Σφάλμα ${res.status}`);
  return body;
}

/** XHR: μόνο αυτό δίνει πρόοδο ανεβάσματος. */
function uploadOne(url: string, file: File, subfolder: string, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = `Σφάλμα ${xhr.status}`;
      try { msg = JSON.parse(xhr.responseText).message || msg; } catch { /* μη-JSON */ }
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error('Σφάλμα δικτύου'));
    const fd = new FormData();
    fd.append('file', file);
    fd.append('subfolder', subfolder);
    xhr.send(fd);
  });
}

/** Έλεγχος στον browser πριν ανέβει (ο server ξαναελέγχει ΚΑΙ το περιεχόμενο). */
function precheck(f: File): string | null {
  if (!typeOfExt(extOf(f.name))) return `«${f.name}»: ο τύπος δεν επιτρέπεται`;
  if (f.size > MAX_ENTITY_FILE_BYTES) return `«${f.name}»: πάνω από 100 MB`;
  if (f.size === 0) return `«${f.name}»: κενό αρχείο`;
  return null;
}

function TypeIcon({ family }: { family: FileFamily }) {
  const f = FAMILY[family] ?? FAMILY.pdf;
  return (
    <span className="relative grid size-9 flex-none place-items-center rounded-md" style={{ backgroundColor: soft(f.tone, 14), color: f.tone }} aria-hidden>
      <FiFile className="size-5" />
      <span className="absolute -bottom-1 rounded px-1 text-[length:var(--fs-9)] font-bold leading-3 text-white" style={{ backgroundColor: f.tone }}>{f.label}</span>
    </span>
  );
}

/** Μικρό παράθυρο με ένα πεδίο (μετονομασία, σημειώσεις, νέος φάκελος). */
function TextDialog({ open, title, description, label, initial, multiline, confirm, onClose, onSubmit }: {
  open: boolean; title: string; description?: string; label: string; initial: string; multiline?: boolean; confirm: string;
  onClose: () => void; onSubmit: (v: string) => Promise<void>;
}) {
  const [value, setValue] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) setValue(initial); }, [open, initial]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await onSubmit(value); onClose(); } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <DialogBody>
            <label className="grid gap-1.5 text-[length:var(--fs-12)] font-medium">
              {label}
              {multiline ? (
                <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={4} maxLength={2000} autoFocus
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-[length:var(--fs-13)] font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              ) : (
                <Input value={value} onChange={(e) => setValue(e.target.value)} autoFocus maxLength={160} className="font-normal" />
              )}
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Άκυρο</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Αποθήκευση…' : confirm}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FileRow({ f, subfolders, canManage, onChanged }: { f: EntityFileDTO; subfolders: string[]; canManage: boolean; onChanged: () => void }) {
  const [edit, setEdit] = React.useState<'rename' | 'notes' | 'move' | null>(null);
  const patch = async (body: object, ok: string) => { await api(fileUrl(f.id), { method: 'PATCH', body: JSON.stringify(body) }); toast.success(ok); onChanged(); };
  const del = async () => {
    if (!(await confirmAction({ message: `Διαγραφή του «${f.name}»;\nΤο αρχείο σβήνεται οριστικά και από το Bunny.`, title: 'Διαγραφή αρχείου' }))) return;
    try { await api(fileUrl(f.id), { method: 'DELETE' }); toast.success('Το αρχείο διαγράφηκε'); onChanged(); } catch (e) { toast.error((e as Error).message); }
  };
  const move = (sub: string) => {
    setEdit(null);
    patch({ subfolder: sub }, sub ? `Μετακινήθηκε στο «${sub}»` : 'Μετακινήθηκε στη ρίζα').catch((e) => toast.error((e as Error).message));
  };
  const isPdf = f.ext === 'pdf';
  return (
    <li className="flex items-start gap-2.5 px-2 py-2 sm:px-3">
      <TypeIcon family={f.family} />
      <div className="min-w-0 flex-1">
        <a href={isPdf ? `${fileUrl(f.id)}?inline=1` : fileUrl(f.id)} target={isPdf ? '_blank' : undefined} rel="noopener"
          className="block truncate text-[length:var(--fs-13)] font-medium text-foreground underline-offset-2 hover:underline">{f.name}</a>
        <p className="flex flex-wrap gap-x-2 text-[length:var(--fs-11)] text-muted-foreground">
          <span className="tabular-nums">{fmtSize(f.size)}</span>
          <span className="tabular-nums">{fmtDate(f.createdAt)}</span>
          {f.uploadedBy && <span className="truncate">{f.uploadedBy}</span>}
          {f.subfolder && <span className="inline-flex items-center gap-1"><FiFolder className="size-3" aria-hidden />{f.subfolder}</span>}
        </p>
        {f.notes && <p className="mt-0.5 whitespace-pre-wrap text-[length:var(--fs-12)] text-foreground/80">{f.notes}</p>}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex size-8 flex-none cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted" aria-label={`Ενέργειες για ${f.name}`}>
          <FiMoreVertical className="size-4" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem className={ITEM} onSelect={() => { window.location.href = fileUrl(f.id); }}><FiDownload className="size-3.5" aria-hidden /> Λήψη</DropdownMenuItem>
          {isPdf && <DropdownMenuItem className={ITEM} onSelect={() => window.open(`${fileUrl(f.id)}?inline=1`, '_blank', 'noopener')}><FiEye className="size-3.5" aria-hidden /> Προβολή σε νέα καρτέλα</DropdownMenuItem>}
          {canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className={ITEM} onSelect={() => setEdit('rename')}><FiEdit3 className="size-3.5" aria-hidden /> Μετονομασία</DropdownMenuItem>
              <DropdownMenuItem className={ITEM} onSelect={() => setEdit('notes')}><FiMessageSquare className="size-3.5" aria-hidden /> {f.notes ? 'Σημειώσεις' : 'Προσθήκη σημείωσης'}</DropdownMenuItem>
              <DropdownMenuItem className={ITEM} disabled={subfolders.length === 0 && !f.subfolder} onSelect={() => setEdit('move')}><FiMove className="size-3.5" aria-hidden /> Μετακίνηση σε φάκελο…</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" className={ITEM} onSelect={del}><FiTrash2 className="size-3.5" aria-hidden /> Διαγραφή</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <TextDialog open={edit === 'rename'} title="Μετονομασία αρχείου" description={`Η κατάληξη .${f.ext} μένει ίδια.`} label="Όνομα" confirm="Μετονομασία"
        initial={f.name.replace(new RegExp(`\\.${f.ext}$`, 'i'), '')} onClose={() => setEdit(null)} onSubmit={(v) => patch({ name: v }, 'Το αρχείο μετονομάστηκε')} />
      <TextDialog open={edit === 'notes'} title="Σημειώσεις" label="Σημείωση για το αρχείο" confirm="Αποθήκευση" multiline
        initial={f.notes ?? ''} onClose={() => setEdit(null)} onSubmit={(v) => patch({ notes: v }, 'Οι σημειώσεις αποθηκεύτηκαν')} />
      <Dialog open={edit === 'move'} onOpenChange={(o) => { if (!o) setEdit(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Μετακίνηση σε φάκελο</DialogTitle>
            <DialogDescription className="truncate">{f.name}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-1.5">
              {['', ...subfolders].map((s) => (
                <button key={s || '/'} type="button" disabled={s === f.subfolder} onClick={() => move(s)}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-left text-[length:var(--fs-13)] transition-colors duration-150 hover:bg-muted disabled:cursor-default disabled:opacity-50">
                  <FiFolder className="size-4 text-muted-foreground" aria-hidden /> {s || 'Ρίζα (χωρίς φάκελο)'}
                  {s === f.subfolder && <span className="ml-auto text-[length:var(--fs-11)] text-muted-foreground">τρέχων</span>}
                </button>
              ))}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </li>
  );
}

/** Ένας φάκελος (της οντότητας ή ενός έργου): υποφάκελοι, ανέβασμα, λίστα. */
function FolderView({ scope, folder, canManage, onChanged, compact = false }: {
  scope: Scope; folder: EntityFolderDTO; canManage: boolean; onChanged: () => void; compact?: boolean;
}) {
  const [sub, setSub] = React.useState<string | null>(null); // null = όλα
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const [newFolder, setNewFolder] = React.useState(false);
  const subfolders = folder.subfolders;
  const counts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const f of folder.files) m.set(f.subfolder, (m.get(f.subfolder) ?? 0) + 1);
    return m;
  }, [folder.files]);
  const visible = sub == null ? folder.files : folder.files.filter((f) => f.subfolder === sub);

  const patchJob = (id: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j)));
  const upload = async (files: File[]) => {
    const bad = files.map(precheck).filter(Boolean) as string[];
    bad.forEach((m) => toast.error(m, { description: ALLOWED_HINT }));
    const ok = files.filter((f) => !precheck(f));
    if (!ok.length) return;
    const target = sub ?? '';
    const queue = ok.map((file) => ({ id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`, file, progress: 0, status: 'uploading' as const }));
    setJobs((js) => [...js, ...queue]);
    let done = 0;
    let i = 0;
    const worker = async () => {
      while (i < queue.length) {
        const job = queue[i++];
        try {
          await uploadOne(urlOf(folder.type === 'TRADER' ? 'traders' : 'projects', folder.id), job.file, target, (p) => patchJob(job.id, p >= 1 ? { status: 'processing', progress: 1 } : { progress: p }));
          done++;
          setJobs((js) => js.filter((j) => j.id !== job.id));
        } catch (e) {
          patchJob(job.id, { status: 'error', error: (e as Error).message });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, queue.length) }, worker));
    if (done) toast.success(done === 1 ? 'Ανέβηκε 1 αρχείο' : `Ανέβηκαν ${done} αρχεία`);
    onChanged();
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (f) => { if (f.length) void upload(f); }, noClick: true, noKeyboard: true, disabled: !canManage,
    onDropRejected: (rej) => rej.forEach((r) => toast.error(`«${r.file.name}»: ο τύπος δεν επιτρέπεται`, { description: ALLOWED_HINT })),
    accept: { 'application/octet-stream': ACCEPT_EXTENSIONS },
  });

  const delFolder = async (name: string) => {
    if (!(await confirmAction({ message: `Διαγραφή του φακέλου «${name}»;`, title: 'Διαγραφή φακέλου' }))) return;
    try { await api(`${urlOf(scope, folder.id)}/folders?name=${encodeURIComponent(name)}`, { method: 'DELETE' }); toast.success('Ο φάκελος διαγράφηκε'); setSub(null); onChanged(); } catch (e) { toast.error((e as Error).message); }
  };
  const addFolder = async (name: string) => {
    const body = await api(`${urlOf(scope, folder.id)}/folders`, { method: 'POST', body: JSON.stringify({ name }) });
    toast.success(`Δημιουργήθηκε ο φάκελος «${body.name}»`);
    setSub(body.name);
    onChanged();
  };
  const suggestions = DEFAULT_SUBFOLDERS.filter((s) => !subfolders.includes(s));

  const chip = (key: string | null, label: string, n: number) => (
    <button key={key ?? '*'} type="button" onClick={() => setSub(key)} aria-pressed={sub === key}
      className={cn('inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[length:var(--fs-12)] transition-colors duration-150',
        sub === key ? 'border-foreground/30 bg-foreground text-background' : 'border-border bg-background text-foreground hover:bg-muted')}>
      {key != null && <FiFolder className="size-3.5" aria-hidden />}{label}<span className="tabular-nums opacity-70">{n}</span>
    </button>
  );

  return (
    <div {...getRootProps()} className={cn('relative rounded-lg border border-border bg-card', isDragActive && 'ring-2 ring-sky-500')}>
      <input {...getInputProps()} aria-label="Επιλογή αρχείων" />
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-2 py-2 sm:px-3">
        {chip(null, 'Όλα', folder.files.length)}
        {subfolders.map((s) => chip(s, s, counts.get(s) ?? 0))}
        <div className="ml-auto flex items-center gap-1">
          {canManage && (
            <Button type="button" size="sm" onClick={open} className="h-8 gap-1.5 text-[length:var(--fs-12)]">
              <FiUploadCloud className="size-3.5" aria-hidden /> Ανέβασμα{sub ? <span className="hidden sm:inline"> στο «{sub}»</span> : null}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted" aria-label="Ενέργειες φακέλου">
              <FiMoreVertical className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="break-all font-mono text-[length:var(--fs-10)] font-normal text-muted-foreground" title="Διαδρομή στο Bunny CDN">{folder.basePath ? `${folder.basePath}/` : 'Ο φάκελος δημιουργείται με το πρώτο αρχείο'}</DropdownMenuLabel>
              {canManage && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className={ITEM} onSelect={() => setNewFolder(true)}><FiFolderPlus className="size-3.5" aria-hidden /> Νέος φάκελος…</DropdownMenuItem>
                  {suggestions.map((s) => (
                    <DropdownMenuItem key={s} className={ITEM} onSelect={() => addFolder(s).catch((e) => toast.error((e as Error).message))}><FiFolderPlus className="size-3.5" aria-hidden /> Φάκελος «{s}»</DropdownMenuItem>
                  ))}
                  {sub && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" className={ITEM} disabled={(counts.get(sub) ?? 0) > 0} onSelect={() => delFolder(sub)}>
                        <FiTrash2 className="size-3.5" aria-hidden /> Διαγραφή φακέλου «{sub}»
                        {(counts.get(sub) ?? 0) > 0 && <span className="ml-auto text-[length:var(--fs-10)]">δεν είναι άδειος</span>}
                      </DropdownMenuItem>
                    </>
                  )}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className={ITEM} onSelect={onChanged}><FiRefreshCw className="size-3.5" aria-hidden /> Ανανέωση</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {jobs.length > 0 && (
        <ul className="divide-y divide-border border-b border-border" aria-live="polite">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center gap-2 px-3 py-2 text-[length:var(--fs-12)]">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{j.file.name}</span>
                {j.status === 'error' ? <span className="text-destructive">{j.error}</span> : (
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(j.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <span className="block h-full rounded-full bg-sky-600 transition-[width] duration-150" style={{ width: `${Math.round(j.progress * 100)}%` }} />
                  </span>
                )}
              </span>
              <span className="w-24 flex-none text-right tabular-nums text-muted-foreground">{j.status === 'error' ? fmtSize(j.file.size) : j.status === 'processing' ? 'Αποθήκευση…' : `${Math.round(j.progress * 100)}%`}</span>
              {j.status === 'error' && (
                <button type="button" onClick={() => setJobs((js) => js.filter((x) => x.id !== j.id))} className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-muted" aria-label="Απόκρυψη"><FiX className="size-4" aria-hidden /></button>
              )}
            </li>
          ))}
        </ul>
      )}

      {visible.length > 0 ? (
        <ul className="divide-y divide-border">
          {visible.map((f) => <FileRow key={f.id} f={f} subfolders={subfolders} canManage={canManage} onChanged={onChanged} />)}
        </ul>
      ) : (
        <div className={cn('flex flex-col items-center justify-center gap-1.5 px-4 text-center', compact ? 'py-5' : 'py-8')}>
          <FiUploadCloud className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-[length:var(--fs-13)] text-foreground">{sub ? `Ο φάκελος «${sub}» είναι άδειος` : 'Δεν υπάρχουν αρχεία ακόμη'}</p>
          {canManage && <p className="text-[length:var(--fs-11)] text-muted-foreground">Σύρετε αρχεία εδώ ή πατήστε «Ανέβασμα» · {ALLOWED_HINT}</p>}
        </div>
      )}

      {isDragActive && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-lg bg-sky-500/10 text-[length:var(--fs-13)] font-semibold text-sky-800 dark:text-sky-200">
          Αφήστε τα αρχεία για ανέβασμα{sub ? ` στο «${sub}»` : ''}
        </div>
      )}
      <TextDialog open={newFolder} title="Νέος φάκελος" description={`Δημιουργείται και στο Bunny, κάτω από ${folder.basePath}/`} label="Όνομα φακέλου" confirm="Δημιουργία"
        initial="" onClose={() => setNewFolder(false)} onSubmit={addFolder} />
    </div>
  );
}

/** Ο φάκελος ενός έργου μέσα στην καρτέλα πελάτη/προμηθευτή — αναδιπλούμενος. */
function ProjectFolder({ p, canManage, onChanged }: { p: ProjectFolder; canManage: boolean; onChanged: () => void }) {
  const [open, setOpen] = React.useState(p.files.length > 0);
  return (
    <li className="rounded-lg border border-border">
      <div className="flex items-center gap-2 px-2 py-1.5 sm:px-3">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
          <FiChevronRight className={cn('size-4 flex-none text-muted-foreground transition-transform duration-150', open && 'rotate-90')} aria-hidden />
          <FiBriefcase className="size-4 flex-none text-violet-700 dark:text-violet-400" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[length:var(--fs-13)] font-medium">{p.code} · {p.name}</span>
          {p.role === 'supplier' && <span className="hidden rounded-full bg-muted px-2 text-[length:var(--fs-10)] text-muted-foreground sm:inline">ως προμηθευτής</span>}
          <span className="rounded-full bg-muted px-2 text-[length:var(--fs-11)] tabular-nums text-muted-foreground">{p.files.length}</span>
        </button>
        <Link href={`/admin/projects/${p.id}#files`} className="hidden text-[length:var(--fs-11)] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline sm:inline">καρτέλα έργου</Link>
      </div>
      {open && (
        <div className="px-2 pb-2 sm:px-3">
          <FolderView scope="projects" folder={p} canManage={canManage} onChanged={onChanged} compact />
        </div>
      )}
    </li>
  );
}

export function EntityFilesPanel({ scope, id, onCount }: { scope: Scope; id: number; onCount?: (n: number) => void }) {
  const [data, setData] = React.useState<Payload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    setError(null);
    try {
      const body = (await api(urlOf(scope, id))) as Payload;
      setData(body);
      onCount?.(body.folder.files.length);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [scope, id, onCount]);
  React.useEffect(() => { void load(); }, [load]);

  if (error && !data) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[length:var(--fs-12)]">
        <FiAlertTriangle className="size-4 text-destructive" aria-hidden /><span className="flex-1">{error}</span>
        <Button type="button" variant="outline" size="sm" onClick={load} className="gap-1"><FiRefreshCw className="size-3.5" aria-hidden /> Δοκιμή ξανά</Button>
      </div>
    );
  }
  if (!data) return <div className="h-32 animate-pulse rounded-lg bg-muted" aria-label="Φόρτωση αρχείων" />;

  return (
    <div className="grid gap-3">
      <FolderView scope={scope} folder={data.folder} canManage={data.canManage} onChanged={load} />
      {scope === 'traders' && data.projects.length > 0 && (
        <section aria-label="Φάκελοι έργων">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[length:var(--fs-12)] font-semibold text-muted-foreground">
            <FiBriefcase className="size-3.5" aria-hidden /> Φάκελοι έργων ({data.projects.length})
          </h3>
          <ul className="grid gap-1.5">
            {data.projects.map((p) => <ProjectFolder key={p.id} p={p} canManage={data.canManage} onChanged={load} />)}
          </ul>
        </section>
      )}
    </div>
  );
}
