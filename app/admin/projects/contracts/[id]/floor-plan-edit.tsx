'use client';

// «Επεξεργασία κάτοψης» από τη σελίδα της σύμβασης/προσφοράς: ανοίγει το ίδιο εργαλείο στην ίδια
// αποθηκευμένη χαρτογράφηση· με την αποθήκευση ενημερώνεται (όχι νέα) και η σελίδα ξαναφορτώνει.
import * as React from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { FiEdit2 } from 'react-icons/fi';
import type { FloorPlanOwner } from '@/components/admin/floorplan/floor-plan-dialog';

const FloorPlanDialog = dynamic(() => import('@/components/admin/floorplan/floor-plan-dialog').then((m) => m.FloorPlanDialog), { ssr: false });

export function FloorPlanEditButton({ planId, owner, label }: { planId: string; owner: FloorPlanOwner; label: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        // Μέσα στο <summary>: να μην ανοιγοκλείνει το πάνελ.
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        className="inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-(length:--fs-12) font-medium hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <FiEdit2 className="size-3.5" aria-hidden /> Επεξεργασία κάτοψης
      </button>
      {open && (
        <FloorPlanDialog
          owner={owner} projectLabel={label} canSave initialPlanId={planId}
          open={open} onOpenChange={(o) => { setOpen(o); if (!o) router.refresh(); }}
        />
      )}
    </>
  );
}
