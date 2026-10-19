'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { Map as LMap, Marker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { toast } from 'sonner';
import { FiSearch, FiLoader, FiMapPin, FiAlertTriangle, FiCheckCircle, FiTrash2, FiMove } from 'react-icons/fi';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCoords } from '@/lib/coords';
import { PRECISION_LABEL, siteLine, type SiteCandidate, type SitePrecision } from '@/lib/project-site-core';

export type ProjectSiteValue = Site;
type Site = {
  address: string | null; zip: string | null; district: string | null; city: string | null; formatted: string | null;
  lat: number; lng: number; source: 'geocode' | 'marker' | 'manual'; precision: SitePrecision | null;
};

const PIN_HTML = `<svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true"><path d="M15 1C7.3 1 1 7.2 1 14.9 1 25.4 15 39 15 39s14-13.6 14-24.1C29 7.2 22.7 1 15 1Z" fill="#7C3AED" stroke="#fff" stroke-width="2"/><circle cx="15" cy="15" r="5" fill="#fff"/></svg>`;
const GREECE: [number, number] = [38.3, 23.8];

/**
 * Τοποθεσία έργου: διεύθυνση → συντεταγμένες (geocoder). Αν το αποτέλεσμα δεν είναι ακριβές, ο χρήστης
 * μετακινεί την πινέζα (σύρσιμο ή κλικ στον χάρτη) και η διεύθυνση ξαναβγαίνει από το σημείο (reverse).
 */
export function ProjectSiteDialog({ prjc, projectLabel, open, onOpenChange, value, onSave }: {
  prjc?: number | null; projectLabel: string; open: boolean; onOpenChange: (o: boolean) => void;
  /** Ελεγχόμενη χρήση (π.χ. σύμβαση χωρίς PRJC): αρχική θέση + callback αντί για αποθήκευση στο έργο. */
  value?: Site | null; onSave?: (site: Site | null) => void;
}) {
  const router = useRouter();
  const [loaded, setLoaded] = React.useState(false);
  const [existing, setExisting] = React.useState(false);
  const [site, setSite] = React.useState<Site | null>(null);
  const [q, setQ] = React.useState('');
  const [candidates, setCandidates] = React.useState<SiteCandidate[] | null>(null);
  const [busy, setBusy] = React.useState<null | 'search' | 'reverse' | 'save' | 'delete'>(null);
  const [error, setError] = React.useState<string | null>(null);

  const mapEl = React.useRef<HTMLDivElement | null>(null);
  const map = React.useRef<LMap | null>(null);
  const marker = React.useRef<Marker | null>(null);
  const siteRef = React.useRef<Site | null>(null);
  siteRef.current = site;

  // Φόρτωση της αποθηκευμένης θέσης.
  React.useEffect(() => {
    if (!open) return;
    setLoaded(false); setCandidates(null); setError(null);
    if (onSave) {
      const s = value ?? null;
      setExisting(!!s); setSite(s); setQ(s ? siteLine(s) : ''); setLoaded(true);
      return;
    }
    void (async () => {
      const r = await fetch(`/api/admin/projects/${prjc}/site`, { cache: 'no-store' }).catch(() => null);
      const d = r?.ok ? await r.json().catch(() => null) : null;
      const s = d?.site ?? null;
      setExisting(!!s);
      setSite(s ? { ...s, source: s.source ?? 'geocode' } : null);
      setQ(s ? siteLine(s) : '');
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prjc]);

  const reverse = React.useCallback(async (lat: number, lng: number) => {
    setBusy('reverse'); setError(null);
    try {
      const r = await fetch('/api/admin/projects/site/reverse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat, lng }) });
      const d = await r.json().catch(() => ({}));
      const c: SiteCandidate | null = r.ok ? d.candidate : null;
      // Η θέση είναι ΠΑΝΤΑ αυτή της πινέζας· η διεύθυνση η πλησιέστερη που βρέθηκε (ή μένει η προηγούμενη).
      setSite((prev) => ({
        address: c?.address ?? prev?.address ?? null, zip: c?.zip ?? prev?.zip ?? null, district: c?.district ?? prev?.district ?? null,
        city: c?.city ?? prev?.city ?? null, formatted: c?.formatted ?? prev?.formatted ?? null,
        lat, lng, source: 'marker', precision: prev?.precision ?? null,
      }));
      if (!r.ok) setError(d.message ?? 'Η διεύθυνση του σημείου δεν βρέθηκε — η θέση κρατήθηκε.');
    } finally {
      setBusy(null);
    }
  }, []);

  // Χάρτης + πινέζα (μία φορά ανά άνοιγμα).
  React.useEffect(() => {
    if (!open || !loaded) return;
    let alive = true;
    let ro: ResizeObserver | null = null;
    void (async () => {
      const L = (await import('leaflet')).default;
      if (!alive || !mapEl.current || map.current) return;
      const s = siteRef.current;
      const m = L.map(mapEl.current, { center: s ? [s.lat, s.lng] : GREECE, zoom: s ? 17 : 6, scrollWheelZoom: true });
      L.tileLayer('/api/admin/map/tiles/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
      }).addTo(m);
      const icon = L.divIcon({ html: PIN_HTML, className: '', iconSize: [30, 40], iconAnchor: [15, 39] });
      const mk = L.marker(s ? [s.lat, s.lng] : GREECE, { draggable: true, icon, keyboard: true, title: 'Σύρε για ακριβή θέση', opacity: s ? 1 : 0 }).addTo(m);
      mk.on('dragend', () => { const p = mk.getLatLng(); void reverse(p.lat, p.lng); });
      m.on('click', (e: { latlng: { lat: number; lng: number } }) => { mk.setLatLng(e.latlng).setOpacity(1); void reverse(e.latlng.lat, e.latlng.lng); });
      map.current = m; marker.current = mk;
      ro = new ResizeObserver(() => m.invalidateSize());
      ro.observe(mapEl.current);
    })();
    return () => { alive = false; ro?.disconnect(); map.current?.remove(); map.current = null; marker.current = null; };
  }, [open, loaded, reverse]);

  const place = (c: SiteCandidate) => {
    setSite({ address: c.address, zip: c.zip, district: c.district, city: c.city, formatted: c.formatted, lat: c.lat, lng: c.lng, source: 'geocode', precision: c.precision });
    marker.current?.setLatLng([c.lat, c.lng]).setOpacity(1);
    map.current?.setView([c.lat, c.lng], c.precision === 'exact' ? 18 : c.precision === 'street' ? 17 : 14);
  };

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (q.trim().length < 3) { setError('Γράψε τη διεύθυνση (οδός, αριθμός, πόλη).'); return; }
    setBusy('search'); setError(null); setCandidates(null);
    try {
      const r = await fetch('/api/admin/projects/site/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.message ?? 'Η αναζήτηση απέτυχε.'); return; }
      const list: SiteCandidate[] = d.candidates ?? [];
      if (!list.length) { setError('Δεν βρέθηκε — δοκίμασε άλλη γραφή, ή κάνε κλικ στον χάρτη στο σημείο του έργου.'); return; }
      setCandidates(list);
      place(list[0]);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!site) return;
    if (onSave) { onSave(site); onOpenChange(false); return; }
    setBusy('save'); setError(null);
    try {
      const r = await fetch(`/api/admin/projects/${prjc}/site`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(site) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.message ?? 'Η αποθήκευση απέτυχε.'); return; }
      toast.success('Η τοποθεσία του έργου αποθηκεύτηκε');
      onOpenChange(false);
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!window.confirm('Να αφαιρεθεί η τοποθεσία του έργου;')) return;
    if (onSave) { onSave(null); onOpenChange(false); return; }
    setBusy('delete');
    const r = await fetch(`/api/admin/projects/${prjc}/site`, { method: 'DELETE' }).catch(() => null);
    setBusy(null);
    if (!r?.ok) { toast.error('Δεν αφαιρέθηκε'); return; }
    toast.success('Η τοποθεσία αφαιρέθηκε');
    onOpenChange(false);
    router.refresh();
  };

  const setField = (k: 'address' | 'zip' | 'district' | 'city', v: string) => setSite((s) => (s ? { ...s, [k]: v } : s));
  const field = 'h-9 text-[length:var(--fs-13)]';
  const warn = site && site.source === 'geocode' && site.precision && site.precision !== 'exact';

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex max-h-[94dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="px-5 pt-4 pb-3">
          <DialogTitle className="text-[length:var(--fs-16)]">Τοποθεσία έργου</DialogTitle>
          <DialogDescription className="text-[length:var(--fs-12)]">
            <span className="font-medium text-foreground">{projectLabel}</span> · γράψε τη διεύθυνση του εργοταξίου· αν η πινέζα δεν είναι στο σωστό σημείο, σύρε την ή κάνε κλικ στον χάρτη.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <form onSubmit={search} className="flex gap-2" role="search">
            <div className="min-w-0 flex-1">
              <Label htmlFor="site-q" className="sr-only">Διεύθυνση έργου</Label>
              <Input id="site-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="π.χ. Πεστών 13, Αθήνα" autoComplete="off" className={field} disabled={!loaded} />
            </div>
            <Button type="submit" variant="secondary" disabled={!loaded || busy != null} className="shrink-0">
              {busy === 'search' ? <FiLoader className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <FiSearch className="mr-1.5 size-3.5" aria-hidden />}
              Εύρεση
            </Button>
          </form>

          {candidates && candidates.length > 1 && (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border" aria-label="Αποτελέσματα αναζήτησης">
              {candidates.map((c, i) => (
                <li key={`${c.lat},${c.lng},${i}`}>
                  <button type="button" onClick={() => place(c)}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-left text-[length:var(--fs-12)] hover:bg-muted/50">
                    <span className="min-w-0 truncate">{c.formatted}</span>
                    <span className="shrink-0 text-[length:var(--fs-11)] text-muted-foreground">{c.precision === 'exact' ? 'ακριβής' : c.precision === 'street' ? 'οδός' : 'περιοχή'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="relative overflow-hidden rounded-lg border border-border bg-muted">
            <div ref={mapEl} className="h-[280px] w-full sm:h-[360px]" role="region" aria-label="Χάρτης τοποθεσίας έργου" />
            {busy === 'reverse' && (
              <span className="absolute right-2 top-2 z-[500] inline-flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-[length:var(--fs-11)] shadow">
                <FiLoader className="size-3 animate-spin motion-reduce:animate-none" aria-hidden /> Εύρεση διεύθυνσης…
              </span>
            )}
          </div>

          {site ? (
            <>
              <p className={`flex items-start gap-1.5 text-[length:var(--fs-12)] ${warn ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground'}`}>
                {warn ? <FiAlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  : site.source === 'marker' ? <FiMove className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    : <FiCheckCircle className="mt-0.5 size-3.5 shrink-0" style={{ color: '#047857' }} aria-hidden />}
                <span>
                  {site.source === 'marker' ? 'Θέση από την πινέζα (η διεύθυνση είναι η πλησιέστερη)' : site.precision ? PRECISION_LABEL[site.precision] : 'Αποθηκευμένη θέση'}
                  {' · '}<span className="font-mono tabular-nums">{formatCoords(site)}</span>
                </span>
              </p>
              <div className="grid gap-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
                {([['address', 'Οδός & αριθμός'], ['zip', 'Τ.Κ.'], ['district', 'Περιοχή'], ['city', 'Πόλη']] as const).map(([k, label]) => (
                  <div key={k}>
                    <Label htmlFor={`site-${k}`} className="mb-1 block text-[length:var(--fs-12)]">{label}</Label>
                    <Input id={`site-${k}`} value={site[k] ?? ''} onChange={(e) => setField(k, e.target.value)} className={field} />
                  </div>
                ))}
              </div>
            </>
          ) : loaded && (
            <p className="flex items-center gap-1.5 text-[length:var(--fs-12)] text-muted-foreground">
              <FiMapPin className="size-3.5" aria-hidden /> Δεν έχει οριστεί τοποθεσία. Γράψε διεύθυνση ή κάνε κλικ στον χάρτη.
            </p>
          )}

          {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[length:var(--fs-12)] text-destructive">{error}</p>}
        </DialogBody>

        <DialogFooter className="m-0 flex-row items-center border-t border-border px-5 py-3">
          {existing && (
            <Button type="button" variant="ghost" onClick={() => void remove()} disabled={busy != null} className="mr-auto text-destructive hover:text-destructive">
              <FiTrash2 className="mr-1.5 size-3.5" aria-hidden /> Αφαίρεση
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy === 'save'}>Άκυρο</Button>
          <Button type="button" onClick={() => void save()} disabled={!site || busy != null}>
            {busy === 'save' && <FiLoader className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
            Αποθήκευση θέσης
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
