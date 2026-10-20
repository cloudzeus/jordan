'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { FiMoreVertical, FiPackage, FiTool, FiExternalLink, FiRefreshCw, FiCopy, FiMapPin, FiFolder, FiTrello, FiSquare } from 'react-icons/fi';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AddBudgetLineDialog } from './add-budget-line-dialog';
import { ProjectSiteDialog } from './project-site-dialog';
import { emitProjectRefresh } from './project-events';
import { ExportItem, useFinancialsActions } from './financials-actions';

const ITEM = 'cursor-pointer gap-2 text-[length:var(--fs-12)]';

// three.js + pdfjs φορτώνονται μόνο όταν ανοίξει το εργαλείο.
const FloorPlanDialog = dynamic(() => import('@/components/admin/floorplan/floor-plan-dialog').then((m) => m.FloorPlanDialog), { ssr: false });

/** Μενού ενεργειών δεξιά σε κάθε έργο (λίστα) ή στην κεφαλίδα της καρτέλας του. */
export function ProjectRowActions({
  prjc, code, name, canManage, financials = false, exportDoc = false, files = false, manageFiles = false,
}: {
  prjc: number;
  code: string;
  name: string;
  canManage: boolean;
  /** Καρτέλα έργου με projects.financials: οι ενέργειες οικονομικών μπαίνουν στο ίδιο μενού. */
  financials?: boolean;
  /** Λίστα έργων με projects.financials: «Κατευθύνσεις έργου (Word)» στο μενού της γραμμής. */
  exportDoc?: boolean;
  /** files.read: «Αρχεία έργου» (φάκελος στο Bunny, ενότητα #files της καρτέλας) */
  files?: boolean;
  /** files.manage: η διαστασιολόγηση κάτοψης μπορεί να αποθηκεύσει PNG/CSV στα αρχεία του έργου. */
  manageFiles?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const openFiles = () => {
    const here = `/admin/projects/${prjc}`;
    if (pathname === here) document.getElementById('files')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else router.push(`${here}#files`);
  };
  const fin = useFinancialsActions(canManage, prjc);
  const [dialog, setDialog] = React.useState<'product' | 'service' | null>(null);
  const [siteOpen, setSiteOpen] = React.useState(false);
  // Μένει mounted μετά το πρώτο άνοιγμα: κλείσιμο/άνοιγμα δεν χάνει την κάτοψη και τις μετρήσεις.
  const [plan, setPlan] = React.useState<'closed' | 'open' | 'hidden'>('closed');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`Αντιγράφηκε ο κωδικός ${code}`);
    } catch {
      toast.error('Δεν επετράπη η αντιγραφή στο πρόχειρο');
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted data-[state=open]:text-foreground"
          aria-label={`Ενέργειες για το έργο ${code}`}
          onClick={(e) => e.stopPropagation()}
        >
          <FiMoreVertical className="size-4" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="truncate text-[length:var(--fs-11)] font-semibold text-muted-foreground">
            {code} · {name}
          </DropdownMenuLabel>
          {canManage && (
            <>
              <DropdownMenuItem className={ITEM} onSelect={() => setDialog('product')}>
                <FiPackage className="size-3.5" style={{ color: '#B45309' }} aria-hidden /> Προσθήκη υλικού
              </DropdownMenuItem>
              <DropdownMenuItem className={ITEM} onSelect={() => setDialog('service')}>
                <FiTool className="size-3.5" style={{ color: '#7C3AED' }} aria-hidden /> Προσθήκη υπηρεσίας
              </DropdownMenuItem>
              <DropdownMenuItem className={ITEM} onSelect={() => setSiteOpen(true)}>
                <FiMapPin className="size-3.5" style={{ color: '#0F766E' }} aria-hidden /> Τοποθεσία έργου…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem className={ITEM} onSelect={() => router.push(`/admin/projects/${prjc}`)}>
            <FiExternalLink className="size-3.5" aria-hidden /> Άνοιγμα καρτέλας έργου
          </DropdownMenuItem>
          <DropdownMenuItem className={ITEM} onSelect={() => router.push(`/admin/projects/${prjc}/tasks`)}>
            <FiTrello className="size-3.5" style={{ color: '#2563EB' }} aria-hidden /> Εργασίες (Kanban & Gantt)
          </DropdownMenuItem>
          <DropdownMenuItem className={ITEM} onSelect={() => setPlan('open')}>
            <FiSquare className="size-3.5" style={{ color: '#0891B2' }} aria-hidden /> Διαστασιολόγηση κάτοψης…
          </DropdownMenuItem>
          {files && (
            <DropdownMenuItem className={ITEM} onSelect={openFiles}>
              <FiFolder className="size-3.5" style={{ color: '#B91C1C' }} aria-hidden /> Αρχεία & φάκελοι έργου
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className={ITEM}
            onSelect={() => { emitProjectRefresh(prjc, 'all'); toast.message('Ανανέωση κινήσεων από το SoftOne…'); }}
          >
            <FiRefreshCw className="size-3.5" aria-hidden /> Ανανέωση από SoftOne
          </DropdownMenuItem>
          <DropdownMenuItem className={ITEM} onSelect={copy}>
            <FiCopy className="size-3.5" aria-hidden /> Αντιγραφή κωδικού
          </DropdownMenuItem>
          {financials && (
            <>
              <DropdownMenuSeparator />
              {fin.items}
            </>
          )}
          {!financials && exportDoc && <ExportItem prjc={prjc} />}
        </DropdownMenuContent>
      </DropdownMenu>
      {financials && fin.dialog}

      {canManage && (
        <AddBudgetLineDialog
          open={dialog != null}
          onOpenChange={(o) => { if (!o) setDialog(null); }}
          prjc={prjc}
          projectLabel={`${code} · ${name}`}
          defaultKind={dialog ?? 'product'}
        />
      )}
      {plan !== 'closed' && (
        <FloorPlanDialog
          prjc={prjc} projectLabel={`${code} · ${name}`} canSave={manageFiles}
          open={plan === 'open'} onOpenChange={(o) => setPlan(o ? 'open' : 'hidden')}
        />
      )}
      {canManage && siteOpen && (
        <ProjectSiteDialog open={siteOpen} onOpenChange={setSiteOpen} prjc={prjc} projectLabel={`${code} · ${name}`} />
      )}
    </>
  );
}
