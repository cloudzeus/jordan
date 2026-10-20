import { FiDownload } from 'react-icons/fi';
import { GanttChart } from '@/components/admin/project-tasks/gantt-chart';
import { phaseMeta } from '@/lib/project-tasks-core';
import type { CustomerTask } from '@/lib/project-tasks';
import { date } from '../../_ui/bits';

/**
 * Πρόοδος εργασιών για τον πελάτη: ΜΟΝΟ όσες σημειώθηκαν «ορατές στον πελάτη». Χωρίς εμπλεκόμενους,
 * εσωτερικές εξαρτήσεις και σημειώσεις — όνομα, περιγραφή, ημερομηνίες, ποσοστό και αρχεία.
 */
export function ProjectTasksSection({ tasks, progress, today }: { tasks: CustomerTask[]; progress: number; today: string }) {
  if (!tasks.length) return null;
  return (
    <section className="mt-16" aria-labelledby="progress">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="progress" className="font-site text-(length:--fs-24) font-light">Πρόοδος εργασιών</h2>
        <p className="text-(length:--fs-14) text-(--s-ink-2)"><span className="text-(length:--fs-20) font-medium tabular-nums text-(--s-ink)">{progress}%</span> ολοκληρωμένο</p>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-(--s-line)" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Πρόοδος έργου">
        <div className="h-full bg-(--s-ink)" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-8 hidden md:block">
        <GanttChart rows={tasks.map((t) => ({ id: t.id, name: t.name, start: t.start, end: t.end, progress: t.progress, phase: t.phase }))} today={today} showArrows={false} />
      </div>

      <ol className="mt-8 divide-y divide-(--s-line) border-y border-(--s-line)">
        {tasks.map((t) => (
          <li key={t.id} className="grid gap-2 py-5 sm:grid-cols-[1fr_auto] sm:gap-6">
            <div className="min-w-0">
              <h3 className="text-(length:--fs-16) font-medium">{t.name}</h3>
              <p className="mt-1 text-(length:--fs-13) tabular-nums text-(--s-mute)">{date(t.start)}{t.end !== t.start ? ` – ${date(t.end)}` : ''}</p>
              {t.description && <p className="mt-2 whitespace-pre-wrap text-(length:--fs-14) text-(--s-ink-2)">{t.description}</p>}
              {t.files.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {t.files.map((f) => (
                    <li key={f.id}>
                      <a href={`/api/portal/task-files/${f.id}${f.ext === 'pdf' ? '?inline=1' : ''}`} target="_blank" rel="noopener noreferrer" className="s-link inline-flex min-h-11 items-center gap-1.5 text-(length:--fs-13)">
                        <FiDownload className="size-3.5" aria-hidden /> {f.name}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex items-center gap-3 sm:flex-col sm:items-end">
              <span className="text-(length:--fs-13) text-(--s-ink-2)">{phaseMeta(t.phase).label}</span>
              <span className="text-(length:--fs-18) font-medium tabular-nums">{t.progress}%</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
