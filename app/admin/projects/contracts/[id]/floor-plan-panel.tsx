import { FiDownload, FiLayers, FiPackage, FiSquare } from 'react-icons/fi';
import { getFloorPlan } from '@/lib/floorplan/plans';
import { roomSheet } from '@/lib/floorplan/saved';

const nf2 = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const m2 = (n: number) => `${nf2.format(n)} m²`;

/**
 * Η χαρτογράφηση κάτοψης από την οποία βγήκε η προσφορά: εικόνα με τους χώρους και πίνακας. Το ίδιο
 * υλικό μπαίνει στο PDF του πελάτη («Κάτοψη χώρων») και των συνεργείων («Κάτοψη & χώροι εργασίας»).
 */
export async function FloorPlanPanel({ floorPlanId }: { floorPlanId: string }) {
  const p = await getFloorPlan(floorPlanId).catch(() => null);
  if (!p) return null;
  const sheet = roomSheet(p.data);
  return (
    <details open className="group rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md" style={{ background: '#0B1220', color: '#22D3EE' }}><FiSquare className="size-4" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-(length:--fs-14) font-semibold">Κάτοψη & χώροι</span>
          <span className="block truncate text-(length:--fs-12) text-muted-foreground">
            {p.title} · {sheet.rows.length} χώροι · δάπεδο {m2(sheet.floorM2)}{sheet.wallsM2 > 0 ? ` · τοίχοι ${m2(sheet.wallsM2)}` : ''} — μπαίνει στο PDF πελάτη και συνεργείων
          </span>
        </span>
        <span className="text-(length:--fs-12) text-muted-foreground group-open:hidden">Εμφάνιση</span>
      </summary>
      <div className="grid gap-4 border-t border-border p-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {p.annotatedFileId ? (
          <a href={`/api/admin/floorplans/${p.id}/image`} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-border bg-white">
            {/* Απλό <img>: ιδιωτικό αρχείο μέσω API, όχι next/image. */}
            <img src={`/api/admin/floorplans/${p.id}/image`} alt={`Κάτοψη ${p.title} με τους χώρους`} className="h-auto w-full" />
          </a>
        ) : <p className="text-(length:--fs-12) text-muted-foreground">Χωρίς εικόνα.</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-(length:--fs-12)">
            <thead className="text-left text-(length:--fs-11) text-muted-foreground">
              <tr className="border-b border-border"><th className="py-1.5 pr-2 font-medium">Χώρος</th><th className="py-1.5 pr-2 text-right font-medium">Δάπεδο</th><th className="py-1.5 text-right font-medium">Τοίχοι</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sheet.rows.map((r, i) => (
                <tr key={i} className="align-top">
                  <td className="py-1.5 pr-2">
                    <span className="flex items-center gap-1.5 font-medium"><span className="size-2.5 shrink-0 rounded-sm" style={{ background: r.color }} aria-hidden />{r.name}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-(length:--fs-11) text-muted-foreground">
                      {r.materialType === 'recipe' ? <FiLayers className="size-3" aria-hidden /> : r.materialType === 'item' ? <FiPackage className="size-3" aria-hidden /> : null}
                      {r.material ?? 'Χωρίς υλικό'}
                    </span>
                    {r.walls?.openings && <span className="block text-(length:--fs-11) text-muted-foreground">Ανοίγματα: {r.walls.openings}</span>}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums">{m2(r.floorM2)}<span className="block text-(length:--fs-11) text-muted-foreground">Π {nf2.format(r.perimeterM)} m</span></td>
                  <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{r.walls ? <>{m2(r.walls.netM2)}<span className="block text-(length:--fs-11) text-muted-foreground">ύψος {nf2.format(r.walls.heightM)} m</span></> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {p.sourceFileId && (
            <a href={`/api/admin/floorplans/${p.id}/image?v=source`} className="mt-3 inline-flex items-center gap-1.5 text-(length:--fs-12) font-medium text-foreground underline-offset-2 hover:underline">
              <FiDownload className="size-3.5" aria-hidden /> Πρωτότυπο σχέδιο{p.source ? ` (${p.source})` : ''}
            </a>
          )}
          <p className="mt-2 text-(length:--fs-11) text-muted-foreground">Η χαρτογράφηση ξανανοίγει από το έργο: ⋮ → «Διαστασιολόγηση κάτοψης…» → «Αποθηκευμένες χαρτογραφήσεις».</p>
        </div>
      </div>
    </details>
  );
}
