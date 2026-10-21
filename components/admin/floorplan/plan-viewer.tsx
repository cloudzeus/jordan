'use client';

// Προβολή κάτοψης (2D) με three.js: η εικόνα ως υφή σε επίπεδο, οι τοίχοι ως διαφανής μάσκα, οι
// χώροι ως γεμισμένα πολύγωνα με περίγραμμα, ετικέτες σε HTML (καθαρό κείμενο σε κάθε zoom).
// Ορθογραφική κάμερα από πάνω: σύρσιμο = μετακίνηση, ροδέλα = zoom. «Κλικ» θεωρείται πάτημα χωρίς
// μετακίνηση > 5px. Εργαλείο «edit»: λαβές στις κορυφές του επιλεγμένου χώρου (σύρσιμο), «+» στη μέση
// κάθε πλευράς (σύρσιμο = νέα κορυφή), σύρσιμο μέσα στον χώρο = μετακίνηση, διπλό κλικ σε κορυφή = διαγραφή.
// Συντεταγμένες: εικόνα (x δεξιά, y κάτω) ↔ κόσμος (x − w/2, h/2 − y, z).
import * as React from 'react';
import * as THREE from 'three';
import gsap from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { Pt } from '@/lib/floorplan/core';

export type ViewerRoom = { id: string; color: string; polygon: Pt[]; label: string; sub: string; anchor: Pt };
export type ViewerTool = 'room' | 'polygon' | 'wall' | 'divider' | 'calibrate' | 'pan' | 'edit';
/** Φάση επεξεργασίας περιγράμματος: start (πριν την πρώτη αλλαγή — για αναίρεση), move, end. */
export type EditPhase = 'start' | 'move' | 'end';

export type PlanViewerProps = {
  image: HTMLCanvasElement;
  /** Μέγεθος ανάλυσης (pixels) — σύστημα συντεταγμένων όλων των σημείων. */
  w: number;
  h: number;
  wallsOverlay: HTMLCanvasElement | null;
  showWalls: boolean;
  /** Πάχος (px) του τοίχου που σχεδιάζεται τώρα — το «λάστιχο» δείχνει το πραγματικό πάχος. */
  wallThicknessPx: number;
  rooms: ViewerRoom[];
  selectedId: string | null;
  dividers: Array<[Pt, Pt]>;
  calibration: [Pt, Pt] | null;
  draft: Pt[];
  tool: ViewerTool;
  /** Μήκος σε px → κείμενο (π.χ. «3,42 m») για τη ζωντανή ένδειξη στο σχέδιο. */
  formatLength: (px: number) => string;
  onPick: (p: Pt) => void;
  onFinish: () => void;
  /** Αλλαγή περιγράμματος με το εργαλείο «edit». */
  onEdit?: (id: string, polygon: Pt[], phase: EditPhase) => void;
  fitKey: number;
};

const Z = { plan: 0, walls: 0.2, rooms: 0.4, outline: 0.6, divider: 0.8, draft: 1 };
const BG = '#0B1220';
/** Χρώμα τοίχων που σχεδιάζει ο χρήστης (και στη μάσκα, βλ. floor-plan-dialog). */
export const WALL_DRAW = '#FB923C';

function circleTexture(inner = '#F59E0B') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
  g.fillStyle = inner; g.beginPath(); g.arc(32, 32, 18, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
}
/** Λαβή «+» στη μέση πλευράς: νέα κορυφή (σπάσιμο). */
function plusTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(11,18,32,0.85)'; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#22D3EE'; g.lineWidth = 5; g.stroke();
  g.strokeStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.moveTo(32, 18); g.lineTo(32, 46); g.moveTo(18, 32); g.lineTo(46, 32); g.stroke();
  return new THREE.CanvasTexture(c);
}

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
function inside(p: Pt, pts: Pt[]) {
  let r = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) r = !r;
  }
  return r;
}

export function PlanViewer(props: PlanViewerProps) {
  const { image, w, h, wallsOverlay, showWalls, rooms, selectedId, dividers, calibration, draft, tool, fitKey } = props;
  const host = React.useRef<HTMLDivElement | null>(null);
  const labelsEl = React.useRef<HTMLDivElement | null>(null);
  const tipEl = React.useRef<HTMLDivElement | null>(null);
  const cbs = React.useRef(props);
  // «Latest ref»: ενημέρωση μετά το commit (layout effect, πριν από τα passive effects που το διαβάζουν).
  React.useLayoutEffect(() => { cbs.current = props; });

  type Ctx = {
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.OrthographicCamera; controls: OrbitControls;
    plane: THREE.Mesh; layers: Record<'walls' | 'rooms' | 'lines' | 'draft', THREE.Group>;
    lineMats: Set<LineMaterial>; dot: THREE.Texture; vdot: THREE.Texture; plus: THREE.Texture; hover: Pt | null; shift: boolean;
    /** Τρέχον σύρσιμο επεξεργασίας (κορυφή ή ολόκληρος χώρος). */
    drag: { id: string; kind: 'vertex' | 'move'; i: number; base: Pt[]; from: Pt; moved: boolean } | null;
  };
  const ctx = React.useRef<Ctx | null>(null);
  const toWorld = React.useCallback((p: Pt, z: number) => new THREE.Vector3(p.x - w / 2, h / 2 - p.y, z), [w, h]);

  // ── Βοηθητικά σχεδίασης ───────────────────────────────────────────────────────────────
  const clear = React.useCallback((g: THREE.Group) => {
    const c = ctx.current;
    for (const o of [...g.children]) {
      g.remove(o);
      o.traverse((x) => {
        const m = x as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | undefined;
        if (mat) { if (mat instanceof LineMaterial) c?.lineMats.delete(mat); (mat as THREE.MeshBasicMaterial).map?.dispose?.(); mat.dispose(); }
      });
    }
  }, []);
  const line = React.useCallback((pts: Pt[], z: number, color: string, width: number, opts: { closed?: boolean; dashed?: boolean; world?: boolean } = {}) => {
    const c = ctx.current!;
    const arr: number[] = [];
    const seq = opts.closed ? [...pts, pts[0]] : pts;
    for (const p of seq) { const v = toWorld(p, z); arr.push(v.x, v.y, v.z); }
    const g = new LineGeometry();
    g.setPositions(arr);
    const m = new LineMaterial({ color: new THREE.Color(color).getHex(), linewidth: width, dashed: !!opts.dashed, dashSize: 8, gapSize: 6, worldUnits: !!opts.world, transparent: true, opacity: opts.world ? 0.75 : 1, depthTest: false });
    m.resolution.set(host.current?.clientWidth ?? 1, host.current?.clientHeight ?? 1);
    c.lineMats.add(m);
    const l = new Line2(g, m);
    if (opts.dashed) l.computeLineDistances();
    l.renderOrder = 10;
    return l;
  }, [toWorld]);
  const dots = React.useCallback((pts: Pt[], z: number, size = 11, tex?: THREE.Texture) => {
    const c = ctx.current!;
    const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => toWorld(p, z)));
    const m = new THREE.PointsMaterial({ size, sizeAttenuation: false, map: (tex ?? c.dot).clone(), transparent: true, alphaTest: 0.4, depthTest: false });
    m.map!.needsUpdate = true;
    const o = new THREE.Points(g, m);
    o.renderOrder = 12;
    return o;
  }, [toWorld]);

  // Πρόχειρο (σημεία που μπαίνουν τώρα) + «λάστιχο» ως τον κέρσορα. Καλείται και από το pointermove.
  const drawDraft = React.useCallback(() => {
    const c = ctx.current;
    if (!c) return;
    const { draft: d, tool: t } = cbs.current;
    clear(c.layers.draft);
    if (!d.length) return;
    const color = t === 'calibrate' ? '#F59E0B' : t === 'divider' ? '#F43F5E' : t === 'wall' ? WALL_DRAW : '#22D3EE';
    const seq = c.hover ? [...d, c.hover] : d;
    if (seq.length >= 2 && t === 'wall') c.layers.draft.add(line(seq, Z.draft, color, Math.max(2, cbs.current.wallThicknessPx), { world: true }));
    else if (seq.length >= 2) c.layers.draft.add(line(seq, Z.draft, color, 2.5, { dashed: t === 'polygon' }));
    if (t === 'polygon' && d.length >= 2 && c.hover) c.layers.draft.add(line([c.hover, d[0]], Z.draft, color, 1, { dashed: true }));
    c.layers.draft.add(dots(d, Z.draft + 0.1));
  }, [clear, line, dots]);

  // ── Σκηνή (μία φορά ανά εικόνα) ─────────────────────────────────────────────────────────
  React.useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setClearColor(BG);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    const D = Math.max(w, h) * 2;
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, D * 6);
    camera.position.set(0, 0, D);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.15;
    controls.screenSpacePanning = true;
    controls.enableRotate = false;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.minZoom = 0.02;
    controls.maxZoom = 40;

    const tex = new THREE.CanvasTexture(image);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    plane.position.z = Z.plan;
    scene.add(plane);

    // Λεπτό «χαρτί» γύρω από το σχέδιο.
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.04, h * 1.04), new THREE.MeshBasicMaterial({ color: 0x16213a }));
    sheet.position.z = -0.5;
    scene.add(sheet);

    const layers = { walls: new THREE.Group(), rooms: new THREE.Group(), lines: new THREE.Group(), draft: new THREE.Group() };
    Object.values(layers).forEach((g) => scene.add(g));

    const c: Ctx = {
      renderer, scene, camera, controls, plane, layers, lineMats: new Set(), dot: circleTexture(), vdot: circleTexture('#22D3EE'), plus: plusTexture(),
      hover: null, shift: false, drag: null,
    };
    ctx.current = c;

    const resize = () => {
      const cw = el.clientWidth || 1, ch = el.clientHeight || 1;
      renderer.setSize(cw, ch, false);
      renderer.domElement.style.width = `${cw}px`;
      renderer.domElement.style.height = `${ch}px`;
      camera.left = -cw / 2; camera.right = cw / 2; camera.top = ch / 2; camera.bottom = -ch / 2;
      camera.updateProjectionMatrix();
      c.lineMats.forEach((m) => m.resolution.set(cw, ch));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // Αρχικό «χωράει ολόκληρο».
    const cw0 = el.clientWidth || 1, ch0 = el.clientHeight || 1;
    camera.zoom = Math.min(cw0 / w, ch0 / h) * 0.92;
    camera.updateProjectionMatrix();

    // ── Κλικ / hover ─────────────────────────────────────────────────────────────────────
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pick = (ev: PointerEvent | MouseEvent): Pt | null => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(plane, false)[0];
      if (!hit) return null;
      return { x: hit.point.x + w / 2, y: h / 2 - hit.point.y };
    };
    // Shift ⇒ οριζόντια/κάθετα από το τελευταίο σημείο (ορθές γωνίες σε τοίχους).
    const constrain = (p: Pt, shift: boolean): Pt => {
      const last = cbs.current.draft[cbs.current.draft.length - 1];
      if (!shift || !last) return p;
      return Math.abs(p.x - last.x) > Math.abs(p.y - last.y) ? { x: p.x, y: last.y } : { x: last.x, y: p.y };
    };
    // ── Επεξεργασία περιγράμματος ────────────────────────────────────────────────────────
    const screen = (p: Pt) => {
      const r = renderer.domElement.getBoundingClientRect();
      const q = new THREE.Vector3(p.x - w / 2, h / 2 - p.y, 0).project(camera);
      return { x: r.left + ((q.x + 1) / 2) * r.width, y: r.top + ((1 - q.y) / 2) * r.height };
    };
    const selectedRoom = () => cbs.current.rooms.find((r) => r.id === cbs.current.selectedId) ?? null;
    /** Τι βρίσκεται κάτω από τον δείκτη: κορυφή, μέση πλευράς ή το εσωτερικό του επιλεγμένου χώρου. */
    const editHit = (e: PointerEvent | MouseEvent): { kind: 'vertex' | 'mid' | 'inside'; i: number } | null => {
      const r = selectedRoom();
      if (!r) return null;
      const near = (p: Pt, tol: number) => { const s = screen(p); return Math.hypot(s.x - e.clientX, s.y - e.clientY) <= tol; };
      for (let i = 0; i < r.polygon.length; i++) if (near(r.polygon[i], 10)) return { kind: 'vertex', i };
      for (let i = 0; i < r.polygon.length; i++) if (near(mid(r.polygon[i], r.polygon[(i + 1) % r.polygon.length]), 9)) return { kind: 'mid', i };
      const p = pick(e);
      return p && inside(p, r.polygon) ? { kind: 'inside', i: -1 } : null;
    };
    /** Η νέα θέση κορυφής: Shift = οριζόντια/κάθετα από την προηγούμενη· αλλιώς «κούμπωμα» σε ευθεία με τις γειτονικές (6px οθόνης). */
    const placeVertex = (poly: Pt[], i: number, p: Pt, shift: boolean): Pt => {
      const prev = poly[(i - 1 + poly.length) % poly.length], next = poly[(i + 1) % poly.length];
      if (shift) return Math.abs(p.x - prev.x) > Math.abs(p.y - prev.y) ? { x: p.x, y: prev.y } : { x: prev.x, y: p.y };
      const tol = 6 / camera.zoom;
      const q = { ...p };
      for (const n of [prev, next]) {
        if (Math.abs(q.x - n.x) < tol) q.x = n.x;
        if (Math.abs(q.y - n.y) < tol) q.y = n.y;
      }
      return q;
    };
    const clampPt = (p: Pt): Pt => ({ x: Math.max(0, Math.min(w, p.x)), y: Math.max(0, Math.min(h, p.y)) });

    let down: { x: number; y: number; button: number } | null = null;
    let skipClick = false;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, button: e.button };
      skipClick = false;
      if (cbs.current.tool !== 'edit' || e.button !== 0) return;
      const hit = editHit(e);
      const r = selectedRoom();
      const p = pick(e);
      if (!hit || !r || !p) return;
      let base = r.polygon.map((q) => ({ ...q }));
      let i = hit.i;
      if (hit.kind === 'mid') { i = hit.i + 1; base = [...base.slice(0, i), mid(base[hit.i], base[i % base.length]), ...base.slice(i)]; }
      c.drag = { id: r.id, kind: hit.kind === 'inside' ? 'move' : 'vertex', i, base, from: p, moved: false };
      controls.enabled = false;
      renderer.domElement.setPointerCapture(e.pointerId);
      if (hit.kind === 'mid') { cbs.current.onEdit?.(r.id, base, 'start'); c.drag.moved = true; cbs.current.onEdit?.(r.id, base, 'move'); }
    };
    const dragTo = (e: PointerEvent) => {
      const d = c.drag;
      const p = pick(e);
      if (!d || !p) return;
      if (!d.moved) { cbs.current.onEdit?.(d.id, d.base, 'start'); d.moved = true; }
      let poly: Pt[];
      if (d.kind === 'move') {
        const dx = p.x - d.from.x, dy = p.y - d.from.y;
        poly = d.base.map((q) => clampPt({ x: q.x + dx, y: q.y + dy }));
      } else {
        poly = d.base.slice();
        poly[d.i] = clampPt(placeVertex(d.base, d.i, p, e.shiftKey));
      }
      cbs.current.onEdit?.(d.id, poly, 'move');
      // Ζωντανά μήκη των δύο πλευρών της κορυφής.
      const tip = tipEl.current;
      if (tip && d.kind === 'vertex') {
        const a = poly[(d.i - 1 + poly.length) % poly.length], b = poly[d.i], n = poly[(d.i + 1) % poly.length];
        const s = screen(b), rr = renderer.domElement.getBoundingClientRect();
        tip.style.opacity = '1';
        tip.style.transform = `translate(${s.x - rr.left + 14}px, ${s.y - rr.top + 14}px)`;
        tip.textContent = `${cbs.current.formatLength(Math.hypot(b.x - a.x, b.y - a.y))} · ${cbs.current.formatLength(Math.hypot(n.x - b.x, n.y - b.y))}`;
      }
    };
    const endDrag = (e: PointerEvent) => {
      const d = c.drag;
      if (!d) return false;
      c.drag = null;
      controls.enabled = true;
      if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
      if (d.moved) { dragTo(e); const cur = cbs.current.rooms.find((r) => r.id === d.id); if (cur) cbs.current.onEdit?.(d.id, cur.polygon, 'end'); }
      if (tipEl.current) tipEl.current.style.opacity = '0';
      return d.moved;
    };
    const onUp = (e: PointerEvent) => {
      // Πάτημα σε λαβή/μέσα στον επιλεγμένο χώρο δεν είναι «κλικ επιλογής» — αλλιώς το πρώτο κλικ του
      // διπλού κλικ σε κορυφή (που είναι στο όριο) θα επέλεγε τον γειτονικό χώρο.
      const hadDrag = !!c.drag;
      if (endDrag(e) || hadDrag) { skipClick = true; down = null; return; }
      const d = down; down = null;
      if (skipClick || !d || d.button !== 0 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
      if (cbs.current.tool === 'pan') return;
      const p = pick(e);
      if (p && p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h) cbs.current.onPick(constrain(p, e.shiftKey));
    };
    const onMove = (e: PointerEvent) => {
      if (c.drag) { dragTo(e); return; }
      if (cbs.current.tool === 'edit') {
        const hit = editHit(e);
        renderer.domElement.style.cursor = !hit ? '' : hit.kind === 'inside' ? 'move' : hit.kind === 'mid' ? 'copy' : 'grab';
      } else renderer.domElement.style.cursor = '';
      const p = pick(e);
      c.hover = p ? constrain(p, e.shiftKey) : null;
      c.shift = e.shiftKey;
      drawDraft();
    };
    const onLeave = () => { c.hover = null; drawDraft(); };
    const onDbl = (e: MouseEvent) => {
      e.preventDefault();
      if (cbs.current.tool === 'edit') {
        // Διπλό κλικ σε κορυφή: διαγραφή της (μένουν τουλάχιστον 3).
        const hit = editHit(e);
        const r = selectedRoom();
        if (hit?.kind === 'vertex' && r && r.polygon.length > 3) {
          const poly = r.polygon.filter((_, k) => k !== hit.i);
          cbs.current.onEdit?.(r.id, r.polygon, 'start');
          cbs.current.onEdit?.(r.id, poly, 'end');
        }
        return;
      }
      cbs.current.onFinish();
    };
    const el2 = renderer.domElement;
    el2.addEventListener('pointerdown', onDown);
    el2.addEventListener('pointerup', onUp);
    el2.addEventListener('pointermove', onMove);
    el2.addEventListener('pointerleave', onLeave);
    el2.addEventListener('dblclick', onDbl);

    // ── Βρόχος: ετικέτες ακολουθούν την κάμερα ──────────────────────────────────────────
    let raf = 0;
    const v = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
      const cw = el.clientWidth, ch = el.clientHeight;
      const lab = labelsEl.current;
      if (lab) {
        for (const node of Array.from(lab.children) as HTMLElement[]) {
          const x = Number(node.dataset.x), y = Number(node.dataset.y);
          v.set(x - w / 2, h / 2 - y, Z.outline).project(camera);
          node.style.transform = `translate(${((v.x + 1) / 2) * cw}px, ${((1 - v.y) / 2) * ch}px) translate(-50%, -50%)`;
        }
      }
      const tip = tipEl.current;
      if (tip) {
        const last = cbs.current.draft[cbs.current.draft.length - 1];
        const t = cbs.current.tool;
        if (c.hover && last && (t === 'calibrate' || t === 'divider' || t === 'polygon' || t === 'wall')) {
          v.set(c.hover.x - w / 2, h / 2 - c.hover.y, Z.draft).project(camera);
          tip.style.opacity = '1';
          tip.style.transform = `translate(${((v.x + 1) / 2) * cw + 14}px, ${((1 - v.y) / 2) * ch + 14}px)`;
          tip.textContent = cbs.current.formatLength(Math.hypot(c.hover.x - last.x, c.hover.y - last.y));
        } else tip.style.opacity = '0';
      }
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el2.removeEventListener('pointerdown', onDown);
      el2.removeEventListener('pointerup', onUp);
      el2.removeEventListener('pointermove', onMove);
      el2.removeEventListener('pointerleave', onLeave);
      el2.removeEventListener('dblclick', onDbl);
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => { (x as THREE.MeshBasicMaterial).map?.dispose(); x.dispose(); });
      });
      c.dot.dispose(); c.vdot.dispose(); c.plus.dispose();
      renderer.dispose();
      el2.remove();
      ctx.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, w, h]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(drawDraft, [draft, tool, image]);

  // Μάσκα τοίχων (2D).
  React.useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    clear(c.layers.walls);
    if (!wallsOverlay) return;
    const t = new THREE.CanvasTexture(wallsOverlay);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    m.position.z = Z.walls;
    c.layers.walls.add(m);
  }, [wallsOverlay, w, h, image, clear]);

  React.useEffect(() => {
    const c = ctx.current;
    if (c) c.layers.walls.visible = showWalls;
  }, [showWalls, wallsOverlay, image]);

  // Χώροι + γραμμές.
  React.useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    clear(c.layers.rooms);
    for (const r of rooms) {
      if (r.polygon.length < 3) continue;
      const shape = new THREE.Shape(r.polygon.map((p) => new THREE.Vector2(p.x - w / 2, h / 2 - p.y)));
      const sel = r.id === selectedId;
      const fill = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: sel ? 0.5 : 0.32, depthWrite: false, side: THREE.DoubleSide }),
      );
      fill.position.z = Z.rooms;
      c.layers.rooms.add(fill);
      c.layers.rooms.add(line(r.polygon, Z.outline, sel ? '#FFFFFF' : r.color, sel ? 3.5 : 2.5, { closed: true }));
      if (sel && tool === 'edit') {
        c.layers.rooms.add(dots(r.polygon.map((p, i) => mid(p, r.polygon[(i + 1) % r.polygon.length])), Z.draft, 16, c.plus));
        c.layers.rooms.add(dots(r.polygon, Z.draft + 0.05, 14, c.vdot));
      }
    }
  }, [rooms, selectedId, tool, w, h, image, toWorld, clear, line, dots]);

  React.useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    clear(c.layers.lines);
    for (const [a, b] of dividers) c.layers.lines.add(line([a, b], Z.divider, '#F43F5E', 3));
    if (calibration) {
      c.layers.lines.add(line(calibration, Z.divider, '#F59E0B', 3));
      c.layers.lines.add(dots(calibration, Z.divider + 0.1, 10));
    }
  }, [dividers, calibration, image, toWorld, clear, line, dots]);

  // «Χωράει ολόκληρο».
  React.useEffect(() => {
    const c = ctx.current;
    const el = host.current;
    if (!c || !el || fitKey === 0) return;
    const { camera, controls } = c;
    const zoom = Math.min(el.clientWidth / w, el.clientHeight / h) * 0.92;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tl = gsap.timeline({ defaults: { duration: reduce ? 0 : 0.6, ease: 'power2.inOut' } });
    tl.to(controls.target, { x: 0, y: 0, z: 0 }, 0)
      .to(camera.position, { x: 0, y: 0, onUpdate: () => camera.lookAt(controls.target) }, 0)
      .to(camera, { zoom, onUpdate: () => camera.updateProjectionMatrix() }, 0);
    return () => { tl.kill(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  const cursor = tool === 'pan' ? 'grab' : tool === 'room' ? 'cell' : tool === 'edit' ? 'default' : 'crosshair';
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: BG }}>
      <div ref={host} className="absolute inset-0" style={{ cursor }} />
      <div ref={labelsEl} className="pointer-events-none absolute inset-0" aria-hidden>
        {rooms.map((r) => (
          <div
            key={r.id}
            data-x={r.anchor.x}
            data-y={r.anchor.y}
            className="absolute left-0 top-0 whitespace-nowrap rounded-md border px-2 py-1 text-center shadow-lg backdrop-blur-xs"
            style={{ borderColor: r.color, background: 'rgba(11,18,32,0.82)', color: '#F8FAFC', outline: r.id === selectedId ? '2px solid #fff' : undefined }}
          >
            <div className="text-[11px] font-medium leading-tight opacity-80">{r.label}</div>
            <div className="font-mono text-[13px] font-semibold leading-tight tabular-nums">{r.sub}</div>
          </div>
        ))}
      </div>
      <div
        ref={tipEl}
        className="pointer-events-none absolute left-0 top-0 rounded bg-amber-400 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-900 shadow-sm transition-opacity"
        style={{ opacity: 0 }}
        aria-hidden
      />
    </div>
  );
}
