'use client';

import Link from 'next/link';
import { FiBriefcase, FiClock, FiFileText, FiHelpCircle, FiMoreVertical } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';

export function RowMenu({ id, prjc, questions }: { id: string; prjc: number | null; questions: number }) {
  const base = `/admin/projects/contracts/${id}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Ενέργειες αιτήματος"><FiMoreVertical className="size-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild className={ITEM}><Link href={base}><FiFileText className="size-3.5" /> Άνοιγμα προσφοράς</Link></DropdownMenuItem>
        {questions > 0 && <DropdownMenuItem asChild className={ITEM}><Link href={`${base}#c-requests`}><FiHelpCircle className="size-3.5" /> Ερωτήσεις πελάτη ({questions})</Link></DropdownMenuItem>}
        <DropdownMenuItem asChild className={ITEM}><Link href={`${base}#hist-h`}><FiClock className="size-3.5" /> Ιστορικό επικοινωνίας</Link></DropdownMenuItem>
        {prjc != null && <DropdownMenuItem asChild className={ITEM}><Link href={`/admin/projects/${prjc}`}><FiBriefcase className="size-3.5" /> Έργο</Link></DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
