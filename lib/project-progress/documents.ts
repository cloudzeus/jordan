import 'server-only';
import { getProject } from '@/lib/projects';
import { getProjectFinancials } from '@/lib/project-profit';
import { customerProjectTasks, listTasks } from '@/lib/project-tasks';
import { getProjectSite } from '@/lib/project-site';
import { siteLine } from '@/lib/project-site-core';
import { phaseMeta } from '@/lib/project-tasks-core';
import { emailBrand } from '@/lib/email/brand';
import { uploadEntityFile } from '@/lib/entity-files/service';
import { dayEl } from '@/lib/contracts/core';
import { renderProgressPdf, type ProgressTask } from './pdf';

/**
 * Φτιάχνει το PDF «Αναφορά πορείας έργου» (customer-facing) και το αποθηκεύει στον φάκελο «Αναφορές
 * προόδου» του έργου (Bunny, μέσω uploadEntityFile). Επιστρέφει το `fileId` για άνοιγμα/λήψη.
 * Δεν γράφει τίποτα στο SoftOne. Η οικονομική εικόνα περιορίζεται σε τιμολογημένο/εισπραγμένο/υπόλοιπο.
 */
export async function generateProjectProgressPdf(
  prjc: number,
  user: { id: string; name: string | null; email: string },
): Promise<{ fileId: string; fileName: string }> {
  const p = await getProject(prjc);
  if (!p) throw Object.assign(new Error('Το έργο δεν βρέθηκε'), { status: 404 });

  const [fin, tasksRes, site, brand] = await Promise.all([
    getProjectFinancials(prjc).catch(() => null),
    p.trdr != null ? customerProjectTasks(p.trdr, prjc) : Promise.resolve(null),
    getProjectSite(prjc),
    emailBrand(),
  ]);

  // Εργασίες ορατές στον πελάτη + συνολική (σταθμισμένη) ολοκλήρωση. Fallback όταν το έργο δεν έχει
  // συνδεδεμένο πελάτη (trdr): οι ίδιες εργασίες από το πλήρες πρόγραμμα.
  let tasks: ProgressTask[];
  let progress: number;
  if (tasksRes) {
    tasks = tasksRes.tasks.map((t) => ({ name: t.name, phaseLabel: phaseMeta(t.phase).label, start: t.start, end: t.end, progress: t.progress }));
    progress = tasksRes.progress;
  } else {
    const w = await listTasks(prjc);
    tasks = w.tasks.filter((t) => t.customerVisible).map((t) => ({ name: t.name, phaseLabel: phaseMeta(t.phase).label, start: t.sched.start, end: t.sched.end, progress: t.progress }));
    progress = w.progress;
  }

  const financials = fin
    ? { invoicedGross: fin.profit.revenue.gross, collected: fin.profit.collections.collected, open: fin.profit.collections.open }
    : null;

  const pdf = await renderProgressPdf({
    ref: p.code,
    projectName: p.name,
    issuedOn: new Date(),
    statusLabel: p.statusLabel,
    fromDate: p.fromDate,
    finalDate: p.finalDate,
    progress,
    site: site ? siteLine(site) : null,
    company: { name: brand.name, legalName: brand.legalName, vat: brand.vat, address: brand.address, phones: brand.phones, email: brand.email },
    customer: p.customer
      ? { name: p.customer.name, afm: p.customer.afm, address: [p.customer.address, p.customer.city].filter(Boolean).join(', ') || null, phone: p.customer.phone, email: p.customer.email }
      : null,
    tasks,
    financials,
    remarks: p.remarks,
  });

  const iso = new Date().toISOString().slice(0, 10);
  const safeCode = p.code.replace(/[\\/:*?"<>|]/g, '-');
  const fileName = `Αναφορά προόδου ${safeCode} ${iso}.pdf`;
  const file = await uploadEntityFile({
    type: 'PROJECT', id: prjc, buffer: pdf, name: fileName, subfolder: 'Αναφορές προόδου',
    notes: `Αναφορά πορείας έργου · ${dayEl(new Date())} · ολοκλήρωση ${Math.round(progress)}%`,
    user,
  });
  return { fileId: file.id, fileName: file.name };
}
