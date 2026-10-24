import { FiCheck, FiDownload } from 'react-icons/fi';
import { GanttChart } from '@/components/admin/project-tasks/gantt-chart';
import { phaseMeta } from '@/lib/project-tasks-core';
import type { CustomerTask } from '@/lib/project-tasks';
import { date } from '../../_ui/bits';

/**
 * Πρόοδος εργασιών για τον πελάτη: ΜΟΝΟ όσες σημειώθηκαν «ορατές στον πελάτη». Κάθετη χρονογραμμή —
 * κάθε εργασία με το χρώμα της φάσης της (ετικέτα + μπάρα), ✓ στις ολοκληρωμένες, «σήμερα» στην τρέχουσα.
 */
export function ProjectTasksSection({ tasks, progress, today }: { tasks: CustomerTask[]; progress: number; today: string }) {
  if (!tasks.length) return null;
  const done = tasks.filter((t) => t.progress >= 100).length;
  return (
    <section className="mt-16" aria-labelledby="progress">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="progress" className="font-site text-(length:--fs-24) font-medium">Πρόοδος εργασιών</h2>
          <p className="mt-1 text-(length:--fs-15) text-(--s-ink-2)">{done} από {tasks.length} εργασίες ολοκληρώθηκαν</p>
        </div>
        <p className="p-amount text-(length:--fs-32) leading-none text-(--s-ink)">{progress}%</p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-(--s-paper)" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Πρόοδος έργου">
        <div className="h-full rounded-full bg-(--s-ink)" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-10 hidden rounded-xl border border-(--s-line) p-4 md:block">
        <GanttChart rows={tasks.map((t) => ({ id: t.id, name: t.name, start: t.start, end: t.end, progress: t.progress, phase: t.phase }))} today={today} showArrows={false} />
      </div>

      <ol className="relative mt-10 space-y-3 before:absolute before:bottom-6 before:left-[1.1875rem] before:top-6 before:w-px before:bg-(--s-line)">
        {tasks.map((t) => {
          const ph = phaseMeta(t.phase);
          const isDone = t.progress >= 100;
          const now = !isDone && t.start <= today && t.end >= today;
          return (
            <li key={t.id} className="relative flex gap-4">
              <span className="relative z-10 mt-4 grid size-10 shrink-0 place-items-center rounded-full ring-4 ring-white" style={{ background: isDone ? ph.color : '#fff', boxShadow: isDone ? undefined : `inset 0 0 0 2px ${ph.color}` }}>
                {isDone ? <FiCheck className="size-4 text-white" aria-hidden /> : <span className="size-2 rounded-full" style={{ background: ph.color }} aria-hidden />}
              </span>
              <div className={`min-w-0 flex-1 rounded-xl border bg-white p-4 ${now ? 'border-(--s-ink)' : 'border-(--s-line)'}`}>
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <h3 className="text-(length:--fs-17) font-semibold leading-snug text-(--s-ink)">{t.name}</h3>
                    <p className="mt-1 text-(length:--fs-14) tabular-nums text-(--s-ink-2)">{date(t.start)}{t.end !== t.start ? ` – ${date(t.end)}` : ''}{now ? ' · σε εξέλιξη σήμερα' : ''}</p>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-(length:--fs-13) font-semibold" style={{ color: ph.color, background: `${ph.color}14` }}>
                    {ph.label}<span className="tabular-nums">· {t.progress}%</span>
                  </span>
                </div>
                {!isDone && t.progress > 0 && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-(--s-paper)" aria-hidden><div className="h-full rounded-full" style={{ width: `${t.progress}%`, background: ph.color }} /></div>
                )}
                {t.description && <p className="mt-3 whitespace-pre-wrap text-(length:--fs-15) text-(--s-ink-2)">{t.description}</p>}
                {t.files.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {t.files.map((f) => (
                      <li key={f.id}>
                        <a href={`/api/portal/task-files/${f.id}${f.ext === 'pdf' ? '?inline=1' : ''}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-(--s-paper) px-3 text-(length:--fs-14) font-medium text-(--s-ink) hover:bg-(--s-line)">
                          <FiDownload className="size-4" aria-hidden /> {f.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
