import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FiBriefcase, FiArrowLeft } from 'react-icons/fi';
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
export default async function ProjectPage({ params }: { params: Promise<{ prjc: string }> }) {
  await requirePermission('projects.read');
  const { prjc } = await params;
  const id = Number(prjc);
  if (!Number.isInteger(id)) notFound();
  const p = await getProject(id);
  if (!p) notFound();
  const [canManage, canFinancials] = await Promise.all([hasPermission('projects.manage'), hasPermission('projects.financials')]);
  // Οικονομικά: στιγμιότυπο όλων των έργων — ξαναϋπολογίζεται μόνο αν έχει παλιώσει.
  const fresh = canFinancials ? await ensureFreshFinancials() : null;
  const fin = canFinancials ? await getProjectFinancials(p.prjc) : null;
  const site = await getProjectSite(p.prjc);

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
        actions={<ProjectRowActions prjc={p.prjc} code={p.code} name={p.name} canManage={canManage} financials={canFinancials} />}
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

      {fin && <ProjectFinancials profit={fin.profit} issues={fin.issues} computedAt={fin.computedAt} error={fresh?.error ?? null} />}
      {canFinancials && !fin && (
        <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[length:var(--fs-12)] text-destructive">
          Τα οικονομικά του έργου δεν υπολογίστηκαν ακόμη{fresh?.error ? ` — ${fresh.error}` : ''}.
        </p>
      )}

      <Card className="mt-4">
        <CardHeader className="px-3 sm:px-6"><CardTitle className="text-[length:var(--fs-14)]">Κινήσεις στο SoftOne</CardTitle></CardHeader>
        {/* Στο κινητό λιγότερο padding: οι πίνακες χρειάζονται κάθε pixel πλάτους. */}
        <CardContent className="px-3 sm:px-6"><ProjectActivityPanel prjc={p.prjc} canManage={canManage} projectLabel={`${p.code} · ${p.name}`} /></CardContent>
      </Card>

      <p className="mt-4 text-[length:var(--fs-11)] text-muted-foreground">
        Από SoftOne (PRJC {p.prjc}) · τελευταίος συγχρονισμός {p.syncedAt.toLocaleString('el-GR')}
      </p>
    </div>
  );
}
