'use client';

import * as React from 'react';
import type { Map as LMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Χάρτης ΕΝΟΣ σημείου (θέση συναλλασσομένου) — Leaflet με τα ίδια πλακίδια MapTiler του χάρτη
 * συναλλασσομένων (/api/admin/map/tiles, κλειδί μόνο στον server). Πιάνει ΟΛΟ το πλάτος του γονέα και
 * ξανασχεδιάζεται σε κάθε αλλαγή μεγέθους (ResizeObserver → invalidateSize), π.χ. όταν ανοίγει η γραμμή.
 */
export function TraderPointMap({ lat, lng, label, className }: { lat: number; lng: number; label: string; className?: string }) {
  const el = React.useRef<HTMLDivElement>(null);
  const map = React.useRef<LMap | null>(null);

  React.useEffect(() => {
    let alive = true;
    let ro: ResizeObserver | null = null;
    (async () => {
      const L = (await import('leaflet')).default;
      if (!alive || !el.current) return;
      const m = L.map(el.current, { center: [lat, lng], zoom: 16, scrollWheelZoom: false, zoomControl: true });
      L.tileLayer('/api/admin/map/tiles/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
      }).addTo(m);
      L.circleMarker([lat, lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#0F766E', fillOpacity: 0.95 }).bindTooltip(label).addTo(m);
      map.current = m;
      ro = new ResizeObserver(() => { m.invalidateSize(); m.setView([lat, lng], m.getZoom(), { animate: false }); });
      ro.observe(el.current);
    })();
    return () => { alive = false; ro?.disconnect(); map.current?.remove(); map.current = null; };
  }, [lat, lng, label]);

  return <div ref={el} className={className ?? 'h-full w-full'} role="region" aria-label={`Χάρτης: ${label}`} />;
}
