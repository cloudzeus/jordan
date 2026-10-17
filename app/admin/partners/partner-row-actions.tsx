'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FiMoreVertical, FiEdit3, FiUserPlus, FiLink, FiBriefcase, FiTrash2, FiCopy } from 'react-icons/fi';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { confirmAction } from '@/components/ui/confirm-dialog';
import type { PartnerListRow } from '@/lib/partners';
import { ContactDialog, LinkCustomersDialog, LinkProjectDialog, PartnerFormDialog } from './partner-dialogs';

const ITEM = 'cursor-pointer gap-2 text-[length:var(--fs-12)]';
type Mode = 'edit' | 'contact' | 'customers' | 'project' | null;

/** Μενού ενεργειών δεξιά σε κάθε συνεργάτη. */
export function PartnerRowActions({ row, canManage }: { row: PartnerListRow; canManage: boolean }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>(null);
  const close = (o: boolean) => { if (!o) { setMode(null); router.refresh(); } };

  const remove = async () => {
    const ok = await confirmAction({
      title: `Διαγραφή «${row.name}»;`,
      message: 'Διαγράφονται και τα πρόσωπα επικοινωνίας και οι συσχετίσεις με πελάτες/έργα. Τα στοιχεία του SoftOne δεν αγγίζονται.',
      confirmLabel: 'Διαγραφή',
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/partners/${row.id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Ο συνεργάτης διαγράφηκε'); router.refresh(); } else toast.error('Η διαγραφή απέτυχε');
  };

  const copy = async () => {
    const text = [row.name, row.afm && `ΑΦΜ ${row.afm}`, row.phone, row.mobile, row.email].filter(Boolean).join(' · ');
    try { await navigator.clipboard.writeText(text); toast.success('Αντιγράφηκαν τα στοιχεία'); } catch { toast.error('Δεν επετράπη η αντιγραφή'); }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted data-[state=open]:text-foreground"
          aria-label={`Ενέργειες για ${row.name}`}
          onClick={(e) => e.stopPropagation()}
        >
          <FiMoreVertical className="size-4" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="truncate text-[length:var(--fs-11)] font-semibold text-muted-foreground">{row.name}</DropdownMenuLabel>
          {canManage && (
            <>
              <DropdownMenuItem className={ITEM} onSelect={() => setMode('edit')}>
                <FiEdit3 className="size-3.5" style={{ color: '#0369A1' }} aria-hidden /> Επεξεργασία
              </DropdownMenuItem>
              {row.type === 'COMPANY' && (
                <DropdownMenuItem className={ITEM} onSelect={() => setMode('contact')}>
                  <FiUserPlus className="size-3.5" style={{ color: '#7C3AED' }} aria-hidden /> Προσθήκη προσώπου
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className={ITEM} onSelect={() => setMode('customers')}>
                <FiLink className="size-3.5" style={{ color: '#047857' }} aria-hidden /> Σύνδεση με πελάτες
              </DropdownMenuItem>
              <DropdownMenuItem className={ITEM} onSelect={() => setMode('project')} disabled={row.customerCount === 0}>
                <FiBriefcase className="size-3.5" style={{ color: '#B45309' }} aria-hidden /> Σύνδεση με έργο
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem className={ITEM} onSelect={copy}>
            <FiCopy className="size-3.5" aria-hidden /> Αντιγραφή στοιχείων
          </DropdownMenuItem>
          {canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className={`${ITEM} text-destructive focus:text-destructive`} onSelect={remove}>
                <FiTrash2 className="size-3.5" aria-hidden /> Διαγραφή
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {canManage && (
        <>
          <PartnerFormDialog open={mode === 'edit'} onOpenChange={close} partnerId={mode === 'edit' ? row.id : null} />
          <ContactDialog open={mode === 'contact'} onOpenChange={close} partnerId={row.id} partnerName={row.name} contact={null} />
          <LinkCustomersDialog open={mode === 'customers'} onOpenChange={close} partnerId={row.id} partnerName={row.name} />
          <LinkProjectDialog open={mode === 'project'} onOpenChange={close} partnerId={row.id} partnerName={row.name} />
        </>
      )}
    </>
  );
}
