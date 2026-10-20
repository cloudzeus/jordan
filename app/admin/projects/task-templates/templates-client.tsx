'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FiBookmark, FiCopy, FiEdit2, FiLoader, FiMoreVertical, FiTrash2 } from 'react-icons/fi';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { confirmAction } from '@/components/ui/confirm-dialog';
import type { TemplateView } from '@/lib/project-tasks';
import { ApplyTemplateDialog } from '../[prjc]/tasks/template-dialogs';

const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';

export function TemplatesClient({ templates, projects, canManage, today }: { templates: TemplateView[]; projects: { prjc: number; label: string }[]; canManage: boolean; today: string }) {
  const router = useRouter();
  const [apply, setApply] = React.useState<string | null>(null);
  const [rename, setRename] = React.useState<TemplateView | null>(null);

  const remove = async (t: TemplateView) => {
    if (!(await confirmAction({ message: `Διαγραφή του template «${t.name}»;\nΟι εργασίες που ήδη προστέθηκαν σε έργα δεν επηρεάζονται.`, destructive: true }))) return;
    const res = await fetch(`/api/admin/task-templates/${t.id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Το template διαγράφηκε'); router.refresh(); } else toast.error((await res.json().catch(() => ({}))).message ?? 'Η διαγραφή απέτυχε');
  };

  if (!templates.length) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
        <FiBookmark className="mx-auto size-8 text-muted-foreground opacity-50" aria-hidden />
        <p className="mt-3 text-(length:--fs-14) font-medium">Δεν υπάρχουν templates</p>
        <p className="mt-1 text-(length:--fs-12) text-muted-foreground">Ανοίξτε τις εργασίες ενός έργου → ⋮ → «Αποθήκευση ως template».</p>
      </div>
    );
  }

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2">
        {templates.map((t) => (
          <li key={t.id} className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="text-(length:--fs-14) font-semibold">{t.name}</h2>
                <p className="text-(length:--fs-11) text-muted-foreground">{t.items.length} εργασίες{t.description ? ` · ${t.description}` : ''}</p>
              </div>
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ενέργειες για «${t.name}»`}>
                    <FiMoreVertical className="size-4" aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem className={ITEM} onSelect={() => setApply(t.id)}><FiCopy className="size-3.5" aria-hidden /> Προσθήκη σε έργο…</DropdownMenuItem>
                    <DropdownMenuItem className={ITEM} onSelect={() => setRename(t)}><FiEdit2 className="size-3.5" aria-hidden /> Μετονομασία…</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className={`${ITEM} text-destructive focus:text-destructive`} onSelect={() => void remove(t)}><FiTrash2 className="size-3.5" aria-hidden /> Διαγραφή…</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <ol className="mt-3 space-y-1 text-(length:--fs-12)">
              {t.items.map((i, n) => (
                <li key={i.key} className="flex items-baseline gap-2">
                  <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">{n + 1}.</span>
                  <span className="min-w-0 flex-1 truncate">{i.name}</span>
                  <span className="shrink-0 text-muted-foreground">{i.duration}</span>
                  <span className="w-16 shrink-0 text-right text-(length:--fs-11) tabular-nums text-muted-foreground">{i.offsetDays ? `+${i.offsetDays} εργ.` : 'αρχή'}</span>
                </li>
              ))}
            </ol>
            {canManage && <Button variant="outline" size="sm" className="mt-4 min-h-9 self-start" onClick={() => setApply(t.id)}><FiCopy className="size-3.5" aria-hidden /> Προσθήκη σε έργο</Button>}
          </li>
        ))}
      </ul>
      <ApplyTemplateDialog open={apply != null} onOpenChange={(o) => { if (!o) setApply(null); }} prjc={null}
        templates={apply ? [...templates].sort((a, b) => (a.id === apply ? -1 : b.id === apply ? 1 : 0)) : templates} today={today} projects={projects} onApplied={() => router.refresh()} />
      <RenameDialog t={rename} onClose={() => setRename(null)} onDone={() => { setRename(null); router.refresh(); }} />
    </>
  );
}

function RenameDialog({ t, onClose, onDone }: { t: TemplateView | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (t) { setName(t.name); setDescription(t.description ?? ''); setError(null); } }, [t]);
  const save = async () => {
    setBusy(true); setError(null);
    const res = await fetch(`/api/admin/task-templates/${t!.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), description: description.trim() || null }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(body.message ?? 'Η αποθήκευση απέτυχε'); return; }
    toast.success('Αποθηκεύτηκε');
    onDone();
  };
  return (
    <Dialog open={!!t} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Μετονομασία template</DialogTitle><DialogDescription>Αλλάζει μόνο το όνομα και την περιγραφή.</DialogDescription></DialogHeader>
        <DialogBody>
          <form id="tpl-rename" className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <div className="space-y-1.5"><Label htmlFor="tr-name">Όνομα</Label><Input id="tr-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></div>
            <div className="space-y-1.5"><Label htmlFor="tr-desc">Περιγραφή</Label><Input id="tr-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} /></div>
            {error && <p role="alert" className="text-(length:--fs-12) text-destructive">{error}</p>}
          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Άκυρο</Button>
          <Button type="submit" form="tpl-rename" disabled={busy || !name.trim()}>{busy && <FiLoader className="size-3.5 animate-spin" aria-hidden />}Αποθήκευση</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
