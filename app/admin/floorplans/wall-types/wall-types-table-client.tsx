'use client';

// Κατάλογος τύπων κατασκευής: πυκνός πίνακας (ταξινόμηση/πλάτη από το DataTable), μία γραμμή ανά τύπο,
// ενέργειες σε ⋮ dropdown, προσθήκη/επεξεργασία σε modal. Δικαίωμα: floorplans.catalog.
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { FiPlus, FiMoreVertical, FiEdit2, FiCheck, FiSlash, FiTrash2 } from 'react-icons/fi';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { WALL_TYPE_CATEGORY_LABEL, MEASURE_FACES, type WallTypeInput } from '@/lib/floorplan/wall-types';
import { WallTypeEditor, type WallTypeRow } from './wall-type-editor';
import { setWallTypeActiveAction, deleteWallTypeAction } from './actions';

// Ό,τι χρειάζεται ο πίνακας/editor από μια εγγραφή WallType (prisma), χωρίς timestamps.
export type WallTypeData = WallTypeInput & { id: string };

const ITEM = 'flex items-center gap-2 text-(length:--fs-13)';
const MEASURE_LABEL: Record<(typeof MEASURE_FACES)[number], string> = { none: 'καμία', one: 'μία', both: 'δύο' };
const cm = (m: number) => `${Math.round(m * 100)} cm`;

export function WallTypesTableClient({ rows, canManage }: { rows: WallTypeData[]; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<WallTypeRow | null>(null);

  const edit = (r: WallTypeData) => { setEditing(r); setOpen(true); };
  const add = () => { setEditing(null); setOpen(true); };

  const toggle = async (r: WallTypeData) => {
    const res = await setWallTypeActiveAction(r.id, !r.active);
    if (res.ok) { toast.success(r.active ? `Ο τύπος «${r.name}» απενεργοποιήθηκε` : `Ο τύπος «${r.name}» ενεργοποιήθηκε`); router.refresh(); }
    else toast.error(res.message);
  };

  const remove = async (r: WallTypeData) => {
    const ok = await confirmAction({ title: 'Διαγραφή τύπου', message: `Διαγραφή του τύπου «${r.name}»; Η ενέργεια δεν αναιρείται.`, confirmLabel: 'Διαγραφή', destructive: true });
    if (!ok) return;
    const res = await deleteWallTypeAction(r.id);
    if (res.ok) { toast.success(`Ο τύπος «${r.name}» διαγράφηκε`); router.refresh(); }
    else toast.error(res.message);
  };

  const columns = React.useMemo<ColumnDef<WallTypeData>[]>(() => [
    { accessorKey: 'code', header: 'Κωδικός', size: 110, cell: ({ row }) => <span className="font-mono text-(length:--fs-12) tabular-nums">{row.original.code}</span> },
    {
      accessorKey: 'name', header: 'Όνομα', size: 300,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-2 text-(length:--fs-12) font-medium text-foreground">
          <span className="size-3 shrink-0 rounded-sm border border-border/60" style={{ background: row.original.color }} aria-hidden />
          {row.original.name}
        </span>
      ),
    },
    { accessorKey: 'category', header: 'Κατηγορία', size: 180, cell: ({ row }) => <span className="text-(length:--fs-12)">{WALL_TYPE_CATEGORY_LABEL[row.original.category]}</span> },
    { accessorKey: 'thicknessM', header: 'Πάχος', size: 90, cell: ({ row }) => <span className="text-(length:--fs-12) tabular-nums">{cm(row.original.thicknessM)}</span> },
    {
      id: 'height', header: 'Ύψος', size: 130,
      cell: ({ row }) => <span className="text-(length:--fs-12) tabular-nums text-foreground/80">{row.original.topM == null ? 'ως ταβάνι' : `${row.original.bottomM}–${row.original.topM} m`}</span>,
    },
    { accessorKey: 'measureFaces', header: 'Όψεις', size: 90, cell: ({ row }) => <span className="text-(length:--fs-12)">{MEASURE_LABEL[row.original.measureFaces]}</span> },
    { accessorKey: 'hotkey', header: '⌨', size: 60, cell: ({ row }) => <span className="font-mono text-(length:--fs-12)">{row.original.hotkey ?? '—'}</span> },
    {
      accessorKey: 'active', header: 'Ενεργό', size: 90,
      cell: ({ row }) => (row.original.active
        ? <span className="inline-flex items-center gap-1 text-(length:--fs-12)" style={{ color: '#047857' }}><FiCheck className="size-3.5" aria-hidden /> Ναι</span>
        : <span className="inline-flex items-center gap-1 text-(length:--fs-12) text-muted-foreground"><FiSlash className="size-3.5" aria-hidden /> Όχι</span>),
    },
    ...(canManage ? [{
      id: 'actions', header: '', size: 48, enableResizing: false, enableSorting: false, enableHiding: false,
      cell: ({ row }: { row: { original: WallTypeData } }) => {
        const r = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Ενέργειες ${r.code}`}>
              <FiMoreVertical className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem className={ITEM} onSelect={() => edit(r)}><FiEdit2 className="size-3.5" aria-hidden /> Επεξεργασία</DropdownMenuItem>
              <DropdownMenuItem className={ITEM} onSelect={() => toggle(r)}>
                {r.active ? <><FiSlash className="size-3.5" aria-hidden /> Απενεργοποίηση</> : <><FiCheck className="size-3.5" aria-hidden /> Ενεργοποίηση</>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" className={ITEM} onSelect={() => remove(r)}><FiTrash2 className="size-3.5" aria-hidden /> Διαγραφή</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    }] : []),
  ], [canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const hotkeys = rows.map((r) => r.hotkey).filter((h): h is string => !!h);

  return (
    <div className="space-y-2">
      <DataTable
        columns={columns}
        data={rows}
        searchKey="name"
        searchPlaceholder="Αναζήτηση (κωδικός, όνομα…)"
        persistKey="admin.walltypes.table.v1"
        pageSize={50}
        toolbar={canManage ? <Button size="sm" onClick={add}><FiPlus className="mr-1.5 size-3.5" aria-hidden /> Νέος τύπος</Button> : undefined}
      />
      {canManage && open && <WallTypeEditor key={editing?.id ?? 'new'} open onOpenChange={setOpen} initial={editing} existingHotkeys={hotkeys} />}
    </div>
  );
}
