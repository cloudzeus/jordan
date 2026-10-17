import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FiBriefcase, FiArrowLeft } from 'react-icons/fi';
import { requirePermission, hasPermission } from '@/lib/rbac';
import { getProject } from '@/lib/projects';
import { PageHeader } from '@/components/admin/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProjectActivityPanel } from '../project-activity-panel';
import { ProjectRowActions } from '../project-row-actions';

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
      {meta && <span className="block text-[length:var(--fs-12)] text-muted-foreground">{meta}</span>}
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
  const canManage = await hasPermission('projects.manage');

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
        actions={<ProjectRowActions prjc={p.prjc} code={p.code} name={p.name} canManage={canManage} />}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-[length:var(--fs-14)]">Στοιχεία έργου</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Κωδικός"><span className="font-mono">{p.code}</span></Field>
              <Field label="Status">{p.statusLabel}</Field>
              <Field label="Ενεργό">{p.isActive ? 'Ναι' : 'Όχι'}</Field>
              <Field label="Τύπος">{p.prjType ?? '—'}</Field>
              <Field label="Δημιουργία">{fmtDate(p.crdDate)}</Field>
              <Field label="Έναρξη">{fmtDate(p.fromDate)}</Field>
              <Field label="Λήξη">{fmtDate(p.finalDate)}</Field>
              <Field label="Κλείσιμο">{fmtDate(p.closeDate)}</Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-[length:var(--fs-14)]">Συναλλασσόμενοι</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-y-3">
              <Field label="Πελάτης"><TraderBlock t={p.customer} /></Field>
              <Field label="Προμηθευτής"><TraderBlock t={p.supplier} /></Field>
            </dl>
          </CardContent>
        </Card>

        {p.remarks && (
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-[length:var(--fs-14)]">Παρατηρήσεις</CardTitle></CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-[length:var(--fs-13)] text-foreground">{p.remarks}</p>
            </CardContent>
          </Card>
        )}
      </div>

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
