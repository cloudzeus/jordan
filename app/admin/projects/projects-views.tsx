'use client';

import * as React from 'react';
import Link from 'next/link';
import { FiBriefcase, FiColumns, FiTrello } from 'react-icons/fi';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PHASES, phaseCounts } from '@/lib/project-tasks-core';
import type { AllTaskView } from '@/lib/project-tasks';
import { AllTasksBoard } from '../tasks/all-tasks-board';

const ALL = '__all';

/**
 * Σελίδα «Έργα»: ο πίνακας των έργων (children, από τον server) ή το Kanban εργασιών όλων των έργων
 * με φίλτρο έργου. Η προβολή και το έργο μένουν στη διεύθυνση (?view=kanban&prjc=…).
 */
export function ProjectsViews({ tasks, canManage, initialView, initialPrjc, children }: {
  tasks: AllTaskView[]; canManage: boolean; initialView: string; initialPrjc: number | null; children: React.ReactNode;
}) {
  const [view, setView] = React.useState(initialView === 'kanban' ? 'kanban' : 'list');
  const [prjc, setPrjc] = React.useState<number | null>(initialPrjc);
  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (view === 'kanban') sp.set('view', 'kanban'); else sp.delete('view');
    if (view === 'kanban' && prjc != null) sp.set('prjc', String(prjc)); else sp.delete('prjc');
    const qs = sp.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [view, prjc]);

  const projects = React.useMemo(() => {
    const m = new Map<number, { label: string; open: number }>();
    for (const t of tasks) {
      const e = m.get(t.prjc) ?? { label: `${t.projectCode} · ${t.projectName}`, open: 0 };
      if (t.progress < 100) e.open++;
      m.set(t.prjc, e);
    }
    return [...m.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label, 'el'));
  }, [tasks]);
  const shown = React.useMemo(() => (prjc == null ? tasks : tasks.filter((t) => t.prjc === prjc)), [tasks, prjc]);
  const counts = phaseCounts(shown);

  return (
    <Tabs value={view} onValueChange={setView}>
      <TabsList className="mb-3">
        <TabsTrigger value="list"><FiBriefcase className="size-3.5" aria-hidden /> Έργα</TabsTrigger>
        <TabsTrigger value="kanban"><FiTrello className="size-3.5" aria-hidden /> Kanban εργασιών <span className="tabular-nums opacity-70">{tasks.length}</span></TabsTrigger>
      </TabsList>
      <TabsContent value="list">{children}</TabsContent>
      <TabsContent value="kanban">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Select value={prjc != null ? String(prjc) : ALL} onValueChange={(v) => setPrjc(v === ALL ? null : Number(v))}>
            <SelectTrigger className="w-full sm:w-80" aria-label="Έργο"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={ALL}>Όλα τα έργα ({projects.length})</SelectItem>
              {projects.map(([id, p]) => <SelectItem key={id} value={String(id)}>{p.label}{p.open ? ` · ${p.open} ανοιχτές` : ''}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="flex flex-wrap gap-x-3 text-(length:--fs-12) text-muted-foreground" role="status">
            {PHASES.map((ph) => (
              <span key={ph.key} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: ph.color }} aria-hidden />{ph.label} <span className="font-semibold tabular-nums text-foreground">{counts[ph.key]}</span></span>
            ))}
          </p>
          <span className="ml-auto flex flex-wrap gap-x-3 text-(length:--fs-12)">
            {prjc != null && <Link href={`/admin/projects/${prjc}?tab=tasks`} className="inline-flex min-h-8 items-center font-medium text-primary hover:underline">Εργασίες του έργου</Link>}
            <Link href="/admin/tasks?view=board" className="inline-flex min-h-8 items-center gap-1 font-medium text-primary hover:underline"><FiColumns className="size-3.5" aria-hidden /> Περισσότερα φίλτρα & Gantt</Link>
          </span>
        </div>
        {shown.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
            <FiTrello className="mx-auto size-8 text-muted-foreground opacity-50" aria-hidden />
            <p className="mt-3 text-(length:--fs-14) font-medium">Δεν υπάρχουν ακόμη εργασίες</p>
            <p className="mt-1 text-(length:--fs-12) text-muted-foreground">Ανοίξτε ένα έργο → καρτέλα «Εργασίες» για να προσθέσετε (ή φέρτε έτοιμες από template).</p>
          </div>
        ) : (
          <AllTasksBoard tasks={shown} canManage={canManage} boardId="projects-kanban" />
        )}
      </TabsContent>
    </Tabs>
  );
}
