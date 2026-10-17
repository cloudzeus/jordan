'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FiMoreVertical, FiPackage, FiTool, FiExternalLink, FiRefreshCw, FiCopy } from 'react-icons/fi';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AddBudgetLineDialog } from './add-budget-line-dialog';
import { emitProjectRefresh } from './project-events';
import { useFinancialsActions } from './financials-actions';

const ITEM = 'cursor-pointer gap-2 text-[length:var(--fs-12)]';

/** Μενού ενεργειών δεξιά σε κάθε έργο (λίστα) ή στην κεφαλίδα της καρτέλας του. */
export function ProjectRowActions({
  prjc, code, name, canManage, financials = false,
}: {
  prjc: number;
  code: string;
  name: string;
  canManage: boolean;
  /** Καρτέλα έργου με projects.financials: οι ενέργειες οικονομικών μπαίνουν στο ίδιο μενού. */
  financials?: boolean;
}) {
  const router = useRouter();
  const fin = useFinancialsActions(canManage);
  const [dialog, setDialog] = React.useState<'product' | 'service' | null>(null);

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
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem className={ITEM} onSelect={() => router.push(`/admin/projects/${prjc}`)}>
            <FiExternalLink className="size-3.5" aria-hidden /> Άνοιγμα καρτέλας έργου
          </DropdownMenuItem>
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
    </>
  );
}
