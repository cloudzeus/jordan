'use client';

// Κουμπί «Ορισμός / Αλλαγή τοποθεσίας» για την καρτέλα «Τοποθεσία» και το πεδίο της επισκόπησης —
// ανοίγει τον ίδιο διάλογο με το ⋮ → «Τοποθεσία έργου…».
import * as React from 'react';
import { FiEdit2, FiMapPin } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ProjectSiteDialog } from './project-site-dialog';

export function ProjectSiteButton({ prjc, projectLabel, hasSite, variant = 'button', className }: {
  prjc: number; projectLabel: string; hasSite: boolean; variant?: 'button' | 'link'; className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const label = hasSite ? 'Αλλαγή τοποθεσίας' : 'Ορισμός τοποθεσίας';
  return (
    <>
      {variant === 'link' ? (
        <button type="button" onClick={() => setOpen(true)} className={cn('cursor-pointer font-medium text-primary underline-offset-2 hover:underline', className)}>
          {hasSite ? 'αλλαγή' : 'ορισμός τοποθεσίας'}
        </button>
      ) : (
        <Button type="button" size="sm" variant={hasSite ? 'outline' : 'default'} onClick={() => setOpen(true)} className={cn('gap-1.5', className)}>
          {hasSite ? <FiEdit2 className="size-3.5" aria-hidden /> : <FiMapPin className="size-3.5" aria-hidden />}{label}
        </Button>
      )}
      {open && <ProjectSiteDialog open={open} onOpenChange={setOpen} prjc={prjc} projectLabel={projectLabel} />}
    </>
  );
}
