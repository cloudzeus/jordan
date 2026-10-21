'use client';

import * as React from 'react';
import type { Map as LMap, LayerGroup } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FiMapPin, FiRefreshCw } from 'react-icons/fi';
import { cn } from '@/lib/utils';

type Point = { trdr: number; sodtype: number; lat: number; lng: number; code: string | null; name: string; address: string | null; phone: string | null; email: string | null; afm: string | null };

const TYPES: Array<{ sodtype: number; label: string; color: string }> = [
  { sodtype: 13, label: 'Πελάτες', color: '#0078D4' },
  { sodtype: 12, label: 'Προμηθευτές', color: '#047857' },
  { sodtype: 15, label: 'Χρεώστες', color: '#6D28D9' },
  { sodtype: 16, label: 'Πιστωτές', color: '#C2410C' },
  { sodtype: 14, label: 'Χρηματικοί λογαριασμοί', color: '#0F766E' },
];
const colorOf = (s: number) => TYPES.find((t) => t.sodtype === s)?.color ?? '#5C5C5C';
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Χάρτης συναλλασσομένων (Leaflet + πλακίδια MapTiler μέσω /api/admin/map/tiles — κλειδί μόνο στον server).
 * Σημεία μόνο όσων έχουν θέση στο SoftOne· χρώμα ανά τύπο, φίλτρα, popup με στοιχεία επικοινωνίας.
 */
export function TradersMap() {
  const el = React.useRef<HTMLDivElement>(null);
  const map = React.useRef<LMap | null>(null);
  const layer = React.useRef<LayerGroup | null>(null);
  const [data, setData] = React.useState<{ points: Point[]; total: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [off, setOff] = React.useState<Set<number>>(new Set());
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    const r = await fetch('/api/admin/traders/map', { cache: 'no-store' }).catch(() => null);
    const d = r ? await r.json().catch(() => null) : null;
    setLoading(false);
    if (!r?.ok || !d?.points) { setError(d?.message ?? 'Το SoftOne δεν απάντησε.'); return; }
    setData(d);
  }, []);
  // Το load ξεκινά σε microtask: τα setState του γίνονται σε callback, όχι σύγχρονα στο σώμα του effect.
  React.useEffect(() => { void Promise.resolve().then(load); }, [load]);

  // Δημιουργία χάρτη (μία φορά).
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const L = (await import('leaflet')).default;
      if (!alive || !el.current || map.current) return;
      const m = L.map(el.current, { center: [38.3, 23.8], zoom: 6, scrollWheelZoom: true, zoomControl: true });
      // Πλακίδια MapTiler μέσω δικού μας route (το κλειδί μένει στον server).
      L.tileLayer('/api/admin/map/tiles/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
      }).addTo(m);
      layer.current = L.layerGroup().addTo(m);
      map.current = m;
      setTimeout(() => m.invalidateSize(), 50);
    })();
    return () => { alive = false; map.current?.remove(); map.current = null; };
  }, []);

  // Σημεία.
  React.useEffect(() => {
    (async () => {
      if (!data || !layer.current || !map.current) return;
      const L = (await import('leaflet')).default;
      layer.current.clearLayers();
      const shown = data.points.filter((p) => !off.has(p.sodtype));
      for (const p of shown) {
        const c = colorOf(p.sodtype);
        L.circleMarker([p.lat, p.lng], { radius: 7, color: '#fff', weight: 2, fillColor: c, fillOpacity: 0.9 })
          .bindPopup(`<div style="font:13px/1.45 system-ui,sans-serif;min-width:200px"><div style="font-weight:600">${esc(p.name)}</div>${p.code ? `<div style="color:#6b7280">${esc(p.code)}${p.afm ? ` · ΑΦΜ ${esc(p.afm)}` : ''}</div>` : ''}${p.address ? `<div style="margin-top:6px">${esc(p.address)}</div>` : ''}${p.phone ? `<div><a href="tel:${esc(p.phone.replace(/\s/g, ''))}">${esc(p.phone)}</a></div>` : ''}${p.email ? `<div><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></div>` : ''}<div style="margin-top:6px"><a href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noopener">Οδηγίες ↗</a></div></div>`)
          .addTo(layer.current);
      }
      if (shown.length) map.current.fitBounds(L.latLngBounds(shown.map((p) => [p.lat, p.lng] as [number, number])).pad(0.15), { maxZoom: 13 });
    })();
  }, [data, off]);

  const counts = React.useMemo(() => {
    const m = new Map<number, number>();
    for (const p of data?.points ?? []) m.set(p.sodtype, (m.get(p.sodtype) ?? 0) + 1);
    return m;
  }, [data]);
  const toggle = (s: number) => setOff((o) => { const n = new Set(o); if (n.has(s)) n.delete(s); else n.add(s); return n; });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {TYPES.filter((t) => counts.get(t.sodtype)).map((t) => (
          <button key={t.sodtype} type="button" onClick={() => toggle(t.sodtype)} aria-pressed={!off.has(t.sodtype)}
            className={cn('inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-(length:--fs-11) font-medium transition', off.has(t.sodtype) ? 'border-border bg-background text-muted-foreground opacity-60' : 'border-border bg-background text-foreground')}>
            <span className="size-2.5 rounded-full" style={{ background: t.color }} aria-hidden />{t.label}<span className="tabular-nums text-muted-foreground">{counts.get(t.sodtype)}</span>
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2 text-(length:--fs-12) text-muted-foreground">
          <FiMapPin className="size-3.5" aria-hidden />{data ? `${data.points.length.toLocaleString('el-GR')} με θέση από ${data.total.toLocaleString('el-GR')} ενεργούς` : 'Φόρτωση…'}
          <button type="button" onClick={load} disabled={loading} className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md hover:bg-muted" aria-label="Ανανέωση"><FiRefreshCw className={cn('size-3.5', loading && 'animate-spin')} aria-hidden /></button>
        </span>
      </div>
      {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-(length:--fs-12) text-destructive">{error}</p>}
      <div ref={el} className="h-[calc(100dvh-16rem)] min-h-[420px] w-full overflow-hidden rounded-lg border border-border" role="region" aria-label="Χάρτης συναλλασσομένων" />
    </div>
  );
}
