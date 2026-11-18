'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { FloorPlanListRow } from '@/lib/floorplan/plans';

export function FloorPlanLibraryPicker({ prjc, onImported, disabled }: { prjc: number; onImported: (id: string) => Promise<void>; disabled: boolean }) {
  const [plans, setPlans] = useState<FloorPlanListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    fetch('/api/admin/floorplan-library/floorplans', { cache: 'no-store' }).then(async (res) => {
      if (!res.ok) throw new Error('Δεν φορτώθηκε η βιβλιοθήκη.');
      return res.json();
    }).then((data) => { if (active) setPlans(data.plans); }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  async function choose(id: string) {
    if (importing) return;
    setImporting(id); setError('');
    try {
      const res = await fetch(`/api/admin/projects/${prjc}/floorplans/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ floorPlanId: id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Η κάτοψη δεν προστέθηκε στο έργο.');
      await onImported(data.id);
    } catch (e) { setError((e as Error).message); }
    finally { setImporting(null); }
  }
  const shown = plans.filter((p) => `${p.title} ${p.source || ''}`.toLocaleLowerCase('el').includes(query.trim().toLocaleLowerCase('el')));
  return <section className="w-full max-w-xl space-y-3 rounded-2xl border border-cyan-400/30 bg-slate-900/90 p-4" aria-label="Επιλογή κάτοψης βιβλιοθήκης">
    <div><h3 className="text-sm font-semibold text-cyan-300">Επιλογή από τη βιβλιοθήκη</h3><p className="mt-1 text-xs text-slate-400">Προσθέτει αντίγραφο με τις επιμετρήσεις στο έργο. Η αρχική κάτοψη παραμένει διαθέσιμη στη βιβλιοθήκη.</p></div>
    <Input aria-label="Αναζήτηση στη βιβλιοθήκη" placeholder="Προαιρετική αναζήτηση τίτλου…" value={query} onChange={(e) => setQuery(e.target.value)} className="border-slate-600 bg-slate-950 text-slate-100" />
    {loading && <p role="status" className="text-xs text-slate-300">Φόρτωση βιβλιοθήκης…</p>}
    {error && <div role="alert" className="space-y-2 text-sm text-red-300"><p>{error}</p><Button size="sm" variant="secondary" disabled={!!importing} onClick={() => { setError(''); setLoading(true); setRetry((n) => n + 1); }}>Επανάληψη φόρτωσης</Button></div>}
    {!loading && !error && !shown.length && <p className="text-xs text-slate-400">{plans.length ? 'Δεν βρέθηκε κάτοψη με αυτόν τον τίτλο.' : 'Δεν υπάρχουν ανεξάρτητες κατόψεις. Ανέβασε μία από τη σελίδα «Κατόψεις & σχέδια».'}</p>}
    <ul className="max-h-72 divide-y divide-slate-700 overflow-y-auto">
      {shown.map((p) => {
        const ready = p.roomCount > 0 && p.floorM2 > 0;
        return <li key={p.id} className="flex items-center gap-3 py-3">
          <img src={`/api/admin/floorplans/${p.id}/image?v=plan`} alt="" className="h-14 w-16 shrink-0 rounded border border-slate-700 bg-white object-contain" loading="lazy" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-100">{p.title}</p><p className="text-xs text-slate-400">{p.roomCount} χώροι · {p.floorM2.toLocaleString('el-GR', { maximumFractionDigits: 2 })} m²</p>{!ready && <p className="text-xs text-amber-300">Χρειάζεται κλίμακα και επιμέτρηση χώρων</p>}</div>
          <Button size="sm" variant="secondary" disabled={!ready || disabled || !!importing} onClick={() => void choose(p.id)}>{importing === p.id ? 'Αντιγραφή…' : 'Επιλογή'}</Button>
        </li>;
      })}
    </ul>
  </section>;
}
