'use client';

// «Εικόνα» κάθε μονάδας μέτρησης — για να καταλαβαίνει κανείς με μια ματιά τι σημαίνει
// (παλέτα, κιβώτιο, container, σακί, τ.μ., τεμάχιο, μέτρο, λίτρο). Οι μικρογραφίες αποδίδονται
// ΜΙΑ φορά από ΕΝΑΝ κοινό offscreen renderer και κρατιούνται ως εικόνες (όχι δεκάδες WebGL contexts).
import * as React from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FiClock, FiTool } from 'react-icons/fi';
import { cn } from '@/lib/utils';
import { buildScene } from './container-scene';
import { createBox, createMaterials, createPallet, createSack, createSlab } from './scene3d/models';

export type UnitVisualKind = 'container' | 'pallet' | 'box' | 'sack' | 'sqm' | 'piece' | 'meter' | 'liter' | 'hour' | 'service';

export const UNIT_VISUAL_LABEL: Record<UnitVisualKind, string> = {
  container: 'Container', pallet: 'Παλέτα', box: 'Κιβώτιο', sack: 'Σακί', sqm: 'Τετραγωνικό μέτρο',
  piece: 'Τεμάχιο', meter: 'Μέτρο (μήκος)', liter: 'Λίτρο', hour: 'Ώρα', service: 'Υπηρεσία',
};

const strip = (s: string) => s.toLocaleLowerCase('el').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Τι «είναι» μια μονάδα, από τη σύντμηση / την περιγραφή / τον διεθνή κωδικό. */
export function inferUnitVisual(u: { shortcut?: string | null; name?: string | null; interCode?: string | null }): UnitVisualKind {
  const t = strip(`${u.shortcut ?? ''} ${u.name ?? ''} ${u.interCode ?? ''}`);
  if (/cont/.test(t)) return 'container';
  if (/παλ|pal/.test(t)) return 'pallet';
  if (/κιβ|κουτ|box|συσκ/.test(t)) return 'box';
  if (/σακ|sack|bag|κιλ|kg|κγρ/.test(t)) return 'sack';
  if (/τετραγ|m²|m2|μετ²|τ\.?μ/.test(t)) return 'sqm';
  if (/λιτ|λτ|lt|ltr/.test(t)) return 'liter';
  if (/ωρ|hour|hr/.test(t)) return 'hour';
  if (/υπηρ|παρ\b|service/.test(t)) return 'service';
  if (/μετρ|μ\.?$|\bm\b/.test(t)) return 'meter';
  return 'piece';
}

/** Ετικέτα διάστασης («1 m») ως sprite — διαβάζεται από κάθε γωνία. */
function label(text: string, scale: number) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 96;
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(15,23,42,0.88)';
  g.beginPath(); g.roundRect(8, 12, 240, 72, 18); g.fill();
  g.fillStyle = '#ffffff'; g.font = 'bold 48px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 50);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  sp.scale.set(scale, scale * 0.375, 1);
  return { sp, dispose() { t.dispose(); sp.material.dispose(); } };
}
/** Γραμμή διάστασης με «φρυδάκια» στα άκρα. */
function dimLine(a: THREE.Vector3, b: THREE.Vector3, tick: THREE.Vector3) {
  const pts = [a, b, a.clone().add(tick), a.clone().sub(tick), b.clone().add(tick), b.clone().sub(tick)];
  const geo = new THREE.BufferGeometry().setFromPoints([pts[0], pts[1], pts[2], pts[3], pts[4], pts[5]]);
  const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#0f172a' }));
  return { line, dispose() { geo.dispose(); (line.material as THREE.Material).dispose(); } };
}

// ── Κοινός renderer μικρογραφιών ────────────────────────────────────────────────────────────
const SIZE = 256;
const cache = new Map<UnitVisualKind, Promise<string>>();
let shared: { renderer: THREE.WebGLRenderer; env: THREE.Texture } | null = null;

function getRenderer() {
  if (shared) return shared;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  shared = { renderer, env };
  return shared;
}

/** Χτίζει τη σκηνή ενός τύπου, κάνει κάδρο στο περιεχόμενο και επιστρέφει PNG data URL. */
function renderThumb(kind: UnitVisualKind): string {
  const { renderer, env } = getRenderer();
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.environmentIntensity = 0.6;
  scene.add(new THREE.HemisphereLight('#f4f7ff', '#b7a183', 0.5));
  const sun = new THREE.DirectionalLight('#fff4e2', 2.4);
  sun.position.set(3, 6, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const mats = createMaterials();
  const disposers: (() => void)[] = [() => mats.dispose()];
  const content = new THREE.Group();
  scene.add(content);

  const add = (o: { dispose: () => void }, obj: THREE.Object3D) => { content.add(obj); disposers.push(() => o.dispose()); };
  switch (kind) {
    case 'container': {
      const built = buildScene(scene, 6, 6, { kind: 'boxes', slab: { l: 0.6, w: 0.4, t: 0.02 }, perPallet: 1 });
      disposers.push(() => built.dispose());
      break;
    }
    case 'pallet': { const p = createPallet(mats); p.group.rotation.y = -0.35; add(p, p.group); break; }
    case 'box': { const b = createBox(mats); add(b, b.mesh); break; }
    case 'sack': {
      const s1 = createSack(mats); add(s1, s1.mesh);
      const s2 = createSack(mats); s2.mesh.position.set(0.04, 0.105, 0.02); s2.mesh.rotation.y = 0.12; add(s2, s2.mesh);
      break;
    }
    case 'sqm': {
      // 1 τ.μ. = 2 × 2 πλάκες 50 × 50 εκ. με αρμό, πάνω σε λεπτή βάση.
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const s = createSlab(mats, { l: 0.495, w: 0.495, t: 0.02 }); s.mesh.position.set(-0.25 + i * 0.5, 0.01, -0.25 + j * 0.5); add(s, s.mesh);
      }
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.01, 1.04), new THREE.MeshStandardMaterial({ color: '#9aa1aa', roughness: 0.9 }));
      base.position.y = -0.005; base.receiveShadow = true;
      add({ dispose() { base.geometry.dispose(); (base.material as THREE.Material).dispose(); } }, base);
      const t = new THREE.Vector3(0, 0, 0.03);
      const d1 = dimLine(new THREE.Vector3(-0.5, 0.03, 0.62), new THREE.Vector3(0.5, 0.03, 0.62), t); add(d1, d1.line);
      const d2 = dimLine(new THREE.Vector3(0.62, 0.03, -0.5), new THREE.Vector3(0.62, 0.03, 0.5), new THREE.Vector3(0.03, 0, 0)); add(d2, d2.line);
      const l1 = label('1 m', 0.62); l1.sp.position.set(0, 0.12, 0.72); add(l1, l1.sp);
      const l2 = label('1 m', 0.62); l2.sp.position.set(0.75, 0.12, 0); add(l2, l2.sp);
      break;
    }
    case 'piece': { const s = createSlab(mats, { l: 0.6, w: 0.4, t: 0.03 }); s.mesh.rotation.y = 0.3; add(s, s.mesh); break; }
    case 'meter': {
      const s = createSlab(mats, { l: 1.0, w: 0.12, t: 0.04 }); add(s, s.mesh);
      const d = dimLine(new THREE.Vector3(-0.5, 0.06, 0.14), new THREE.Vector3(0.5, 0.06, 0.14), new THREE.Vector3(0, 0, 0.03)); add(d, d.line);
      const l = label('1 m', 0.52); l.sp.position.set(0, 0.2, 0.18); add(l, l.sp);
      break;
    }
    case 'liter': {
      const prof = [[0, 0], [0.13, 0], [0.15, 0.3], [0.155, 0.31], [0.14, 0.31]].map(([x, y]) => new THREE.Vector2(x, y));
      const geo = new THREE.LatheGeometry(prof, 40);
      const bucket = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#e7eaee', roughness: 0.45, side: THREE.DoubleSide }));
      bucket.castShadow = true;
      const hg = new THREE.TorusGeometry(0.15, 0.006, 8, 40, Math.PI);
      const handle = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ color: '#5b6470', metalness: 0.6, roughness: 0.4 }));
      handle.position.y = 0.31; handle.rotation.y = Math.PI / 2;
      add({ dispose() { geo.dispose(); hg.dispose(); } }, bucket); content.add(handle);
      break;
    }
    default: break;
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.2 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.001; ground.receiveShadow = true;
  if (kind !== 'container') scene.add(ground);

  // Κάδρο: η σφαίρα που περικλείει το περιεχόμενο, από ψηλά-πλάγια.
  const box = new THREE.Box3().setFromObject(kind === 'container' ? scene : content);
  if (kind === 'container') box.set(new THREE.Vector3(-3.03, 0, -1.22), new THREE.Vector3(3.03, 2.59, 1.22));
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(15)) * 1.02;
  camera.position.copy(sphere.center).add(new THREE.Vector3(0.75, 0.62, 1).normalize().multiplyScalar(dist));
  camera.lookAt(sphere.center);
  sun.position.copy(sphere.center).add(new THREE.Vector3(2, 5, 3).multiplyScalar(sphere.radius));
  sun.target.position.copy(sphere.center); scene.add(sun.target);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -sphere.radius * 2; sc.right = sphere.radius * 2; sc.top = sphere.radius * 2; sc.bottom = -sphere.radius * 2; sc.far = sphere.radius * 20;
  sc.updateProjectionMatrix();

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  ground.geometry.dispose(); (ground.material as THREE.Material).dispose();
  for (const d of disposers) d();
  return url;
}

function thumb(kind: UnitVisualKind): Promise<string> {
  let p = cache.get(kind);
  if (!p) {
    // Απόδοση εκτός της τρέχουσας εργασίας (δεν μπλοκάρει το άνοιγμα της φόρμας).
    p = new Promise((res, rej) => setTimeout(() => { try { res(renderThumb(kind)); } catch (e) { rej(e); } }, 0));
    cache.set(kind, p);
  }
  return p;
}

/** Μικρογραφία μονάδας. `hour`/`service` = εικονίδιο (δεν έχουν «σχήμα»). */
export function UnitThumb({ kind, size = 40, className, title }: { kind: UnitVisualKind; size?: number; className?: string; title?: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  const iconOnly = kind === 'hour' || kind === 'service';
  React.useEffect(() => {
    if (iconOnly) return;
    let alive = true;
    thumb(kind).then((u) => { if (alive) setUrl(u); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [kind, iconOnly]);
  const label = title ?? UNIT_VISUAL_LABEL[kind];
  const box = cn('inline-grid shrink-0 place-items-center overflow-hidden rounded-md bg-gradient-to-b from-white to-slate-100 ring-1 ring-border dark:from-slate-700 dark:to-slate-800', className);
  if (iconOnly || failed) {
    const Icon = kind === 'hour' ? FiClock : FiTool;
    return <span className={box} style={{ width: size, height: size }} title={label} role="img" aria-label={label}><Icon className="size-1/2 text-muted-foreground" aria-hidden /></span>;
  }
  return (
    <span className={box} style={{ width: size, height: size }} title={label}>
      {url
        ? <img src={url} alt={label} width={size} height={size} className="size-full object-contain" />
        : <span className="size-full animate-pulse bg-muted motion-reduce:animate-none" aria-label={`Φόρτωση: ${label}`} />}
    </span>
  );
}
