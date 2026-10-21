'use client';

import { FiMoreVertical, FiDownload, FiExternalLink, FiCopy, FiSlash } from 'react-icons/fi';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';

/**
 * ⋮ ενός παραστατικού: επίσημο PDF παρόχου (μόνο όταν υπάρχει στο SoftOne — ποτέ «δικό μας»),
 * σελίδα επαλήθευσης myDATA (QR ΑΑΔΕ), αντιγραφή ΜΑΡΚ / κωδικού.
 */
export function DocRowActions({ findoc, fincode, mark, qrUrl, providerPdf }: {
  findoc: number; fincode: string; mark: string | null; qrUrl: string | null; providerPdf: boolean;
}) {
  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`Αντιγράφηκε ${label}`); } catch { toast.error('Δεν επετράπη η αντιγραφή'); }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted"
        aria-label={`Ενέργειες για το ${fincode}`}
      >
        <FiMoreVertical className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="truncate text-(length:--fs-11) font-semibold text-muted-foreground">{fincode}</DropdownMenuLabel>
        {providerPdf ? (
          <DropdownMenuItem className={ITEM} asChild>
            <a href={`/api/admin/projects/documents/${findoc}/pdf`} download>
              <FiDownload className="size-3.5" aria-hidden /> Λήψη PDF παρόχου
            </a>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem className={ITEM} disabled>
            <FiSlash className="size-3.5" aria-hidden /> Δεν υπάρχει PDF παρόχου στο SoftOne
          </DropdownMenuItem>
        )}
        {qrUrl && (
          <DropdownMenuItem className={ITEM} asChild>
            <a href={qrUrl} target="_blank" rel="noopener noreferrer">
              <FiExternalLink className="size-3.5" aria-hidden /> Επαλήθευση στο myDATA (QR)
            </a>
          </DropdownMenuItem>
        )}
        {mark && (
          <DropdownMenuItem className={ITEM} onSelect={() => void copy(mark, `ο ΜΑΡΚ ${mark}`)}>
            <FiCopy className="size-3.5" aria-hidden /> Αντιγραφή ΜΑΡΚ
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className={ITEM} onSelect={() => void copy(fincode, `ο κωδικός ${fincode}`)}>
          <FiCopy className="size-3.5" aria-hidden /> Αντιγραφή κωδικού
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
