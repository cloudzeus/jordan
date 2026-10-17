'use client';

import * as React from 'react';
import { FiCheckCircle, FiAlertCircle, FiLoader, FiClock, FiUploadCloud, FiRotateCw } from 'react-icons/fi';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

export type MediaKind = 'IMAGE' | 'VIDEO' | 'PANORAMA';

type Status = 'queued' | 'uploading' | 'processing' | 'done' | 'error';
type Job = { id: string; file: File; status: Status; progress: number; error?: string };

const CONCURRENCY = 2;
const KIND_LABEL: Record<MediaKind, string> = { IMAGE: 'φωτογραφίες', VIDEO: 'βίντεο', PANORAMA: 'πανοράματα 360°' };

const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/**
 * Ένα αρχείο → ένα POST με XMLHttpRequest: μόνο το XHR δίνει πρόοδο ανεβάσματος (το fetch όχι).
 * Μετά το 100% του ανεβάσματος ο server επεξεργάζεται (WebP, Bunny) — φαίνεται ως «Επεξεργασία».
 */
function uploadOne(url: string, file: File, kind: MediaKind, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = `Σφάλμα ${xhr.status}`;
      try { msg = JSON.parse(xhr.responseText).message || msg; } catch { /* μη-JSON απάντηση */ }
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error('Σφάλμα δικτύου'));
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', kind);
    xhr.send(fd);
  });
}

export function UploadProgressDialog({
  mtrl, kind, files, open, onOpenChange, onFinished,
}: {
  mtrl: number;
  kind: MediaKind;
  files: File[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Καλείται όταν τελειώσει η ουρά (με επιτυχίες ή όχι) — για ανανέωση της λίστας. */
  onFinished: () => void;
}) {
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const running = React.useRef(false);

  const patch = (id: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j)));

  const runQueue = React.useCallback(async (queue: Job[]) => {
    if (running.current) return;
    running.current = true;
    let i = 0;
    const worker = async () => {
      while (i < queue.length) {
        const job = queue[i++];
        patch(job.id, { status: 'uploading', progress: 0, error: undefined });
        try {
          await uploadOne(`/api/admin/items/${mtrl}/media`, job.file, kind, (p) => {
            patch(job.id, p >= 1 ? { status: 'processing', progress: 1 } : { progress: p });
          });
          patch(job.id, { status: 'done', progress: 1 });
        } catch (e) {
          patch(job.id, { status: 'error', error: (e as Error).message });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    running.current = false;
    onFinished();
  }, [mtrl, kind, onFinished]);

  // Νέα παρτίδα αρχείων ⇒ νέα ουρά, ΜΙΑ φορά ανά παρτίδα. Τα ids είναι σταθερά (όχι Date.now()):
  // το Strict Mode τρέχει το effect δύο φορές, και με νέα ids η δεύτερη λίστα «έκρυβε» την
  // πρόοδο της πρώτης (που είναι αυτή που όντως ανεβάζει) — όλα έμεναν «Σε αναμονή».
  const started = React.useRef<File[] | null>(null);
  React.useEffect(() => {
    if (!open || files.length === 0 || started.current === files) return;
    started.current = files;
    const queue = files.map((file, n) => ({ id: `${n}-${file.name}-${file.size}-${file.lastModified}`, file, status: 'queued' as Status, progress: 0 }));
    setJobs(queue);
    void runQueue(queue);
  }, [open, files, runQueue]);

  const done = jobs.filter((j) => j.status === 'done').length;
  const failed = jobs.filter((j) => j.status === 'error');
  const active = jobs.some((j) => j.status === 'queued' || j.status === 'uploading' || j.status === 'processing');
  // Συνολική πρόοδος: το ανέβασμα μετρά 80%, η επεξεργασία του server το υπόλοιπο 20%.
  const overall = jobs.length === 0 ? 0 : jobs.reduce((s, j) => s + (j.status === 'done' || j.status === 'error' ? 1 : j.status === 'processing' ? 0.9 : j.progress * 0.8), 0) / jobs.length;

  const retry = () => {
    const queue = failed.map((j) => ({ ...j, status: 'queued' as Status, progress: 0, error: undefined }));
    setJobs((js) => js.map((j) => queue.find((q) => q.id === j.id) ?? j));
    void runQueue(queue);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!active) onOpenChange(o); }}>
      <DialogContent showCloseButton={!active} className="flex max-h-[85dvh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="flex-row items-center gap-3 border-b border-border px-4 py-2.5 pr-12">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-sisyphus-50 text-sisyphus-600 dark:bg-sisyphus-500/15 [&_svg]:size-4">
            <FiUploadCloud />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-[length:var(--fs-15)]">Μεταφόρτωση {KIND_LABEL[kind]}</DialogTitle>
            <DialogDescription className="text-[length:var(--fs-11)]" aria-live="polite">
              {active ? `Ολοκληρώθηκαν ${done} από ${jobs.length}…` : failed.length ? `${done} επιτυχίες, ${failed.length} αποτυχίες` : `Ολοκληρώθηκαν και τα ${done}`}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="border-b border-border px-4 py-2">
          <div
            className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Συνολική πρόοδος"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(overall * 100)}
          >
            <div
              className={cn('h-full rounded-full transition-[width] duration-300', failed.length && !active ? 'bg-amber-500' : 'bg-sisyphus-500')}
              style={{ width: `${Math.round(overall * 100)}%` }}
            />
          </div>
        </div>

        <DialogBody className="px-0 py-0">
          <ul className="divide-y divide-border">
            {jobs.map((j) => (
              <li key={j.id} className="flex items-center gap-3 px-4 py-2">
                <span aria-hidden className="shrink-0">
                  {j.status === 'done' && <FiCheckCircle className="size-4 text-emerald-600" />}
                  {j.status === 'error' && <FiAlertCircle className="size-4 text-destructive" />}
                  {(j.status === 'uploading' || j.status === 'processing') && <FiLoader className="size-4 animate-spin text-sisyphus-500 motion-reduce:animate-none" />}
                  {j.status === 'queued' && <FiClock className="size-4 text-muted-foreground" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="truncate text-[length:var(--fs-12)] font-medium text-foreground" title={j.file.name}>{j.file.name}</p>
                    <span className="ml-auto shrink-0 text-[length:var(--fs-10)] tabular-nums text-muted-foreground">{fmtSize(j.file.size)}</span>
                  </div>
                  {j.status === 'error' ? (
                    <p role="alert" className="text-[length:var(--fs-11)] text-destructive">{j.error}</p>
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full rounded-full transition-[width] duration-200', j.status === 'done' ? 'bg-emerald-500' : j.status === 'processing' ? 'animate-pulse bg-sisyphus-400 motion-reduce:animate-none' : 'bg-sisyphus-500')}
                          style={{ width: `${Math.round((j.status === 'done' || j.status === 'processing' ? 1 : j.progress) * 100)}%` }}
                        />
                      </div>
                      <span className="w-24 shrink-0 text-right text-[length:var(--fs-10)] tabular-nums text-muted-foreground">
                        {j.status === 'queued' ? 'Σε αναμονή' : j.status === 'uploading' ? `Ανέβασμα ${Math.round(j.progress * 100)}%` : j.status === 'processing' ? 'Επεξεργασία…' : 'Έτοιμο'}
                      </span>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </DialogBody>

        <DialogFooter className="mx-0 mb-0 gap-2 border-t border-border bg-card px-4 py-2.5">
          {failed.length > 0 && !active && (
            <Button variant="outline" onClick={retry}>
              <FiRotateCw className="mr-1.5 size-3.5" aria-hidden /> Επανάληψη αποτυχιών ({failed.length})
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)} disabled={active}>
            {active ? 'Σε εξέλιξη…' : 'Κλείσιμο'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
