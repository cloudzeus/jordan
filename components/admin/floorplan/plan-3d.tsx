'use client';

// Προβολή 3D της κάτοψης (three.js): το σχέδιο στο δάπεδο, οι χώροι χρωματιστοί, τοίχοι ως το ταβάνι με
// τη ζώνη πλακιδίων στο χρώμα του χώρου και τα σχεδιασμένα ανοίγματα (πόρτες/παράθυρα) κομμένα.
// Ηλεκτρολογικά & δίκτυο: συσκευές στο τυπικό ύψος τοποθέτησης, κάλυψη AP/κάμερας στο δάπεδο, καλώδια
// διάστικτα στο ύψος όδευσης με «κατεβάσματα» ως τη συσκευή. Μόνο προβολή — οι αλλαγές γίνονται στο 2D.
import * as React from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RoomWalls } from '@/lib/floorplan/walls';
import { wallPieces } from '@/lib/floorplan/walls3d';
import { CABLE_META, CABLE_RUN_M, cameraWedge, DEVICE_3D, DEVICE_META, type PlanCable, type PlanDevice } from '@/lib/floorplan/network';

type Pt = { x: number; y: number };
export type Room3d = { id: string; name: string; color: string; polygon: Pt[]; walls?: RoomWalls };
/** Εικόνα (PNG) της τρέχουσας προβολής — για αποθήκευση μαζί με τη χαρτογράφηση. */
export type Plan3dHandle = { capture: () => Promise<Blob | null> };

const BG = '#0B1220';
const CEILING_M = 2.8;
const WALL_T_M = 0.1;

export function Plan3d({ image, w, h, mPerPx, rooms, selectedId, devices = [], cables = [], selectedDeviceId = null, ref }: {
  image: HTMLCanvasElement; w: number; h: number; mPerPx: number; rooms: Room3d[]; selectedId: string | null;
  devices?: PlanDevice[]; cables?: PlanCable[]; selectedDeviceId?: string | null;
  ref?: React.Ref<Plan3dHandle>;
}) {
  const host = React.useRef<HTMLDivElement | null>(null);
  const ctx = React.useRef<{ scene: THREE.Scene; group: THREE.Group; net: THREE.Group; snap: () => Promise<Blob | null> } | null>(null);
  React.useImperativeHandle(ref, () => ({ capture: () => ctx.current?.snap() ?? Promise.resolve(null) }), []);

  // Σκηνή (μία φορά ανά εικόνα/κλίμακα).
  React.useEffect(() => {
    const el = host.current;
    if (!el) return;
    // preserveDrawingBuffer: για να διαβάζεται η εικόνα (αποθήκευση render) εκτός του βρόχου.
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setClearColor(BG);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    const size = Math.max(w, h);
    const camera = new THREE.PerspectiveCamera(45, 1, size / 500, size * 20);
    camera.position.set(size * 0.55, size * 0.75, size * 0.95);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(size * 0.6, size * 1.2, size * 0.4);
    scene.add(sun);

    // Το σχέδιο στο δάπεδο.
    const tex = new THREE.CanvasTexture(image);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const group = new THREE.Group();
    scene.add(group);
    const net = new THREE.Group();
    scene.add(net);
    const snap = () => new Promise<Blob | null>((res) => {
      renderer.render(scene, camera);
      renderer.domElement.toBlob((b) => res(b), 'image/png');
    });
    ctx.current = { scene, group, net, snap };

    const resize = () => {
      const cw = el.clientWidth || 1, ch = el.clientHeight || 1;
      renderer.setSize(cw, ch, false);
      renderer.domElement.style.width = `${cw}px`;
      renderer.domElement.style.height = `${ch}px`;
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let raf = 0;
    const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => { (x as THREE.MeshBasicMaterial).map?.dispose(); x.dispose(); });
      });
      renderer.dispose();
      renderer.domElement.remove();
      ctx.current = null;
    };
  }, [image, w, h]);

  // Χώροι + τοίχοι (ξαναχτίζονται σε κάθε αλλαγή).
  React.useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    for (const o of [...c.group.children]) {
      c.group.remove(o);
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    }
    const px = (m: number) => m / mPerPx;
    const X = (p: Pt) => p.x - w / 2, Z = (p: Pt) => p.y - h / 2;
    const plain = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.9, transparent: true, opacity: 0.88 });
    for (const r of rooms) {
      if (r.polygon.length < 3) continue;
      const sel = r.id === selectedId;
      const shape = new THREE.Shape(r.polygon.map((p) => new THREE.Vector2(X(p), -Z(p))));
      const fl = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: sel ? 0.6 : 0.42, side: THREE.DoubleSide, depthWrite: false }));
      fl.rotation.x = -Math.PI / 2;
      fl.position.y = px(0.005);
      c.group.add(fl);
      const tiled = new THREE.MeshStandardMaterial({ color: r.color, roughness: 0.55, emissive: new THREE.Color(r.color), emissiveIntensity: sel ? 0.25 : 0.08 });
      const pieces = wallPieces(r.polygon, r.walls?.openings ?? [], { tileM: r.walls?.on ? r.walls.heightM : null, ceilingM: CEILING_M, tolPx: px(0.3) });
      for (const pc of pieces) {
        const len = Math.hypot(pc.b.x - pc.a.x, pc.b.y - pc.a.y);
        if (len < 0.5) continue;
        const box = new THREE.Mesh(new THREE.BoxGeometry(len, px(pc.z1 - pc.z0), px(WALL_T_M)), pc.tiled ? tiled : plain);
        box.position.set((X(pc.a) + X(pc.b)) / 2, px((pc.z0 + pc.z1) / 2), (Z(pc.a) + Z(pc.b)) / 2);
        box.rotation.y = -Math.atan2(pc.b.y - pc.a.y, pc.b.x - pc.a.x);
        c.group.add(box);
      }
    }
  }, [rooms, selectedId, mPerPx, w, h, image]);

  // Ηλεκτρολογικά & δίκτυο.
  React.useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    for (const o of [...c.net.children]) {
      c.net.remove(o);
      o.traverse((x) => { const m = x as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose(); });
    }
    const px = (m: number) => m / mPerPx;
    const X = (p: Pt) => p.x - w / 2, Z = (p: Pt) => p.y - h / 2;
    const byId = new Map(devices.map((d) => [d.id, d]));
    const dotted = (pts: THREE.Vector3[], color: string, step: number) => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color, dashSize: step * 0.35, gapSize: step * 0.65, transparent: true, opacity: 0.95 }));
      l.computeLineDistances();
      return l;
    };
    const flat = (shape: THREE.Shape, color: string, opacity: number) => {
      const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = px(0.01);
      return m;
    };
    for (const d of devices) {
      const meta = DEVICE_META[d.kind], g3 = DEVICE_3D[d.kind];
      const sel = d.id === selectedDeviceId;
      const [sx, sy, sz] = g3.size.map(px) as [number, number, number];
      const mat = new THREE.MeshStandardMaterial({ color: meta.color, roughness: 0.4, emissive: new THREE.Color(meta.color), emissiveIntensity: sel ? 0.7 : 0.35 });
      const geo = g3.shape === 'disc' ? new THREE.CylinderGeometry(sx / 2, sx / 2, sy, 32) : g3.shape === 'cyl' ? new THREE.CylinderGeometry(sx / 2, sx / 2, sz, 16) : new THREE.BoxGeometry(sx, sy, sz);
      const mesh = new THREE.Mesh(geo, mat);
      const y = px(g3.mountM);
      mesh.position.set(X(d), y, Z(d));
      if (g3.shape === 'cyl') {
        // Κάμερα: ο άξονας κοιτά προς την κατεύθυνσή της, με κλίση προς τα κάτω.
        const a = (d.angle * Math.PI) / 180;
        mesh.lookAt(new THREE.Vector3(X(d) + Math.cos(a), y - 0.35, Z(d) + Math.sin(a)));
        mesh.rotateX(Math.PI / 2);
      }
      c.net.add(mesh);
      // Λεπτός οδηγός από το δάπεδο ως τη συσκευή — δείχνει τη θέση στην κάτοψη.
      if (g3.mountM > 0.6) c.net.add(dotted([new THREE.Vector3(X(d), 0, Z(d)), new THREE.Vector3(X(d), y - sy / 2, Z(d))], meta.color, px(0.12)));
      const rangePx = d.rangeM > 0 ? px(d.rangeM) : 0;
      if (d.kind === 'ap' && rangePx) {
        const s = new THREE.Shape(); s.absarc(X(d), -Z(d), rangePx, 0, Math.PI * 2, false);
        c.net.add(flat(s, meta.color, sel ? 0.22 : 0.12));
      }
      if (d.kind === 'camera' && rangePx) {
        const wedge = cameraWedge(d, rangePx);
        c.net.add(flat(new THREE.Shape(wedge.map((p) => new THREE.Vector2(X(p), -Z(p)))), meta.color, sel ? 0.25 : 0.14));
        const ends = [wedge[1], wedge[wedge.length - 1]];
        for (const e of ends) c.net.add(dotted([new THREE.Vector3(X(d), y, Z(d)), new THREE.Vector3(X(e), px(0.01), Z(e))], meta.color, px(0.25)));
      }
    }
    // Καλώδια: στο ύψος όδευσης, με «κατέβασμα» ως τη συσκευή σε κάθε άκρο.
    const run = px(CABLE_RUN_M);
    for (const k of cables) {
      const color = CABLE_META[k.kind].color;
      const drop = (id: string | null) => { const d = id ? byId.get(id) : null; return d ? px(DEVICE_3D[d.kind].mountM) : null; };
      const pts = k.pts.map((p) => new THREE.Vector3(X(p), run, Z(p)));
      const a = drop(k.from), b = drop(k.to);
      if (a != null) pts.unshift(new THREE.Vector3(pts[0].x, a, pts[0].z));
      if (b != null) { const l = pts[pts.length - 1]; pts.push(new THREE.Vector3(l.x, b, l.z)); }
      c.net.add(dotted(pts, color, px(k.kind === 'network' ? 0.18 : 0.11)));
    }
  }, [devices, cables, selectedDeviceId, mPerPx, w, h, image]);

  const kinds = [...new Set(devices.map((d) => d.kind))];
  const unplaced = rooms.reduce((s, r) => s + (r.walls?.on ? r.walls.openings.filter((o) => !o.at).length : 0), 0);
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: BG }}>
      <div ref={host} className="absolute inset-0" style={{ cursor: 'grab' }} />
      <div className="pointer-events-none absolute bottom-3 left-3 max-w-[min(26rem,calc(100%-1.5rem))] space-y-1 rounded-lg border border-slate-700/80 bg-slate-900/85 px-3 py-2 text-(length:--fs-11) text-slate-200 backdrop-blur-sm">
        <p>Σύρε για περιστροφή · δεξί κλικ / δύο δάχτυλα για μετακίνηση · ροδέλα για zoom</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-slate-200" aria-hidden />τοίχος ως {String(CEILING_M).replace('.', ',')} m</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm" style={{ background: 'linear-gradient(90deg,#38BDF8,#34D399,#F472B6)' }} aria-hidden />ζώνη πλακιδίων (χρώμα χώρου)</span>
        </p>
        {kinds.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {kinds.map((k) => <span key={k} className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: DEVICE_META[k].color }} aria-hidden />{DEVICE_META[k].short} · {String(DEVICE_3D[k].mountM).replace('.', ',')} m</span>)}
            {cables.some((k) => k.kind === 'power') && <span className="inline-flex items-center gap-1"><span className="h-0 w-4 border-t-2 border-dotted" style={{ borderColor: CABLE_META.power.color }} aria-hidden />ρεύμα</span>}
            {cables.some((k) => k.kind === 'network') && <span className="inline-flex items-center gap-1"><span className="h-0 w-4 border-t-2 border-dotted" style={{ borderColor: CABLE_META.network.color }} aria-hidden />δίκτυο</span>}
          </p>
        )}
        {unplaced > 0 && <p className="text-amber-300">{unplaced} άνοιγμα{unplaced === 1 ? '' : 'τα'} χωρίς θέση στο σχέδιο δεν φαίνε{unplaced === 1 ? 'ται' : 'ονται'} — σχεδίασέ τα με το εργαλείο «Άνοιγμα».</p>}
      </div>
    </div>
  );
}
