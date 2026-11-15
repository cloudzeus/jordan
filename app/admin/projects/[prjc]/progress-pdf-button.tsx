'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FiFileText, FiLoader } from 'react-icons/fi';
import { toast } from 'sonner';

/** Φτιάχνει το PDF «Αναφορά πορείας έργου», το ανοίγει σε νέα καρτέλα και ανανεώνει τα αρχεία έργου. */
export function ProgressPdfButton({ prjc }: { prjc: number }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const run = async () => {
    setBusy(true);
    const tid = toast.loading('Δημιουργία αναφοράς προόδου…');
    try {
      const res = await fetch(`/api/admin/projects/${prjc}/progress-pdf`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Αποτυχία δημιουργίας');
      toast.success('Η αναφορά δημιουργήθηκε — ανοίγει σε νέα καρτέλα', { id: tid });
      window.open(`/api/admin/entity-files/file/${body.fileId}?inline=1`, '_blank', 'noopener');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message, { id: tid });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button" onClick={run} disabled={busy}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-(length:--fs-12) font-medium hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      {busy
        ? <FiLoader className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
        : <FiFileText className="size-3.5" aria-hidden />}
      Αναφορά προόδου (PDF)
    </button>
  );
}
