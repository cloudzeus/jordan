'use client';

// Ηλεκτρολογικά & δίκτυο στην κάτοψη: μενού εργαλείων (ένα εικονίδιο → επιλογές) και πάνελ στοιχείων
// (μάρκα, μοντέλο, IP, MAC, σειριακός, φωτογραφίες, εμβέλεια), καλωδιώσεις και σύνοψη με ελλείψεις.
import * as React from 'react';
import { Cable, Cctv, EthernetPort, Lightbulb, Network, Plug, Server, ToggleLeft, Wifi, Zap } from 'lucide-react';
import { FiAlertTriangle, FiCamera, FiLoader, FiTrash2 } from 'react-icons/fi';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  CABLE_META, DEVICE_KINDS, DEVICE_META, networkSummary, polyLength,
  type CableKind, type DeviceKind, type PlanCable, type PlanDevice,
} from '@/lib/floorplan/network';

export const DEVICE_ICON: Record<DeviceKind, React.ReactNode> = {
  socket: <Plug />, light: <Lightbulb />, switch: <ToggleLeft />, panel: <Zap />,
  data: <EthernetPort />, camera: <Cctv />, ap: <Wifi />, rack: <Server />,
};

export type NetPick = { tool: 'device'; kind: DeviceKind } | { tool: 'cable'; kind: CableKind };

/** Ένα κουμπί στην εργαλειοθήκη· με κλικ ανοίγει τις επιλογές (ηλεκτρολογικά / δίκτυο). */
export function NetworkMenu({ active, onPick }: { active: NetPick | null; onPick: (p: NetPick) => void }) {
  const [open, setOpen] = React.useState(false);
  const color = active ? (active.tool === 'device' ? DEVICE_META[active.kind].color : CABLE_META[active.kind].color) : null;
  const item = (key: string, on: boolean, icon: React.ReactNode, c: string, label: string, help: string, pick: NetPick) => (
    <li key={key}>
      <button type="button" onClick={() => { onPick(pick); setOpen(false); }} aria-pressed={on}
        className={cn('flex w-full cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-muted', on && 'bg-muted')}>
        <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border [&_svg]:size-3.5" style={{ borderColor: c, color: '#0B1220', background: c }}>{icon}</span>
        <span className="min-w-0">
          <span className="block text-(length:--fs-12) font-semibold">{label}</span>
          <span className="block text-(length:--fs-11) leading-snug text-muted-foreground">{help}</span>
        </span>
      </button>
    </li>
  );
  const section = (title: string, group: 'electrical' | 'network', cable: CableKind) => (
    <div>
      <p className="mb-1 px-2 text-(length:--fs-10) font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <ul className="space-y-0.5">
        {DEVICE_KINDS.filter((k) => DEVICE_META[k].group === group).map((k) => item(k, active?.tool === 'device' && active.kind === k, DEVICE_ICON[k], DEVICE_META[k].color, DEVICE_META[k].label, DEVICE_META[k].help, { tool: 'device', kind: k }))}
        {item(`c-${cable}`, active?.tool === 'cable' && active.kind === cable, <Cable />, CABLE_META[cable].color, CABLE_META[cable].label, CABLE_META[cable].help, { tool: 'cable', kind: cable })}
      </ul>
    </div>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Ηλεκτρολογικά & δίκτυο (L)" aria-pressed={!!active} title="Ηλεκτρολογικά & δίκτυο (L)"
          className="relative inline-flex size-9 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-slate-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 [&_svg]:size-4"
          style={active ? { background: '#22D3EE', color: '#0B1220' } : { color: '#CBD5E1' }}>
          <Network />
          {color && <span aria-hidden className="absolute bottom-1 right-1 size-2 rounded-full ring-1 ring-slate-900" style={{ background: color }} />}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={10} className="w-80 space-y-3 p-2">
        {section('Ηλεκτρολογικά', 'electrical', 'power')}
        {section('Δίκτυο', 'network', 'network')}
      </PopoverContent>
    </Popover>
  );
}

const field = 'h-7 w-full rounded-md border border-input bg-background px-2 text-(length:--fs-12) outline-hidden focus-visible:ring-2 focus-visible:ring-ring';

function Field({ id, label, value, onChange, type = 'text', placeholder, className }: { id: string; label: string; value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string; className?: string }) {
  return (
    <label htmlFor={id} className={cn('block', className)}>
      <span className="text-(length:--fs-10) font-medium text-muted-foreground">{label}</span>
      <input id={id} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={field} inputMode={type === 'number' ? 'decimal' : undefined} />
    </label>
  );
}

/** Πάνελ στην πλαϊνή στήλη: στοιχεία της επιλεγμένης συσκευής, λίστες, καλώδια, σύνοψη. */
export function NetworkPanel({ devices, cables, setDevices, setCables, selected, setSelected, mPerPx, fmtLen, uploadPhoto, uploading }: {
  devices: PlanDevice[]; cables: PlanCable[];
  setDevices: React.Dispatch<React.SetStateAction<PlanDevice[]>>; setCables: React.Dispatch<React.SetStateAction<PlanCable[]>>;
  selected: string | null; setSelected: (id: string | null) => void; mPerPx: number | null; fmtLen: (px: number) => string;
  uploadPhoto: (f: File) => Promise<string | null>; uploading: boolean;
}) {
  const sum = React.useMemo(() => networkSummary(devices, cables, mPerPx), [devices, cables, mPerPx]);
  const sel = devices.find((d) => d.id === selected) ?? null;
  const up = (id: string, patch: Partial<PlanDevice>) => setDevices((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const num = (v: string) => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const remove = (id: string) => { setDevices((ds) => ds.filter((d) => d.id !== id)); setCables((cs) => cs.map((c) => ({ ...c, from: c.from === id ? null : c.from, to: c.to === id ? null : c.to }))); if (selected === id) setSelected(null); };
  if (!devices.length && !cables.length) return null;
  const name = (id: string | null) => (id ? devices.find((d) => d.id === id)?.label || '—' : '—');
  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-2">
      <p className="text-(length:--fs-11) font-semibold uppercase tracking-wider text-muted-foreground">Ηλεκτρολογικά & δίκτυο</p>

      {/* Σύνοψη */}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-(length:--fs-12)">
        {DEVICE_KINDS.filter((k) => sum.counts[k]).map((k) => (
          <div key={k} className="flex items-center justify-between gap-2"><dt className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="inline-flex size-4 items-center justify-center rounded-full [&_svg]:size-2.5" style={{ background: DEVICE_META[k].color, color: '#0B1220' }}>{DEVICE_ICON[k]}</span>{DEVICE_META[k].short}</dt><dd className="font-mono tabular-nums">{sum.counts[k]}</dd></div>
        ))}
        {sum.powerM != null && sum.powerM > 0 && <div className="col-span-2 flex justify-between"><dt className="text-muted-foreground">Καλώδιο ρεύματος (+10%)</dt><dd className="font-mono tabular-nums">{sum.powerM.toLocaleString('el-GR')} m</dd></div>}
        {sum.networkM != null && sum.networkM > 0 && <div className="col-span-2 flex justify-between"><dt className="text-muted-foreground">Καλώδιο δικτύου (+10%)</dt><dd className="font-mono tabular-nums">{sum.networkM.toLocaleString('el-GR')} m</dd></div>}
        {sum.racks.map((r) => <div key={r.id} className="col-span-2 flex justify-between"><dt className="text-muted-foreground">{r.label}: θύρες</dt><dd className="font-mono tabular-nums">{r.used}/{r.ports}</dd></div>)}
        {sum.panels.map((p) => <div key={p.id} className="col-span-2 flex justify-between"><dt className="text-muted-foreground">{p.label}: κυκλώματα</dt><dd className="font-mono tabular-nums">{p.circuits}/{p.ports}</dd></div>)}
      </dl>
      {!mPerPx && cables.length > 0 && <p className="text-(length:--fs-11) text-muted-foreground">Όρισε κλίμακα για μέτρα καλωδίων.</p>}
      {sum.warnings.length > 0 && (
        <ul className="space-y-0.5 rounded-md bg-amber-50 p-1.5 text-(length:--fs-11) text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {sum.warnings.slice(0, 6).map((w, i) => <li key={i} className="flex gap-1.5"><FiAlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />{w}</li>)}
          {sum.warnings.length > 6 && <li className="pl-4">και {sum.warnings.length - 6} ακόμη</li>}
        </ul>
      )}

      {/* Συσκευές */}
      <ul className="space-y-0.5">
        {devices.map((d) => {
          const m = DEVICE_META[d.kind];
          const open = d.id === selected;
          return (
            <li key={d.id} className={cn('rounded-md', open && 'bg-muted/60')}>
              <div className="flex items-center gap-2 p-1">
                <button type="button" onClick={() => setSelected(open ? null : d.id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
                  <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border [&_svg]:size-3" style={{ borderColor: m.color, color: '#0B1220', background: m.color }}>{DEVICE_ICON[d.kind]}</span>
                  <span className="min-w-0 flex-1 truncate text-(length:--fs-12)">{d.label || m.short}{d.brand || d.model ? <span className="text-muted-foreground"> · {[d.brand, d.model].filter(Boolean).join(' ')}</span> : null}</span>
                  {d.photoFileIds.length > 0 && <span className="inline-flex items-center gap-0.5 text-(length:--fs-11) text-muted-foreground"><FiCamera className="size-3" aria-hidden />{d.photoFileIds.length}</span>}
                </button>
                <button type="button" aria-label={`Διαγραφή: ${d.label}`} onClick={() => remove(d.id)} className="inline-flex size-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><FiTrash2 className="size-3.5" aria-hidden /></button>
              </div>
              {open && sel && (
                <div className="grid grid-cols-2 gap-1.5 px-1 pb-2">
                  <Field id={`nd-label-${d.id}`} label="Όνομα" value={d.label} onChange={(v) => up(d.id, { label: v })} className="col-span-2" />
                  <Field id={`nd-brand-${d.id}`} label="Μάρκα" value={d.brand} onChange={(v) => up(d.id, { brand: v })} placeholder={d.kind === 'camera' ? 'π.χ. Hikvision' : d.kind === 'ap' ? 'π.χ. Ubiquiti' : d.kind === 'socket' || d.kind === 'switch' ? 'π.χ. Legrand' : ''} />
                  <Field id={`nd-model-${d.id}`} label="Μοντέλο" value={d.model} onChange={(v) => up(d.id, { model: v })} />
                  {m.group === 'network' && <Field id={`nd-ip-${d.id}`} label="IP" value={d.ip} onChange={(v) => up(d.id, { ip: v })} placeholder="192.168.1.20" />}
                  {m.group === 'network' && <Field id={`nd-mac-${d.id}`} label="MAC" value={d.mac} onChange={(v) => up(d.id, { mac: v })} placeholder="AA:BB:CC:DD:EE:FF" />}
                  <Field id={`nd-sn-${d.id}`} label="Σειριακός" value={d.serial} onChange={(v) => up(d.id, { serial: v })} className={m.group === 'network' ? 'col-span-2' : undefined} />
                  {(d.kind === 'rack' || d.kind === 'panel') && <Field id={`nd-ports-${d.id}`} label={d.kind === 'rack' ? 'Θύρες patch panel' : 'Θέσεις ασφαλειών'} type="number" value={d.ports} onChange={(v) => up(d.id, { ports: Math.max(0, Math.round(num(v))) })} />}
                  {(d.kind === 'camera' || d.kind === 'ap') && <Field id={`nd-range-${d.id}`} label="Εμβέλεια (m)" type="number" value={d.rangeM} onChange={(v) => up(d.id, { rangeM: Math.max(0, num(v)) })} />}
                  {d.kind === 'camera' && <Field id={`nd-fov-${d.id}`} label="Γωνία λήψης (°)" type="number" value={d.fov} onChange={(v) => up(d.id, { fov: Math.min(360, Math.max(5, num(v))) })} />}
                  {d.kind === 'camera' && (
                    <label htmlFor={`nd-ang-${d.id}`} className="col-span-2 block">
                      <span className="text-(length:--fs-10) font-medium text-muted-foreground">Κατεύθυνση · {Math.round(d.angle)}°</span>
                      <input id={`nd-ang-${d.id}`} type="range" min={0} max={359} value={Math.round(d.angle)} onChange={(e) => up(d.id, { angle: Number(e.target.value) })} className="w-full" />
                    </label>
                  )}
                  <label htmlFor={`nd-notes-${d.id}`} className="col-span-2 block">
                    <span className="text-(length:--fs-10) font-medium text-muted-foreground">Σημειώσεις</span>
                    <textarea id={`nd-notes-${d.id}`} rows={2} value={d.notes} maxLength={1000} onChange={(e) => up(d.id, { notes: e.target.value })} className="w-full resize-y rounded-md border border-input bg-background px-2 py-1 text-(length:--fs-12) outline-hidden focus-visible:ring-2 focus-visible:ring-ring" placeholder={d.kind === 'camera' ? 'Θέση, ύψος, χρήστης NVR…' : 'Ύψος, κύκλωμα, ό,τι χρειάζεται ο τεχνικός…'} />
                  </label>
                  <div className="col-span-2 flex flex-wrap items-center gap-1">
                    <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-(length:--fs-12) text-muted-foreground hover:bg-muted hover:text-foreground focus-within:ring-2 focus-within:ring-ring">
                      {uploading ? <FiLoader className="size-3.5 animate-spin" aria-hidden /> : <FiCamera className="size-3.5" aria-hidden />} Φωτογραφία
                      <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={uploading || d.photoFileIds.length >= 8}
                        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void uploadPhoto(f).then((fid) => { if (fid) setDevices((ds) => ds.map((x) => (x.id === d.id ? { ...x, photoFileIds: [...x.photoFileIds, fid].slice(0, 8) } : x))); }); }} />
                    </label>
                    {d.photoFileIds.map((fid, j) => (
                      <span key={fid} className="group relative">
                        <img src={`/api/admin/entity-files/file/${fid}`} alt={`Φωτογραφία ${j + 1}: ${d.label}`} className="size-10 rounded object-cover ring-1 ring-border" />
                        <button type="button" aria-label={`Αφαίρεση φωτογραφίας ${j + 1}`} onClick={() => up(d.id, { photoFileIds: d.photoFileIds.filter((x) => x !== fid) })}
                          className="absolute -right-1 -top-1 hidden size-4 cursor-pointer items-center justify-center rounded-full bg-destructive text-(length:--fs-10) text-white group-hover:inline-flex">×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Καλώδια */}
      {cables.length > 0 && (
        <ul className="space-y-0.5 border-t border-border pt-1.5">
          {cables.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2 text-(length:--fs-12)">
              <span aria-hidden className="h-0.5 w-4 shrink-0 rounded" style={{ background: CABLE_META[c.kind].color }} />
              <span className="min-w-0 flex-1 truncate">{i + 1}. {name(c.from)} → {name(c.to)}</span>
              <input aria-label={`Τύπος καλωδίου ${i + 1}`} value={c.spec} placeholder={CABLE_META[c.kind].spec} onChange={(e) => setCables((cs) => cs.map((x) => (x.id === c.id ? { ...x, spec: e.target.value } : x)))} className="h-6 w-20 rounded border border-input bg-background px-1 text-(length:--fs-11)" />
              <span className="font-mono text-(length:--fs-11) tabular-nums text-muted-foreground">{fmtLen(polyLength(c.pts))}</span>
              <button type="button" aria-label={`Διαγραφή καλωδίου ${i + 1}`} onClick={() => setCables((cs) => cs.filter((x) => x.id !== c.id))} className="inline-flex size-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><FiTrash2 className="size-3.5" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
