'use client';

// «Προϊόντα προμηθευτών»: ένα accordion ανά προμηθευτή με όλα τα είδη που του αγοράσαμε
// (από τα παραστατικά αγορών). Αναζήτηση σε προμηθευτή ΚΑΙ είδος, φίλτρο κλάδου, ανανέωση από SoftOne.
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FiLoader, FiPackage, FiRefreshCw, FiSearch } from 'react-icons/fi';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormSelect } from '@/components/admin/form-kit';
import { cn } from '@/lib/utils';

export interface SupplierProductRow {
  mtrl: number; code: string | null; name: string; isService: boolean;
  docs: number; qty: number; value: number; lastCost: number | null; lastDate: string | null;
}
export interface SupplierGroup {
  trdr: number; code: string; name: string; afm: string | null; city: string | null;
  sector: { id: number; name: string } | null; group: string | null; classProposed: boolean;
  total: number; lastDate: string | null; products: SupplierProductRow[];
}

const eur = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const qtyFmt = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 3 });
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('el-GR', { timeZone: 'UTC' }) : '—');
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('el');

export function SupplierProductsView({ groups, lastSync, canManage }: { groups: SupplierGroup[]; lastSync: string | null; canManage: boolean }) {
  const router = useRouter();
  const [q, setQ] = React.useState('');
  const [sector, setSector] = React.useState('');
  const [open, setOpen] = React.useState<string[]>([]);
  const [syncing, setSyncing] = React.useState(false);
  const deferredQ = React.useDeferredValue(q);

  const sectors = React.useMemo(() => {
    const m = new Map<number, string>();
    for (const g of groups) if (g.sector) m.set(g.sector.id, g.sector.name);
    return [...m].sort((a, b) => a[1].localeCompare(b[1], 'el')).map(([id, name]) => ({ id: String(id), name }));
  }, [groups]);

  // Αναζήτηση: ταιριάζει ο προμηθευτής (όλα τα είδη του) ή μόνο κάποια είδη (μόνο αυτά).
  const filtered = React.useMemo(() => {
    const term = fold(deferredQ.trim());
    return groups
      .filter((g) => !sector || String(g.sector?.id ?? '') === sector)
      .map((g) => {
        if (!term) return g;
        if (fold(`${g.name} ${g.code} ${g.afm ?? ''}`).includes(term)) return g;
        const products = g.products.filter((p) => fold(`${p.name} ${p.code ?? ''}`).includes(term));
        return products.length ? { ...g, products } : null;
      })
      .filter((g): g is SupplierGroup => g != null);
  }, [groups, deferredQ, sector]);

  // Όταν η αναζήτηση βρίσκει ΕΙΔΗ, οι προμηθευτές τους ανοίγουν μόνοι τους.
  // («Adjust state while rendering»· αρχικό `[]` ⇒ και στο πρώτο render, όπως το effect.)
  const [prevDeps, setPrevDeps] = React.useState<readonly unknown[]>([]);
  if (prevDeps.length === 0 || !Object.is(prevDeps[0], deferredQ) || !Object.is(prevDeps[1], filtered)) {
    setPrevDeps([deferredQ, filtered]);
    if (deferredQ.trim()) setOpen(filtered.slice(0, 20).map((g) => String(g.trdr)));
  }

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await fetch('/api/admin/supplier-products/sync', { method: 'POST' });
      const d = await r.json().catch(() => null);
      if (!r.ok) { toast.error(d?.message ?? 'Η ανανέωση απέτυχε.'); return; }
      toast.success(`Ανανεώθηκε: ${d.rows} είδη σε ${d.suppliers} προμηθευτές (${d.docs} παραστατικά).`);
      router.refresh();
    } catch { toast.error('Σφάλμα δικτύου.'); } finally { setSyncing(false); }
  };

  const totalProducts = filtered.reduce((n, g) => n + g.products.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <FiSearch aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input id="sp-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση προμηθευτή ή είδους…" className="h-8 pl-8 text-(length:--fs-13)" />
        </div>
        <div className="w-full sm:w-64">
          <FormSelect id="sp-sector" value={sector} onChange={(v) => setSector(v === '__all' ? '' : v)} ariaLabel="Κλάδος"
            opts={[{ id: '__all', name: 'Όλοι οι κλάδοι' }, ...sectors]} placeholder="Όλοι οι κλάδοι" />
        </div>
        {canManage && (
          <Button type="button" variant="outline" size="sm" onClick={() => void sync()} disabled={syncing} title="Ξαναδιαβάζει τα παραστατικά αγορών από το SoftOne">
            {syncing ? <FiLoader aria-hidden className="mr-1.5 size-3.5 animate-spin" /> : <FiRefreshCw aria-hidden className="mr-1.5 size-3.5" />} Ανανέωση από SoftOne
          </Button>
        )}
      </div>
      <p className="text-(length:--fs-12) text-muted-foreground">
        {filtered.length.toLocaleString('el-GR')} προμηθευτές · {totalProducts.toLocaleString('el-GR')} είδη
        {lastSync ? ` · ενημέρωση ${new Date(lastSync).toLocaleString('el-GR', { timeZone: 'Europe/Athens' })}` : ' · δεν έχει γίνει ακόμα συγχρονισμός'}
        {' · ποσότητα και αξία από τιμολόγια μείον πιστωτικά'}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-(length:--fs-13) text-muted-foreground">
          {groups.length === 0 ? 'Δεν υπάρχουν ακόμα δεδομένα — πάτα «Ανανέωση από SoftOne».' : 'Κανένα αποτέλεσμα για αυτή την αναζήτηση.'}
        </div>
      ) : (
        <Accordion type="multiple" value={open} onValueChange={setOpen} className="rounded-lg border border-border bg-card">
          {filtered.map((g) => (
            <AccordionItem key={g.trdr} value={String(g.trdr)} className="px-3">
              <AccordionTrigger className="gap-3 hover:no-underline">
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{g.name}</span>
                    <span className="block text-(length:--fs-11) font-normal text-muted-foreground">
                      <span className="font-mono">{g.code}</span>{g.afm ? ` · ΑΦΜ ${g.afm}` : ''}{g.city ? ` · ${g.city}` : ''}
                    </span>
                  </span>
                  {g.group && (
                    <span title={g.classProposed ? 'Αυτόματη πρόταση — δεν έχει εγκριθεί' : 'Εγκεκριμένη κατηγορία'}
                      className={cn('rounded-full px-2 py-0.5 text-(length:--fs-11) font-normal', g.classProposed ? 'border border-dashed border-amber-400 text-amber-800 dark:text-amber-300' : 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200')}>
                      {g.group}
                    </span>
                  )}
                  <span className="flex shrink-0 items-center gap-3 text-(length:--fs-12) font-normal tabular-nums text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><FiPackage aria-hidden className="size-3" />{g.products.length}</span>
                    <span className="w-28 text-right font-medium text-foreground">{eur.format(g.total)}</span>
                    <span className="hidden w-20 text-right sm:inline">{date(g.lastDate)}</span>
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="-mx-3 overflow-x-auto">
                  <table className="w-full min-w-160 text-(length:--fs-12)">
                    <thead className="bg-muted/50 text-(length:--fs-11) text-muted-foreground">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium">Κωδικός</th>
                        <th className="px-2 py-1.5 text-left font-medium">Είδος</th>
                        <th className="px-2 py-1.5 text-right font-medium">Παραστ.</th>
                        <th className="px-2 py-1.5 text-right font-medium">Ποσότητα</th>
                        <th className="px-2 py-1.5 text-right font-medium">Αξία</th>
                        <th className="px-2 py-1.5 text-right font-medium">Τελ. κόστος</th>
                        <th className="px-3 py-1.5 text-right font-medium">Τελ. αγορά</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border tabular-nums">
                      {g.products.map((p) => (
                        <tr key={p.mtrl}>
                          <td className="whitespace-nowrap px-3 py-1.5 font-mono text-muted-foreground">{p.code ?? '—'}</td>
                          <td className="px-2 py-1.5">
                            {p.name}
                            {p.isService && <span className="ml-1.5 rounded bg-muted px-1 text-(length:--fs-11) text-muted-foreground">υπηρεσία</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right">{p.docs}</td>
                          <td className="px-2 py-1.5 text-right">{qtyFmt.format(p.qty)}</td>
                          <td className="px-2 py-1.5 text-right font-medium">{eur.format(p.value)}</td>
                          <td className="px-2 py-1.5 text-right">{p.lastCost != null ? eur.format(p.lastCost) : '—'}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right">{date(p.lastDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
