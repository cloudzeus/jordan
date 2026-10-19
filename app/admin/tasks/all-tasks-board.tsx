'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { moveOnBoard, phaseMeta, phaseOf, type PhaseKey } from '@/lib/project-tasks-core';
import type { AllTaskView, TaskView } from '@/lib/project-tasks';
import { KanbanBoard, type CardProject, type TaskRef } from '../projects/[prjc]/tasks/kanban-board';

async function api(url: string, init: RequestInit) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || 'Η ενέργεια απέτυχε');
  return body;
}

// Σταθερές αναφορές (το KanbanBoard ξαναϋπολογίζει τις στήλες όταν αλλάζουν).
const scopeOf = (t: TaskView) => `${(t as AllTaskView).projectCode}\u0000${(t as AllTaskView).prjc}`;
const projectOf = (t: TaskView): CardProject => ({ code: (t as AllTaskView).projectCode, name: (t as AllTaskView).projectName });

/**
 * Kanban εργασιών ΟΛΩΝ των έργων (4 φάσεις). Η σειρά μέσα σε κάθε στήλη μετρά ανά έργο· το σύρσιμο
 * αλλάζει φάση/ποσοστό με την ίδια λογική (moveTask) με το Kanban του έργου. Κλικ → φόρμα της εργασίας
 * στη σελίδα του έργου της.
 */
export function AllTasksBoard({ tasks: initial, canManage, boardId = 'all-tasks-kanban' }: { tasks: AllTaskView[]; canManage: boolean; boardId?: string }) {
  const router = useRouter();
  // Αισιόδοξες αλλαγές πάνω στα δεδομένα του server· το refresh φέρνει τα τελικά.
  const [tasks, setTasks] = React.useState(initial);
  React.useEffect(() => setTasks(initial), [initial]);
  const byId = React.useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const names = React.useMemo(() => new Map<string, TaskRef>(tasks.map((t) => [t.id, { name: t.name, done: t.progress === 100 }])), [tasks]);

  const move = async (id: string, to: PhaseKey, beforeId: string | null) => {
    const t = byId.get(id);
    if (!t) return;
    const prev = tasks;
    const by = new Map(moveOnBoard(tasks.filter((x) => x.prjc === t.prjc), id, to, beforeId).map((c) => [c.id, c]));
    setTasks((ts) => ts.map((x) => (by.has(x.id) ? { ...x, progress: by.get(x.id)!.progress, phase: phaseOf(by.get(x.id)!.progress), sortOrder: by.get(x.id)!.sortOrder } : x)));
    try {
      await api(`/api/admin/projects/${t.prjc}/tasks/${id}/move`, { method: 'POST', body: JSON.stringify({ to, beforeId }) });
      if (phaseOf(t.progress) !== to) {
        const waiting = t.dependsOn.filter((d) => names.has(d) && !names.get(d)!.done);
        if (to !== 'TODO' && waiting.length) toast.warning(`Η «${t.name}» περιμένει: ${waiting.map((d) => names.get(d)!.name).join(', ')}`);
        else toast.success(`«${t.name}» → ${phaseMeta(to).label}`, { duration: 2500 });
      }
      router.refresh();
    } catch (e) {
      setTasks(prev);
      toast.error((e as Error).message);
    }
  };

  const setProgress = async (id: string, progress: number) => {
    const t = byId.get(id);
    if (!t) return;
    try {
      await api(`/api/admin/projects/${t.prjc}/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ progress }) });
      router.refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const remove = async (id: string) => {
    const t = byId.get(id);
    if (!t) return;
    const ok = await confirmAction({
      message: `Διαγραφή της εργασίας «${t.name}» (έργο ${t.projectCode});${t.inCalendar ? '\nΘα σταλεί ακύρωση στα ημερολόγια.' : ''}\nΤα αρχεία της μένουν στον φάκελο του έργου.`,
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(`/api/admin/projects/${t.prjc}/tasks/${id}`, { method: 'DELETE' });
      toast.success('Η εργασία διαγράφηκε');
      router.refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const open = (id: string) => { const t = byId.get(id); if (t) router.push(`/admin/projects/${t.prjc}/tasks?task=${t.id}`); };
  const toProject = (id: string) => { const t = byId.get(id); if (t) router.push(`/admin/projects/${t.prjc}?tab=tasks`); };

  return (
    <KanbanBoard tasks={tasks} canManage={canManage} names={names} boardId={boardId} scopeOf={scopeOf} projectOf={projectOf}
      actions={{ onOpen: open, onMove: (id, to, b) => void move(id, to, b), onProgress: (id, p) => void setProgress(id, p), onDelete: (id) => void remove(id), onProject: toProject }} />
  );
}
