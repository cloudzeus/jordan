'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { FiInfo, FiTrello } from 'react-icons/fi';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Tab = 'overview' | 'tasks';
const tabOf = (v: string | null): Tab => (v === 'tasks' ? 'tasks' : 'overview');

/**
 * Καρτέλες της σελίδας έργου. Η ενεργή καρτέλα ζει στη διεύθυνση (?tab=tasks) — ένας σύνδεσμος
 * προς αυτήν (π.χ. από τη σύνοψη εργασιών ή από το Kanban όλων των έργων) ανοίγει κατευθείαν το Kanban.
 */
export function ProjectTabs({ openTasks, overview, tasks }: { openTasks: number; overview: React.ReactNode; tasks: React.ReactNode }) {
  const sp = useSearchParams();
  const [tab, setTab] = React.useState<Tab>(() => tabOf(sp.get('tab')));
  // Συγχρονισμός με τη διεύθυνση (adjust-state-while-rendering)
  const [prevSp, setPrevSp] = React.useState(sp);
  if (sp !== prevSp) { setPrevSp(sp); setTab(tabOf(sp.get('tab'))); }
  const change = (v: string) => {
    const t = tabOf(v);
    setTab(t);
    const q = new URLSearchParams(window.location.search);
    if (t === 'tasks') q.set('tab', 'tasks'); else q.delete('tab');
    q.delete('task');
    const qs = q.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  };
  return (
    <Tabs value={tab} onValueChange={change} className="mt-4">
      <TabsList>
        <TabsTrigger value="overview"><FiInfo className="size-3.5" aria-hidden /> Επισκόπηση</TabsTrigger>
        <TabsTrigger value="tasks">
          <FiTrello className="size-3.5" aria-hidden /> Εργασίες
          {openTasks > 0 && <span className="tabular-nums opacity-70">{openTasks}</span>}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="tasks">{tasks}</TabsContent>
    </Tabs>
  );
}
