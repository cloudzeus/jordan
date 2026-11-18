'use client';

import { useState } from 'react';
import { FiExternalLink, FiGlobe, FiLoader, FiSearch } from 'react-icons/fi';
import { toast } from 'sonner';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { attributeKey, type Research, type Suggestion } from '@/lib/item-web/core';
import type { ItemRecord } from './items-table-client';

type Choice = Suggestion & { selected: boolean };

export function ItemWebResearchDialog({ row, onClose, onSaved }: { row: ItemRecord; onClose: () => void; onSaved: () => void }) {
  const [query, setQuery] = useState([row.name, row.code1, row.code2].filter(Boolean).join(' ').slice(0, 500));
  const [result, setResult] = useState<Research | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [savedImages, setSavedImages] = useState<string[]>([]);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [busy, setBusy] = useState<'search' | 'save' | null>(null);
  const [error, setError] = useState('');
  const endpoint = `/api/admin/items/${row.mtrl}`;
  const selected = choices.filter((c) => c.selected);
  const count = selected.length + images.length;
  const update = (index: number, patch: Partial<Choice>) => setChoices((old) => old.map((c, i) => i === index ? { ...c, ...patch } : c));

  async function search() {
    if (busy) return;
    setBusy('search'); setError(''); setResult(null); setChoices([]); setImages([]); setFailedImages([]);
    try {
      const res = await fetch(`${endpoint}/web-research`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Η αναζήτηση απέτυχε.');
      setResult(data);
      setChoices(data.attributes.map((a: Suggestion) => ({ ...a, selected: false })));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  async function save() {
    if (busy || !result || !count) return;
    setBusy('save'); setError('');
    let saved = 0;
    try {
      if (selected.length) {
        const res = await fetch(`${endpoint}/web-research`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ existing: result.existing, selected: selected.map(({ name, value, unit }) => ({ name, value, unit })) }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Η αποθήκευση απέτυχε.');
        setResult((old) => old ? { ...old, existing: data.attributes } : old);
        setChoices((old) => old.map((c) => ({ ...c, selected: false })));
        saved += selected.length;
      }
      // Keep successful imports marked even if a later image fails; retry only the remainder.
      for (const url of images) {
        const source = result.images.find((i) => i.url === url)!;
        const res = await fetch(`${endpoint}/web-image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, sourceUrl: source.sourceUrl }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Η φωτογραφία δεν αποθηκεύτηκε.');
        setSavedImages((old) => [...old, url]);
        setImages((old) => old.filter((u) => u !== url));
        saved++;
      }
      toast.success('Αποθηκεύτηκαν οι επιλογές σου στην καρτέλα του είδους.');
    } catch (e) { setError(`${saved ? `Αποθηκεύτηκαν ${saved} επιλογές. ` : ''}${(e as Error).message}`); }
    finally { if (saved) onSaved(); setBusy(null); }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-4xl" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FiGlobe aria-hidden className="text-muted-foreground" /> Αναζήτηση στο web</DialogTitle>
          <DialogDescription>{row.code} · {row.name}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <form onSubmit={(e) => { e.preventDefault(); void search(); }} className="space-y-2">
            <label htmlFor={`web-query-${row.mtrl}`} className="text-sm font-medium">Ονομασία, κατασκευαστής ή μοντέλο</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id={`web-query-${row.mtrl}`} value={query} onChange={(e) => setQuery(e.target.value)} maxLength={500} disabled={!!busy} className="flex-1" />
              <Button type="submit" disabled={!!busy || query.trim().length < 3}>
                {busy === 'search' ? <FiLoader className="animate-spin" aria-hidden /> : <FiSearch aria-hidden />}
                {busy === 'search' ? 'Αναζήτηση…' : result ? 'Νέα αναζήτηση' : 'Αναζήτηση'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Π.χ. «Mapei Keraflex Maxi S1 λευκό 25 kg». Συγκεκριμένο μοντέλο και παραλλαγή βοηθούν να βρεθεί το σωστό προϊόν.</p>
          </form>
          {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
          {busy === 'search' && <p role="status" className="py-8 text-center text-sm text-muted-foreground">Αναζήτηση τεχνικών στοιχείων και φωτογραφιών στις πηγές του προϊόντος…</p>}
          {!result && !busy && <p className="border-t pt-4 text-sm text-muted-foreground">Δες τις πηγές, επίλεξε όσα χρειάζεσαι και διόρθωσε τις τιμές πριν την αποθήκευση. Τα χαρακτηριστικά και οι φωτογραφίες αποθηκεύονται στην εφαρμογή.</p>}
          {result && <>
            {result.note && <p className="border-l-2 border-primary/40 pl-3 text-sm">{result.note}</p>}
            <section className="space-y-3" aria-label="Προτεινόμενα χαρακτηριστικά">
              <div className="flex items-baseline justify-between gap-2"><h3 className="font-semibold">Χαρακτηριστικά <span className="text-muted-foreground">({choices.length})</span></h3><span className="text-xs text-muted-foreground">Επίλεξε για αποθήκευση</span></div>
              {!choices.length && <p className="text-sm text-muted-foreground">Δεν βρέθηκαν χαρακτηριστικά με τεκμηριωμένη πηγή. Πρόσθεσε κατασκευαστή ή ακριβές μοντέλο και δοκίμασε ξανά.</p>}
              <div className="divide-y border-y">
                {choices.map((choice, index) => {
                  const current = result.existing.find((a) => attributeKey(a.name) === attributeKey(choice.name));
                  const changes = current && (current.value !== choice.value || (current.unit || '') !== (choice.unit || ''));
                  return <div key={index} className="flex gap-3 py-3">
                    <Checkbox className="mt-2.5" checked={choice.selected} disabled={!!busy} onCheckedChange={(v) => update(index, { selected: v === true })} aria-label={`Επιλογή: ${choice.name}`} />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem]">
                        <Input aria-label={`Χαρακτηριστικό ${index + 1}`} value={choice.name} maxLength={80} disabled={!!busy} onChange={(e) => update(index, { name: e.target.value })} />
                        <Input aria-label={`Τιμή ${index + 1}`} value={choice.value} maxLength={300} disabled={!!busy} onChange={(e) => update(index, { value: e.target.value })} />
                        <Input aria-label={`Μονάδα ${index + 1}`} placeholder="Μονάδα" value={choice.unit || ''} maxLength={20} disabled={!!busy} onChange={(e) => update(index, { unit: e.target.value })} />
                      </div>
                      {current && <p className={`text-xs ${changes ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>{changes ? 'Θα αντικαταστήσει:' : 'Ήδη αποθηκευμένο:'} {current.value} {current.unit}</p>}
                      <p className="text-xs leading-relaxed text-muted-foreground">«{choice.evidence}»</p>
                      <a href={choice.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2">{new URL(choice.sourceUrl).hostname}<FiExternalLink aria-hidden /></a>
                    </div>
                  </div>;
                })}
              </div>
            </section>
            <section className="space-y-3" aria-label="Προτεινόμενες φωτογραφίες">
              <h3 className="font-semibold">Φωτογραφίες <span className="text-muted-foreground">({result.images.length})</span></h3>
              <p className="text-xs text-muted-foreground">Έλεγξε ότι απεικονίζουν το σωστό μοντέλο και χρώμα και ότι έχεις δικαίωμα χρήσης. Προστίθενται στις υπάρχουσες φωτογραφίες· η πρώτη γίνεται κύρια μόνο αν δεν υπάρχει ήδη κύρια.</p>
              {!result.images.length && <p className="text-sm text-muted-foreground">Δεν βρέθηκαν προσβάσιμες φωτογραφίες στις σελίδες που τεκμηριώνουν το προϊόν.</p>}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {result.images.map((img, i) => {
                  const imported = savedImages.includes(img.url);
                  const failed = failedImages.includes(img.url);
                  return <div key={img.url} className="space-y-2">
                    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border bg-white">
                      {failed ? <p className="p-4 text-center text-xs text-muted-foreground">Η πηγή δεν επιτρέπει προεπισκόπηση.</p> : <img src={`${endpoint}/web-image?url=${encodeURIComponent(img.url)}`} alt={img.title} className="h-full w-full object-contain" onError={() => { setFailedImages((old) => [...old, img.url]); setImages((old) => old.filter((u) => u !== img.url)); }} />}
                    </div>
                    <label className="flex items-center gap-2 text-sm"><Checkbox aria-label={`Επιλογή φωτογραφίας ${i + 1}`} checked={imported || images.includes(img.url)} disabled={!!busy || imported || failed} onCheckedChange={(v) => setImages((old) => v ? [...old, img.url] : old.filter((u) => u !== img.url))} />{imported ? 'Αποθηκεύτηκε' : `Φωτογραφία ${i + 1}`}</label>
                    <a href={img.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2">Πηγή φωτογραφίας <FiExternalLink aria-hidden /></a>
                  </div>;
                })}
              </div>
            </section>
            {!!result.sources.length && <details className="border-t pt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Όλες οι πηγές ({result.sources.length})</summary><ul className="mt-2 space-y-2">{result.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">{s.title}</a></li>)}</ul></details>}
          </>}
        </DialogBody>
        <DialogFooter className="flex-wrap items-center gap-2">
          <span className="mr-auto text-xs text-muted-foreground" aria-live="polite">{count ? `${selected.length} χαρακτηριστικά · ${images.length} φωτογραφίες` : 'Καμία επιλογή για αποθήκευση'}</span>
          <Button variant="outline" disabled={!!busy} onClick={onClose}>Κλείσιμο</Button>
          <Button disabled={!!busy || !count || selected.some((a) => !a.name.trim() || !a.value.trim())} onClick={() => void save()}>{busy === 'save' ? 'Αποθήκευση…' : `Αποθήκευση επιλογών${count ? ` (${count})` : ''}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
