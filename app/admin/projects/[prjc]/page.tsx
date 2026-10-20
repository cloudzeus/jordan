import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FiBriefcase, FiArrowLeft, FiTrello } from 'react-icons/fi';
import { requirePermission, hasPermission } from '@/lib/rbac';
import { getProject } from '@/lib/projects';
import { PageHeader } from '@/components/admin/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProjectActivityPanel } from '../project-activity-panel';
import { ProjectRowActions } from '../project-row-actions';
import { ensureFreshFinancials, getProjectFinancials } from '@/lib/project-profit';
import { ProjectFinancials } from './project-financials';
import { getProjectSite } from '@/lib/project-site';
import { siteLine } from '@/lib/project-site-core';
import { EntityFilesPanel } from '@/components/admin/entity-files/entity-files-panel';
import { listTasks, listTemplates, partyOptions } from '@/lib/project-tasks';
import { zonedParts } from '@/lib/appointments-core';
import { TasksWorkspace } from './tasks/tasks-workspace';
import { ProjectTabs } from './project-tabs';
import { ProjectRoomsPanel } from '@/components/admin/rooms/project-rooms-panel';
import { PHASES, phaseCounts } from '@/lib/project-tasks-core';

export const dynamic = 'force-dynamic';

const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString('el-GR', { timeZone: 'UTC' }) : '—');

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[length:var(--fs-11)] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[length:var(--fs-13)] text-foreground break-words">{children}</dd>
    </div>
  );
}

type Trader = { code: string; name: string; afm: string | null; phone: string | null; email: string | null; city: string | null } | null;

function TraderBlock({ t }: { t: Trader }) {
  if (!t) return <span className="text-muted-foreground">—</span>;
  const meta = [t.afm && `ΑΦΜ ${t.afm}`, t.city, t.phone, t.email].filter(Boolean).join(' · ');
  return (
    <>
      <span className="font-medium">{t.name}</span>{' '}
      <span className="font-mono text-[length:var(--fs-11)] text-muted-foreground">{t.code}</span>
      {meta && <span className="text-[length:var(--fs-12)] text-muted-foreground"> · {meta}</span>}
    </>
  );
}

// Καρτέλα έργου — ό,τι κρατά ο καθρέφτης SoftoneProject για ένα PRJC.
export default async function ProjectPage({ params, searchParams }: { params: Promise<{ prjc: string }>; searchParams: Promise<{ task?: string }> }) {
  await requirePermission('projects.read');
  const { prjc } = await params;
  const id = Number(prjc);
  if (!Number.isInteger(id)) notFound();
  const p = await getProject(id);
  if (!p) notFound();
  const [canManage, canFinancials, canFiles, canManageFiles] = await Promise.all([hasPermission('projects.manage'), hasPermission('projects.financials'), hasPermission('files.read'), hasPermission('files.manage')]);
  // Οικονομικά: στιγμιότυπο όλων των έργων — ξαναϋπολογίζεται μόνο αν έχει παλιώσει.
  const fresh = canFinancials ? await ensureFreshFinancials() : null;
  const fin = canFinancials ? await getProjectFinancials(p.prjc) : null;
  const site = await getProjectSite(p.prjc);
  // Εργασίες: μόνο βάση εφαρμογής (όχι SoftOne) — το Kanban της καρτέλας «Εργασίες».
  const [work, options, templates, query] = await Promise.all([listTasks(p.prjc), partyOptions(p.prjc), listTemplates(), searchParams]);
  const counts = phaseCounts(work.tasks);

  return (
    <div className="w-full max-w-5xl">
      <Link href="/admin/projects" className="mb-3 inline-flex items-center gap-1 text-[length:var(--fs-12)] text-muted-foreground hover:text-foreground">
        <FiArrowLeft className="size-3.5" aria-hidden /> Όλα τα έργα
      </Link>
      <PageHeader
        icon={<FiBriefcase />}
        title={p.name}
        description={`Έργο ${p.code}${p.isActive ? '' : ' · ανενεργό'}`}
        helpAnchor="projects"
        actions={<ProjectRowActions prjc={p.prjc} code={p.code} name={p.name} canManage={canManage} financials={canFinancials} files={canFiles} manageFiles={canManageFiles} />}
      />

      {/* Στοιχεία έργου — μία πυκνή λωρίδα: μόνο τα πεδία με τιμή, συναλλασσόμενοι σε μία γραμμή. */}
      <section aria-label="Στοιχεία έργου" className="rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm sm:px-4">
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          <Field label="Status">{p.statusLabel}</Field>
          {!p.isActive && <Field label="Ενεργό">Όχι</Field>}
          {p.prjType != null && <Field label="Τύπος">{p.prjType}</Field>}
          {p.crdDate && <Field label="Δημιουργία">{fmtDate(p.crdDate)}</Field>}
          {p.fromDate && <Field label="Έναρξη">{fmtDate(p.fromDate)}</Field>}
          {p.finalDate && <Field label="Λήξη">{fmtDate(p.finalDate)}</Field>}
          {p.closeDate && <Field label="Κλείσιμο">{fmtDate(p.closeDate)}</Field>}
          <Field label="Τοποθεσία">
            {site ? (
              <>
                {siteLine(site)}
                <span className="text-[length:var(--fs-12)] text-muted-foreground">
                  {' · '}<a href={`https://www.openstreetmap.org/?mlat=${site.lat}&mlon=${site.lng}#map=18/${site.lat}/${site.lng}`} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-foreground hover:underline">χάρτης</a>
                  {' · '}<a href={`https://www.google.com/maps/dir/?api=1&destination=${site.lat},${site.lng}`} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-foreground hover:underline">οδηγίες</a>
                </span>
              </>
            ) : <span className="text-muted-foreground">— {canManage ? '(⋮ → Τοποθεσία έργου)' : ''}</span>}
          </Field>
          <Field label="Πελάτης"><TraderBlock t={p.customer} /></Field>
          {p.supplier && <Field label="Προμηθευτής"><TraderBlock t={p.supplier} /></Field>}
        </dl>
        {p.remarks && <p className="mt-2 whitespace-pre-wrap border-t border-border pt-2 text-[length:var(--fs-12)] text-muted-foreground">{p.remarks}</p>}
      </section>

      <ProjectTabs openTasks={work.tasks.length - counts.DONE} tasks={(
        <TasksWorkspace prjc={p.prjc} tasks={work.tasks} options={options} templates={templates} canManage={canManage} canFiles={canManageFiles} today={zonedParts(new Date()).date} openTaskId={query.task ?? null} />
      )} overview={(<>
      {/* Εργασίες: σύνοψη προόδου + είσοδος στην καρτέλα «Εργασίες» */}
      <section aria-label="Εργασίες έργου" className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border bg-card px-3 py-3 shadow-sm sm:px-4">
        <div className="min-w-40 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[length:var(--fs-13)] font-semibold">Εργασίες</span>
            <span className="text-[length:var(--fs-13)] font-semibold tabular-nums">{work.progress}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={work.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Ολοκλήρωση εργασιών">
            <div className="h-full rounded-full bg-primary" style={{ width: `${work.progress}%` }} />
          </div>
          <p className="mt-1 flex flex-wrap gap-x-3 text-[length:var(--fs-11)] text-muted-foreground">
            {work.tasks.length === 0 ? 'Καμία εργασία ακόμη' : PHASES.map((ph) => <span key={ph.key}>{ph.label} <span className="tabular-nums font-medium text-foreground">{counts[ph.key]}</span></span>)}
          </p>
        </div>
        <Link href={`/admin/projects/${p.prjc}?tab=tasks`} scroll={false} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[length:var(--fs-12)] font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <FiTrello className="size-3.5" aria-hidden /> Kanban εργασιών
        </Link>
      </section>

      <ProjectRoomsPanel prjc={p.prjc} projectLabel={`${p.code} · ${p.name}`} canManage={canManage} canSaveFiles={canManageFiles} />

      {fin && <ProjectFinancials profit={fin.profit} issues={fin.issues} computedAt={fin.computedAt} error={fresh?.error ?? null} />}
      {canFinancials && !fin && (
        <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[length:var(--fs-12)] text-destructive">
          Τα οικονομικά του έργου δεν υπολογίστηκαν ακόμη{fresh?.error ? ` — ${fresh.error}` : ''}.
        </p>
      )}

      {canFiles && (
        <Card id="files" className="mt-4 scroll-mt-20">
          <CardHeader className="px-3 sm:px-6"><CardTitle className="text-[length:var(--fs-14)]">Αρχεία έργου</CardTitle></CardHeader>
          <CardContent className="px-3 sm:px-6"><EntityFilesPanel scope="projects" id={p.prjc} /></CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader className="px-3 sm:px-6"><CardTitle className="text-[length:var(--fs-14)]">Κινήσεις στο SoftOne</CardTitle></CardHeader>
        {/* Στο κινητό λιγότερο padding: οι πίνακες χρειάζονται κάθε pixel πλάτους. */}
        <CardContent className="px-3 sm:px-6"><ProjectActivityPanel prjc={p.prjc} canManage={canManage} projectLabel={`${p.code} · ${p.name}`} /></CardContent>
      </Card>
      </>)} />

      <p className="mt-4 text-[length:var(--fs-11)] text-muted-foreground">
        Από SoftOne (PRJC {p.prjc}) · τελευταίος συγχρονισμός {p.syncedAt.toLocaleString('el-GR')}
      </p>
    </div>
  );
}
