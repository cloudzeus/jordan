'use client';

// Προβολή 3D της κάτοψης (three.js): το σχέδιο στο δάπεδο, οι χώροι χρωματιστοί, τοίχοι ως το ταβάνι με
// τη ζώνη πλακιδίων στο χρώμα του χώρου και τα σχεδιασμένα ανοίγματα (πόρτες/παράθυρα) κομμένα.
// Μόνο προβολή — οι αλλαγές γίνονται στο 2D.
import * as React from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RoomWalls } from '@/lib/floorplan/walls';
import { wallPieces } from '@/lib/floorplan/walls3d';

type Pt = { x: number; y: number };
export type Room3d = { id: string; name: string; color: string; polygon: Pt[]; walls?: RoomWalls };
/** Εικόνα (PNG) της τρέχουσας προβολής — για αποθήκευση μαζί με τη χαρτογράφηση. */
export type Plan3dHandle = { capture: () => Promise<Blob | null> };

const BG = '#0B1220';
const CEILING_M = 2.8;
const WALL_T_M = 0.1;

export function Plan3d({ image, w, h, mPerPx, rooms, selectedId, ref }: {
  image: HTMLCanvasElement; w: number; h: number; mPerPx: number; rooms: Room3d[]; selectedId: string | null;
  ref?: React.Ref<Plan3dHandle>;
}) {
  const host = React.useRef<HTMLDivElement | null>(null);
  const ctx = React.useRef<{ scene: THREE.Scene; group: THREE.Group; snap: () => Promise<Blob | null> } | null>(null);
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
    const snap = () => new Promise<Blob | null>((res) => {
      renderer.render(scene, camera);
      renderer.domElement.toBlob((b) => res(b), 'image/png');
    });
    ctx.current = { scene, group, snap };

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
        {unplaced > 0 && <p className="text-amber-300">{unplaced} άνοιγμα{unplaced === 1 ? '' : 'τα'} χωρίς θέση στο σχέδιο δεν φαίνε{unplaced === 1 ? 'ται' : 'ονται'} — σχεδίασέ τα με το εργαλείο «Άνοιγμα».</p>}
      </div>
    </div>
  );
}
