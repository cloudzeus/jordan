'use client';

// Φόρμα (modal) δημιουργίας/επεξεργασίας τύπου κατασκευής, με σταδιακή αποκάλυψη: βασικά πεδία πάντα,
// «Προχωρημένα» πίσω από διακόπτη. Ο έλεγχος γίνεται με τον ίδιο wallTypeInput που ελέγχει και ο server.
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WALL_TYPE_CATEGORIES, WALL_TYPE_CATEGORY_LABEL, MEASURE_FACES, wallTypeInput, type WallTypeInput } from '@/lib/floorplan/wall-types';
import { metersToCmField, wallTypeFormToRaw } from '@/lib/floorplan/wall-type-form';
import { saveWallTypeAction } from './actions';

export type WallTypeRow = WallTypeInput & { id: string };

const MEASURE_LABEL: Record<(typeof MEASURE_FACES)[number], string> = { none: 'Καμία όψη', one: 'Μία όψη', both: 'Δύο όψεις' };

export function WallTypeEditor({ open, onOpenChange, initial, existingHotkeys }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: WallTypeRow | null;
  /** Hotkeys ήδη σε χρήση από άλλους τύπους — για προειδοποίηση (όχι εμπόδιο). */
  existingHotkeys: string[];
}) {
  const router = useRouter();
  // Ο γονιός προσαρτά τον editor με key ανά άνοιγμα, οπότε τα αρχικά διαβάζονται μία φορά — χωρίς effect.
  const [code, setCode] = React.useState(() => initial?.code ?? '');
  const [name, setName] = React.useState(() => initial?.name ?? '');
  const [category, setCategory] = React.useState<(typeof WALL_TYPE_CATEGORIES)[number]>(() => initial?.category ?? 'DRYWALL');
  const [thicknessCm, setThicknessCm] = React.useState(() => (initial ? metersToCmField(initial.thicknessM) : '10'));
  const [bottomM, setBottomM] = React.useState(() => String(initial?.bottomM ?? 0));
  const [topM, setTopM] = React.useState(() => (initial?.topM != null ? String(initial.topM) : ''));
  const [color, setColor] = React.useState(() => initial?.color ?? '#94a3b8');
  const [measureFaces, setMeasureFaces] = React.useState<(typeof MEASURE_FACES)[number]>(() => initial?.measureFaces ?? 'both');
  const [hotkey, setHotkey] = React.useState(() => initial?.hotkey ?? '');
  const [sortOrder, setSortOrder] = React.useState(() => String(initial?.sortOrder ?? 0));
  const [cadHints, setCadHints] = React.useState(() => (initial?.cadLayerHints ?? []).join(', '));
  const [active, setActive] = React.useState(() => initial?.active ?? true);
  const [advanced, setAdvanced] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hotkeyClash = hotkey.trim() !== '' && existingHotkeys.includes(hotkey.trim()) && hotkey.trim() !== (initial?.hotkey ?? '');

  const submit = async () => {
    setError(null);
    const raw = wallTypeFormToRaw({ code, name, category, thicknessCm, bottomM, topM, color, measureFaces, hotkey, sortOrder, cadHints, active }, initial);
    const parsed = wallTypeInput.safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία');
      if (!advanced) setAdvanced(true);
      return;
    }
    setBusy(true);
    const res = await saveWallTypeAction(initial?.id ?? null, parsed.data);
    setBusy(false);
    if (res.ok) {
      toast.success(initial ? `Ο τύπος «${name}» ενημερώθηκε` : `Προστέθηκε ο τύπος «${name}»`);
      onOpenChange(false);
      router.refresh();
    } else {
      setError(res.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? 'Επεξεργασία τύπου' : 'Νέος τύπος κατασκευής'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="wt-code">Κωδικός</Label>
              <Input id="wt-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="GB10" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wt-thick">Πάχος (cm)</Label>
              <Input id="wt-thick" inputMode="decimal" value={thicknessCm} onChange={(e) => setThicknessCm(e.target.value)} placeholder="10" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="wt-name">Όνομα</Label>
            <Input id="wt-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Γυψοσανίδα μονή 10 cm" />
          </div>
          <div className="space-y-1">
            <Label>Κατηγορία</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {WALL_TYPE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{WALL_TYPE_CATEGORY_LABEL[c]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <button type="button" onClick={() => setAdvanced((a) => !a)} className="text-(length:--fs-12) font-medium text-primary hover:underline">
            {advanced ? '− Λιγότερα' : '+ Προχωρημένα'}
          </button>

          {advanced && (
            <div className="space-y-3 rounded-md border border-border/60 p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="wt-bottom">Βάση (m)</Label>
                  <Input id="wt-bottom" inputMode="decimal" value={bottomM} onChange={(e) => setBottomM(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="wt-top">Κορυφή (m) — κενό = ως ταβάνι</Label>
                  <Input id="wt-top" inputMode="decimal" value={topM} onChange={(e) => setTopM(e.target.value)} placeholder="ως ταβάνι" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="wt-color">Χρώμα</Label>
                  <Input id="wt-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 p-1" />
                </div>
                <div className="space-y-1">
                  <Label>Όψεις που μετρούν</Label>
                  <Select value={measureFaces} onValueChange={(v) => setMeasureFaces(v as typeof measureFaces)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MEASURE_FACES.map((m) => <SelectItem key={m} value={m}>{MEASURE_LABEL[m]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="wt-hotkey">Συντόμευση (1–9)</Label>
                  <Input id="wt-hotkey" maxLength={1} value={hotkey} onChange={(e) => setHotkey(e.target.value)} />
                  {hotkeyClash && <p className="text-(length:--fs-11) text-amber-600">Η συντόμευση {hotkey} χρησιμοποιείται ήδη.</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="wt-sort">Σειρά</Label>
                  <Input id="wt-sort" inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="wt-cad">Λέξεις layer CAD (χωρισμένες με κόμμα)</Label>
                <Input id="wt-cad" value={cadHints} onChange={(e) => setCadHints(e.target.value)} placeholder="τοιχοποιια, wall, brick" />
              </div>
              <label className="flex items-center gap-2 text-(length:--fs-13)">
                <Switch checked={active} onCheckedChange={setActive} /> Ενεργός
              </label>
            </div>
          )}

          {error && <p className="text-(length:--fs-12) text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
