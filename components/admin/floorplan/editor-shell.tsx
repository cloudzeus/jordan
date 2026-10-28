'use client';

// Κέλυφος (chrome) του editor κατόψεων v2 — full-screen dark pro, όπως το mockup
// (docs/design/floorplan-editor-v2.html): top bar, αριστερή DRAGGABLE παλέτα με όλα τα εργαλεία,
// δεξί πάνελ (τύποι τοίχου + ιδιότητες επιλογής), status bar σε μέτρα, φωτεινό artboard.
// Presentational: παίρνει τα εργαλεία/δεδομένα/handlers και τον καμβά (PlanViewer) ως children.
import * as React from 'react';
import { FiSave, FiLoader, FiFileText } from 'react-icons/fi';
import { clampToolbarPos } from '@/lib/floorplan/editor-ui';

type ToolItem = { key: string; label: string; kbd: string; icon: React.ReactNode; group: string };
export type EditorShellWallType = { id: string; code: string; name: string; color: string; thicknessM: number; hotkey: string | null };

export type EditorShellProps = {
  title: string;
  subtitle?: string;
  tools: ToolItem[];
  activeTool: string;
  onTool: (k: string) => void;
  ortho: boolean;
  onToggleOrtho: () => void;
  view3d: boolean;
  onView: (v: boolean) => void;
  canUse3d: boolean;
  zoomPct?: number;
  scaleLabel?: string;
  ceilingLabel?: string;
  wallTypes: EditorShellWallType[];
  activeWallTypeId?: string | null;
  onWallType?: (id: string) => void;
  status?: { xM?: string; yM?: string; lengthM?: string; angleDeg?: string; selection?: string; snap?: string };
  takeoff?: { floorM2: string; wallsM2: string; openings?: string };
  onSave: () => void;
  saving?: boolean;
  onExport?: () => void;
  rightExtra?: React.ReactNode;
  children: React.ReactNode;
};

const TB_KEY = 'fp.v2.toolbar';
const nf = (m: number) => `${Math.round(m * 100).toLocaleString('el-GR')} cm`;

export function EditorShell(props: EditorShellProps) {
  const { tools, activeTool, onTool, ortho, onToggleOrtho, view3d, onView, canUse3d, wallTypes } = props;
  const groups = React.useMemo(() => [...new Set(tools.map((t) => t.group))], [tools]);

  // ── Draggable παλέτα ──
  const paletteRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<{ dx: number; dy: number } | null>(null);
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(() => {
    try { const s = localStorage.getItem(TB_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const onDown = (e: React.PointerEvent) => {
    const el = paletteRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onMove = (e: React.PointerEvent) => {
    const el = paletteRef.current; if (!drag.current || !el) return;
    const parent = el.offsetParent as HTMLElement | null; if (!parent) return;
    const pr = parent.getBoundingClientRect();
    const np = clampToolbarPos(
      { x: e.clientX - pr.left - drag.current.dx, y: e.clientY - pr.top - drag.current.dy },
      { w: pr.width, h: pr.height }, { w: el.offsetWidth, h: el.offsetHeight }, 8,
    );
    setPos(np);
    try { localStorage.setItem(TB_KEY, JSON.stringify(np)); } catch { /* ignore */ }
  };
  const onUp = (e: React.PointerEvent) => { drag.current = null; try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ } };

  const chip = 'inline-flex h-6 items-center gap-1.5 rounded-md border border-white/10 bg-[#111a2e] px-2 text-(length:--fs-11) text-slate-400';

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: '#0B1220', color: '#E5E7EB' }}>
      {/* ── Top bar ── */}
      <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-white/10 px-2.5" style={{ background: '#0F172A' }}>
        <span className="truncate text-(length:--fs-13) text-slate-400">{props.title}{props.subtitle ? <> · <b className="text-slate-200">{props.subtitle}</b></> : null}</span>
        <div className="ml-1 flex items-center gap-2 border-l border-white/10 pl-2.5">
          {props.scaleLabel && <span className={chip}>Κλίμακα <b className="text-slate-200">{props.scaleLabel}</b></span>}
          {props.ceilingLabel && <span className={chip}>Όροφος <b className="text-slate-200">{props.ceilingLabel}</b></span>}
        </div>
        <div className="flex-1" />
        <div className="flex overflow-hidden rounded-lg border border-white/10" style={{ background: '#111a2e' }} role="radiogroup" aria-label="Προβολή">
          {(['2D', '3D'] as const).map((m) => {
            const on = (m === '3D') === view3d;
            return (
              <button key={m} type="button" role="radio" aria-checked={on} disabled={m === '3D' && !canUse3d}
                onClick={() => onView(m === '3D')}
                className="h-[26px] cursor-pointer px-2.5 text-(length:--fs-12) disabled:cursor-not-allowed disabled:opacity-40"
                style={on ? { background: '#7C3AED', color: '#fff', fontWeight: 600 } : { color: '#94A3B8' }}>{m}</button>
            );
          })}
        </div>
        {props.zoomPct != null && <span className={chip}>Zoom <b className="text-slate-200">{props.zoomPct}%</b></span>}
        {props.onExport && (
          <button type="button" onClick={props.onExport} className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-white/15 px-2.5 text-(length:--fs-12) text-slate-300 transition-colors hover:bg-white/5">
            <FiFileText className="size-3.5" aria-hidden /> Επιμέτρηση
          </button>
        )}
        <button type="button" onClick={props.onSave} disabled={props.saving}
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-(length:--fs-12) font-semibold text-white transition-colors disabled:opacity-60"
          style={{ background: '#7C3AED' }}>
          {props.saving ? <FiLoader className="size-3.5 animate-spin" aria-hidden /> : <FiSave className="size-3.5" aria-hidden />} Αποθήκευση
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1">
        {/* Artboard (καμβάς) με τη draggable παλέτα από πάνω */}
        <div className="relative min-w-0 flex-1 overflow-hidden" style={{ background: '#0a1120' }}>
          {props.children}

          {!view3d && (
            <div ref={paletteRef} className="absolute z-20 flex w-fit flex-col gap-0.5 rounded-xl border border-white/10 p-1 shadow-xl backdrop-blur-sm"
              style={{ left: pos?.x ?? 12, top: pos?.y ?? 12, background: 'rgba(15,23,42,.92)' }}
              role="toolbar" aria-label="Εργαλεία" aria-orientation="vertical">
              {/* grip handle */}
              <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
                className="mb-0.5 flex h-4 cursor-grab touch-none items-center justify-center rounded-md hover:bg-white/5 active:cursor-grabbing" aria-label="Σύρε την παλέτα" title="Σύρε την παλέτα">
                <span className="grid grid-cols-3 gap-[2px]" aria-hidden>{Array.from({ length: 6 }).map((_, i) => <span key={i} className="size-[2px] rounded-full bg-slate-500" />)}</span>
              </div>
              {groups.map((g, gi) => (
                <React.Fragment key={g}>
                  {gi > 0 && <span className="my-0.5 h-px w-7 self-center bg-white/10" aria-hidden />}
                  {tools.filter((t) => t.group === g).map((t) => (
                    <button key={t.key} type="button" onClick={() => onTool(t.key)} aria-pressed={activeTool === t.key} aria-label={`${t.label} (${t.kbd})`} title={`${t.label} — ${t.kbd}`}
                      className="relative inline-flex size-9 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-white/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 [&_svg]:size-4"
                      style={activeTool === t.key ? { background: '#7C3AED', color: '#fff' } : { color: '#CBD5E1' }}>
                      {t.icon}
                      <span className="pointer-events-none absolute bottom-0.5 right-0.5 text-[9px] font-semibold" style={{ color: activeTool === t.key ? 'rgba(255,255,255,.75)' : '#64748B' }}>{t.kbd}</span>
                    </button>
                  ))}
                </React.Fragment>
              ))}
              <span className="my-0.5 h-px w-7 self-center bg-white/10" aria-hidden />
              <button type="button" onClick={onToggleOrtho} aria-pressed={ortho} aria-label="Ορθές γωνίες 90° (F8)" title="Ορθές γωνίες — F8"
                className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg font-mono text-(length:--fs-11) font-bold transition-colors hover:bg-white/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
                style={ortho ? { background: '#F59E0B', color: '#0B1220' } : { color: '#CBD5E1', boxShadow: 'inset 0 0 0 1px #334155' }}>90°</button>
            </div>
          )}

          {props.status && (
            <div className="pointer-events-none absolute bottom-2 left-2 rounded-lg border border-white/15 px-2.5 py-1.5 text-(length:--fs-11) tabular-nums text-slate-300" style={{ background: 'rgba(15,23,42,.92)' }}>
              {props.takeoff && <div className="flex gap-3"><span>Δάπεδο <b className="text-white">{props.takeoff.floorM2}</b></span><span>Τοίχοι <b className="text-white">{props.takeoff.wallsM2}</b></span></div>}
            </div>
          )}
        </div>

        {/* ── Δεξί inspector ── */}
        <aside className="w-[300px] shrink-0 overflow-auto border-l border-white/10" style={{ background: '#0F172A' }}>
          {props.rightExtra && <div className="border-b border-white/10 p-3">{props.rightExtra}</div>}
          {wallTypes.length > 0 && (
            <div className="border-b border-white/10 p-3">
              <h3 className="mb-2 flex items-center justify-between text-(length:--fs-11) font-semibold uppercase tracking-wider text-slate-500">Τύποι τοίχου <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-1.5 text-[10px] text-cyan-300">1–9</span></h3>
              <div className="flex flex-col gap-[3px]">
                {wallTypes.map((w) => (
                  <button key={w.id} type="button" onClick={() => props.onWallType?.(w.id)} aria-pressed={props.activeWallTypeId === w.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                    style={props.activeWallTypeId === w.id ? { borderColor: '#7C3AED', background: 'rgba(124,58,237,.14)' } : { borderColor: 'transparent', background: '#0d1526' }}>
                    <span className="size-3 shrink-0 rounded-sm border border-black/25" style={{ background: w.color }} aria-hidden />
                    <span className="flex-1 truncate text-(length:--fs-12) text-slate-200">{w.name}</span>
                    <span className="text-(length:--fs-11) tabular-nums text-slate-400">{nf(w.thicknessM)}</span>
                    {w.hotkey && <span className="grid size-4 place-items-center rounded bg-slate-700 text-[10px] font-semibold text-slate-300">{w.hotkey}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* ── Status bar ── */}
      <div className="flex h-[26px] shrink-0 items-center gap-3.5 border-t border-white/10 px-3 text-(length:--fs-11) tabular-nums text-slate-400" style={{ background: '#0F172A' }}>
        {props.status?.xM != null && <span><span className="text-slate-600">X</span> <b className="text-slate-200">{props.status.xM}</b></span>}
        {props.status?.yM != null && <span><span className="text-slate-600">Y</span> <b className="text-slate-200">{props.status.yM}</b></span>}
        {props.status?.lengthM != null && <span><span className="text-slate-600">Μήκος</span> <b className="text-slate-200">{props.status.lengthM}</b></span>}
        <div className="ml-auto flex items-center gap-3.5">
          {ortho && <span style={{ color: '#34D399' }}>◳ Ορθο (F8)</span>}
          {props.status?.snap && <span><span className="text-slate-600">Κούμπωμα</span> <b className="text-slate-200">{props.status.snap}</b></span>}
          {props.status?.selection && <span><span className="text-slate-600">Επιλογή</span> <b className="text-slate-200">{props.status.selection}</b></span>}
          {props.zoomPct != null && <span><span className="text-slate-600">Zoom</span> <b className="text-slate-200">{props.zoomPct}%</b></span>}
        </div>
      </div>
    </div>
  );
}
