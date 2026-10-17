'use client';

// Ρεαλιστική 3D αναπαράσταση «Container → Παλέτες → πλάκες πέτρας / κιβώτια» με three.js.
// Θα φαίνεται και σε πελάτες (B2B), οπότε στόχος είναι η φωτορεαλιστική εικόνα:
//  • φωτισμός με περιβάλλον (IBL από RoomEnvironment) + ήλιος με απαλές σκιές, ACES tone mapping·
//  • container ISO με ΠΡΑΓΜΑΤΙΚΗ τραπεζοειδή αυλάκωση, γωνιακά χυτά, πόρτες με ράβδους κλειδώματος,
//    κομμένο (χωρίς οροφή και μπροστινή μακριά πλευρά) για να φαίνεται το φορτίο·
//  • παλέτες με νερά ξύλου, ρόζους και καρφιά· τραβερτίνης με στρώσεις και πόρους (bump)·
//    κιβώτια kraft με ταινία, ετικέτα και «FRAGILE»·
//  • ΣΤΑΘΕΡΟ seed: η ίδια παραγγελία δείχνει πάντα την ίδια εικόνα.
// Όλα διαδικαστικά (καμία εξωτερική φόρτωση) — InstancedMesh για τα επαναλαμβανόμενα κομμάτια.
import * as React from 'react';
import { FiMaximize2, FiMinimize2 } from 'react-icons/fi';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SACK, sackGeometry, sackTexture } from './scene3d/models';
import { boxSideTexture, boxTopTexture, canvas, floorTexture, rng, tex, travertineTextures, woodTextures } from './scene3d/materials';

export type ContainerSceneProps = {
  /** Παλέτες ανά container (μπορεί να είναι δεκαδικός — σχεδιάζονται οι ακέραιες). */
  pallets: number;
  /** Βασικές μονάδες ανά παλέτα (π.χ. 52 τ.μ.). */
  perPallet: number;
  labels: { container: string; pallet: string; base: string };
  /**
   * Πόσες παλέτες είναι ΓΕΜΑΤΕΣ (προεπιλογή: όλες). Οι υπόλοιπες σχεδιάζονται ως διάφανες κενές
   * θέσεις — για την τιμή «όσο γεμίζει το container, τόσο πέφτει η τιμή».
   */
  filled?: number;
  /** Φορτίο πάνω στην παλέτα: κιβώτια (πλακάκια) ή πλάκες πέτρας στοιβαγμένες. */
  load?: 'boxes' | 'stones' | 'sacks';
  /** Διαστάσεις πλάκας πέτρας σε ΜΕΤΡΑ (από το SoftOne: Διάσταση 1/2/3). Λείπει ⇒ 60×40×2 εκ. */
  slab?: { l: number; w: number; t: number } | null;
  /** Ύψος καμβά (CSS κλάση). */
  heightClass?: string;
  /** Κουμπί πλήρους οθόνης (false στο ίδιο το παράθυρο πλήρους οθόνης). */
  expandable?: boolean;
  className?: string;
};

type Slab = { l: number; w: number; t: number };
type Load = { kind: 'boxes' | 'stones' | 'sacks'; slab: Slab; perPallet: number };
const DEFAULT_SLAB: Slab = { l: 0.6, w: 0.4, t: 0.02 };

// ── Διαστάσεις (μέτρα) ──────────────────────────────────────────────────────────────────────
const PALLET = { x: 1.2, z: 1.0, h: 0.144 };
const BOX = { x: 0.38, y: 0.26, z: 0.31 };
const BOX_GRID = { x: 3, z: 3, y: 3 };
const LOAD_H = PALLET.h + BOX.y * BOX_GRID.y;
const CONTAINERS = {
  '20ft': { L: 6.06, W: 2.44, H: 2.59 },
  '40ft': { L: 12.19, W: 2.44, H: 2.59 },
} as const;
// Σημάνσεις ISO 6346 / CSC ανά τύπο (τυπικές τιμές dry van).
const SPECS = {
  '20ft': { type: '22G1', maxGross: 30480, tare: 2130, cuCap: 33.2 },
  '40ft': { type: '42G1', maxGross: 30480, tare: 3750, cuCap: 67.7 },
} as const;
const OWNER = { prefix: 'MRBU', serial: '200125', check: '8' };
const CORR = { pitch: 0.278, depth: 0.036, flat: 0.07, slope: 0.035 }; // ISO αυλάκωση
const WALL = CORR.depth + 0.004;

/**
 * Διάταξη πλακών σε μία παλέτα: όσες χωρούν ανά στρώση (με τον καλύτερο προσανατολισμό) και όσες
 * στρώσεις χρειάζονται για τα τ.μ. της παλέτας — με ανώτατο ύψος στοίβας ίδιο με των κιβωτίων.
 */
export function stoneStack(slab: Slab, sqmPerPallet: number) {
  const fit = (a: number, b: number) => ({ nx: Math.max(1, Math.floor(PALLET.x / a)), nz: Math.max(1, Math.floor(PALLET.z / b)), a, b });
  const o1 = fit(slab.l, slab.w);
  const o2 = fit(slab.w, slab.l);
  const o = o1.nx * o1.nz >= o2.nx * o2.nz ? o1 : o2;
  const perLayer = o.nx * o.nz;
  const sqmPerLayer = perLayer * slab.l * slab.w;
  const needed = sqmPerPallet > 0 ? Math.ceil(sqmPerPallet / sqmPerLayer) : 10;
  const maxLayers = Math.max(1, Math.floor((BOX.y * BOX_GRID.y) / (slab.t + 0.003)));
  return { ...o, perLayer, layers: Math.min(needed, maxLayers), neededLayers: needed, capped: needed > maxLayers };
}

export function containerLayout(pallets: number) {
  const n = Math.max(0, Math.floor(pallets));
  const perLayerOf = (s: keyof typeof CONTAINERS) => Math.floor((CONTAINERS[s].L - 2 * WALL - 0.1) / (PALLET.x + 0.05)) * 2;
  // Πέτρα/πλακάκι = βαρύ φορτίο: ΜΙΑ στρώση όσο χωράει (20ft έως 8, 40ft έως 18)· στοίβαξη μόνο πέρα από αυτό.
  const size: keyof typeof CONTAINERS = n <= perLayerOf('20ft') ? '20ft' : '40ft';
  const c = CONTAINERS[size];
  const perLayer = perLayerOf(size); // δύο σειρές κατά το πλάτος (2 × 1,0 m)
  const layers = Math.floor((c.H - 0.2) / (LOAD_H + 0.04));
  const capacity = perLayer * layers;
  const shown = Math.min(n, capacity);
  const slots: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < shown; i++) {
    const layer = Math.floor(i / perLayer);
    const j = i % perLayer;
    const row = j % 2;
    const col = Math.floor(j / 2);
    slots.push({
      // Φόρτωση από το βάθος (μετωπικός τοίχος) προς τις πόρτες, όπως στην πράξη.
      x: -c.L / 2 + WALL + 0.08 + PALLET.x / 2 + col * (PALLET.x + 0.05),
      y: 0.12 + layer * (LOAD_H + 0.04),
      z: (row === 0 ? -1 : 1) * (PALLET.z / 2 + 0.06),
    });
  }
  return { size, c, slots, hidden: n - shown };
}

// ── Γεωμετρίες ──────────────────────────────────────────────────────────────────────────────
/**
 * Τοίχωμα με τραπεζοειδή αυλάκωση ISO: ΛΑΜΑΡΙΝΑ πάχους 2 mm που ακολουθεί το προφίλ και στις δύο
 * όψεις (όπως το πραγματικό container — αυλακωτό μέσα και έξω). Εξώθηση κατά το ύψος.
 */
function corrugatedWall(length: number, height: number) {
  const { pitch, depth, flat, slope } = CORR;
  const T = 0.002;
  const half = (pitch - 2 * flat - 2 * slope) / 2 + flat; // επίπεδο «κοιλότητας»
  const wave: [number, number][] = [[-length / 2, 0]];
  for (let x = -length / 2; x < length / 2 - 1e-6; x += pitch) {
    for (const [px, py] of [[x + half, 0], [x + half + slope, depth], [x + half + slope + flat, depth], [x + half + 2 * slope + flat, 0], [x + pitch, 0]] as [number, number][]) {
      if (px <= length / 2) wave.push([px, py]);
    }
  }
  if (wave[wave.length - 1][0] < length / 2) wave.push([length / 2, 0]);
  const s = new THREE.Shape();
  s.moveTo(wave[0][0], wave[0][1]);
  for (const [x, y] of wave.slice(1)) s.lineTo(x, y);
  for (const [x, y] of [...wave].reverse()) s.lineTo(x, y - T);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false, steps: 1, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2); // το ύψος γίνεται άξονας y
  return geo;
}

// ── Σημάνσεις (decals) ──────────────────────────────────────────────────────────────────────
const kg = (n: number) => n.toLocaleString('en-US');
const lbs = (n: number) => Math.round(n * 2.20462).toLocaleString('en-US');
/** Σημάνσεις πόρτας: κωδικός ιδιοκτήτη + check digit σε πλαίσιο, τύπος, πίνακας βαρών/όγκου. */
function doorMarkings(size: keyof typeof SPECS) {
  const sp = SPECS[size];
  const { cv, g } = canvas(512, 900);
  g.fillStyle = '#1b1d21'; g.textBaseline = 'top';
  g.font = '600 58px "Arial Narrow", Arial, sans-serif';
  g.fillText(OWNER.prefix, 30, 40);
  g.fillText(OWNER.serial, 230, 40);
  g.lineWidth = 4; g.strokeStyle = '#1b1d21'; g.strokeRect(428, 38, 44, 62); g.fillText(OWNER.check, 436, 40);
  g.fillText(sp.type, 230, 118);
  g.font = '600 40px "Arial Narrow", Arial, sans-serif';
  const rows: [string, string, string][] = [
    ['MAX. GR.', `${kg(sp.maxGross)} KGS`, `${lbs(sp.maxGross)} LBS`],
    ['TARE', `${kg(sp.tare)} KGS`, `${lbs(sp.tare)} LBS`],
    ['NET', `${kg(sp.maxGross - sp.tare)} KGS`, `${lbs(sp.maxGross - sp.tare)} LBS`],
    ['CU. CAP.', `${sp.cuCap} CU.M`, `${Math.round(sp.cuCap * 35.3147).toLocaleString('en-US')} CU.FT`],
  ];
  rows.forEach(([k, a, b], i) => {
    const y = 330 + i * 120;
    g.font = '600 40px "Arial Narrow", Arial, sans-serif'; g.fillText(k, 30, y);
    g.font = '600 30px "Arial Narrow", Arial, sans-serif'; g.fillText(a, 270, y); g.fillText(b, 270, y + 38);
  });
  const t = tex(cv); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
/** Μεγάλη σήμανση (κάθετη ή οριζόντια) για τοίχους: κωδικός ιδιοκτήτη + τύπος. */
function bigCode(size: keyof typeof SPECS, vertical: boolean) {
  const sp = SPECS[size];
  const w = vertical ? 160 : 1024; const h = vertical ? 1024 : 200;
  const { cv, g } = canvas(w, h);
  g.fillStyle = '#1b1d21'; g.font = '700 62px "Arial Narrow", Arial, sans-serif'; g.textBaseline = 'top';
  if (vertical) {
    const chars = `${OWNER.prefix}${OWNER.serial}${OWNER.check}`.split('');
    chars.forEach((ch, i) => g.fillText(ch, 20, 20 + i * 72));
    sp.type.split('').forEach((ch, i) => g.fillText(ch, 95, 20 + i * 72));
  } else {
    g.fillText(`${OWNER.prefix} ${OWNER.serial}`, 30, 30);
    g.lineWidth = 5; g.strokeStyle = '#1b1d21'; g.strokeRect(470, 26, 50, 72); g.fillText(OWNER.check, 478, 30);
    g.fillText(sp.type, 560, 30);
  }
  const t = tex(cv); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
/** Πινακίδα CSC (έγκριση ασφαλείας): ανάγλυφη αλουμινένια πλάκα. */
function cscPlate() {
  const { cv, g } = canvas(256, 200);
  g.fillStyle = '#b9bec4'; g.fillRect(0, 0, 256, 200);
  g.strokeStyle = '#6b7178'; g.lineWidth = 4; g.strokeRect(4, 4, 248, 192);
  g.fillStyle = '#3d4248'; g.font = 'bold 30px Arial'; g.fillText('CSC SAFETY', 30, 44); g.fillText('APPROVAL', 46, 80);
  g.font = '16px Arial';
  ['GR-ACEP-1-12', 'DATE MANUFACTURED 03/2021', `MAX GROSS 30480 KG`, 'ALLOW. STACK 192000 KG'].forEach((l, i) => g.fillText(l, 22, 112 + i * 22));
  return tex(cv);
}

// ── Σκηνή ───────────────────────────────────────────────────────────────────────────────────
export function buildScene(scene: THREE.Scene, pallets: number, filled: number, load: Load) {
  const { c, slots } = containerLayout(pallets);
  const R = rng(1234);
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T) => { disposables.push(x); return x; };
  const group = new THREE.Group();
  scene.add(group);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);

  // Έδαφος που δέχεται μόνο σκιά (διάφανο — δένει με το φόντο της σελίδας).
  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(60, 60)), track(new THREE.ShadowMaterial({ opacity: 0.22 })));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  group.add(ground);

  // ── Container ──
  const paint = track(new THREE.MeshStandardMaterial({ color: '#eef0f2', roughness: 0.48, metalness: 0.35, side: THREE.DoubleSide }));
  const frame = track(new THREE.MeshStandardMaterial({ color: '#d5d9de', roughness: 0.4, metalness: 0.45 }));
  const castMat = track(new THREE.MeshStandardMaterial({ color: '#9aa1aa', roughness: 0.55, metalness: 0.6 }));
  const floorMat = track(new THREE.MeshStandardMaterial({ map: track(floorTexture(c.L)), roughness: 0.78 }));

  const floor = new THREE.Mesh(track(new THREE.BoxGeometry(c.L, 0.12, c.W)), [frame, frame, floorMat, frame, frame, frame]);
  floor.position.y = 0.06; floor.receiveShadow = true; floor.castShadow = true;
  group.add(floor);

  const back = new THREE.Mesh(track(corrugatedWall(c.L - 0.2, c.H - 0.24)), paint);
  back.position.set(0, 0.12, -c.W / 2 + 0.02); back.rotation.y = Math.PI; // αυλάκωση προς τα έξω
  back.castShadow = true; back.receiveShadow = true;
  group.add(back);

  const front = new THREE.Mesh(track(corrugatedWall(c.W - 0.2, c.H - 0.24)), paint); // μετωπικός τοίχος (βάθος)
  front.rotation.y = Math.PI / 2; front.position.set(-c.L / 2 + 0.02, 0.12, 0);
  front.castShadow = true; front.receiveShadow = true;
  group.add(front);

  // Πόρτες (πλευρά προς την κάμερα): δύο φύλλα, 4 ράβδοι κλειδώματος, λαβές.
  const doorGeo = track(corrugatedWall((c.W - 0.24) / 2, c.H - 0.3));
  for (const sz of [-1, 1]) {
    const leaf = new THREE.Mesh(doorGeo, paint);
    leaf.rotation.y = -Math.PI / 2;
    leaf.position.set(c.L / 2 - 0.02, 0.15, sz * (c.W - 0.24) / 4);
    leaf.castShadow = true; leaf.receiveShadow = true;
    group.add(leaf);
  }
  const rodGeo = track(new THREE.CylinderGeometry(0.016, 0.016, c.H - 0.34, 12));
  const handleGeo = track(new THREE.BoxGeometry(0.03, 0.03, 0.22));
  const rods = new THREE.InstancedMesh(rodGeo, castMat, 4);
  const handles = new THREE.InstancedMesh(handleGeo, castMat, 4);
  [-0.88, -0.32, 0.32, 0.88].forEach((f, i) => {
    rods.setMatrixAt(i, m.makeTranslation(c.L / 2 + 0.035, c.H / 2, f * (c.W / 2 - 0.12)));
    handles.setMatrixAt(i, m.makeTranslation(c.L / 2 + 0.06, c.H * 0.42, f * (c.W / 2 - 0.12) + 0.1));
  });
  rods.castShadow = true; handles.castShadow = true;
  group.add(rods, handles);

  // Σημάνσεις: πάνω στις πόρτες (εξωτερικά), μεγάλος κωδικός στον μετωπικό τοίχο, κάθετος στη γωνία.
  const size = (c.L > 8 ? '40ft' : '20ft') as keyof typeof SPECS;
  const decalMat = (t: THREE.Texture) => track(new THREE.MeshStandardMaterial({
    map: track(t), transparent: true, roughness: 0.5, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -4,
  }));
  const doorDecal = new THREE.Mesh(track(new THREE.PlaneGeometry(0.62, 1.09)), decalMat(doorMarkings(size)));
  doorDecal.rotation.y = Math.PI / 2;
  doorDecal.position.set(c.L / 2 + 0.042, c.H * 0.6, -(c.W - 0.24) / 4 + 0.05);
  group.add(doorDecal);
  const csc = new THREE.Mesh(track(new THREE.PlaneGeometry(0.2, 0.156)), track(new THREE.MeshStandardMaterial({ map: track(cscPlate()), roughness: 0.35, metalness: 0.7, polygonOffset: true, polygonOffsetFactor: -4 })));
  csc.rotation.y = Math.PI / 2;
  csc.position.set(c.L / 2 + 0.043, c.H * 0.36, (c.W - 0.24) / 4);
  group.add(csc);
  const endCode = new THREE.Mesh(track(new THREE.PlaneGeometry(1.6, 0.31)), decalMat(bigCode(size, false)));
  endCode.rotation.y = -Math.PI / 2;
  endCode.position.set(-c.L / 2 - 0.022, c.H * 0.82, 0);
  group.add(endCode);
  const sideCode = new THREE.Mesh(track(new THREE.PlaneGeometry(0.2, 1.28)), decalMat(bigCode(size, true)));
  // Πάνω στον γωνιακό ορθοστάτη της πλευράς των θυρών (εξωτερική όψη προς +z).
  sideCode.position.set(c.L / 2 - 0.075, c.H * 0.6, c.W / 2 + 0.0015);
  sideCode.scale.set(0.62, 0.85, 1);
  group.add(sideCode);

  // Σκελετός: ορθοστάτες, κάτω/πάνω δοκάρια (το πάνω-μπροστά μένει: «κομμένο», αλλά αναγνωρίσιμο σχήμα).
  const post = track(new THREE.BoxGeometry(0.15, c.H, 0.15));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = new THREE.Mesh(post, frame); p.position.set(sx * (c.L / 2 - 0.075), c.H / 2, sz * (c.W / 2 - 0.075)); p.castShadow = true; group.add(p);
  }
  const railL = track(new THREE.BoxGeometry(c.L, 0.16, 0.12));
  const railW = track(new THREE.BoxGeometry(0.12, 0.16, c.W));
  for (const [y, sz] of [[0.08, -1], [0.08, 1], [c.H - 0.08, -1], [c.H - 0.08, 1]] as const) {
    const r = new THREE.Mesh(railL, frame); r.position.set(0, y, sz * (c.W / 2 - 0.06)); r.castShadow = true; r.receiveShadow = true; group.add(r);
  }
  for (const [y, sx] of [[0.08, -1], [0.08, 1], [c.H - 0.08, -1], [c.H - 0.08, 1]] as const) {
    const r = new THREE.Mesh(railW, frame); r.position.set(sx * (c.L / 2 - 0.06), y, 0); r.castShadow = true; group.add(r);
  }
  const castGeo = track(new THREE.BoxGeometry(0.18, 0.12, 0.17));
  const casts = new THREE.InstancedMesh(castGeo, castMat, 8);
  let ci = 0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0.06, c.H - 0.06]) casts.setMatrixAt(ci++, m.makeTranslation(sx * (c.L / 2 - 0.09), y, sz * (c.W / 2 - 0.085)));
  casts.castShadow = true;
  group.add(casts);
  // Οβάλ ανοίγματα στα γωνιακά χυτά (πάνω και πλάγια): σκούρες «τρύπες».
  const holeMat = track(new THREE.MeshBasicMaterial({ color: '#2a2e33' }));
  const holeGeo = track(new THREE.CircleGeometry(0.03, 16));
  const holes = new THREE.InstancedMesh(holeGeo, holeMat, 16);
  let hi = 0;
  const sxScale = new THREE.Vector3(1.5, 1, 1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0.06, c.H - 0.06]) {
    // πλάγια όψη (προς ±z)
    q.setFromEuler(new THREE.Euler(0, sz > 0 ? 0 : Math.PI, 0));
    holes.setMatrixAt(hi++, m.compose(new THREE.Vector3(sx * (c.L / 2 - 0.09), y, sz * (c.W / 2 - 0.085 + 0.0855)), q, sxScale));
    // μετωπική όψη (προς ±x)
    q.setFromEuler(new THREE.Euler(0, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 0));
    holes.setMatrixAt(hi++, m.compose(new THREE.Vector3(sx * (c.L / 2 - 0.09 + 0.0905), y, sz * (c.W / 2 - 0.085)), q, sxScale));
  }
  group.add(holes);

  // Κάτω διαδοκίδες (crossmembers) και θήκες περονοφόρου — φαίνονται σε χαμηλή γωνία.
  const crossGeo = track(new THREE.BoxGeometry(0.06, 0.1, c.W - 0.1));
  const nCross = Math.floor(c.L / 0.6);
  const cross = new THREE.InstancedMesh(crossGeo, castMat, nCross);
  for (let i = 0; i < nCross; i++) cross.setMatrixAt(i, m.makeTranslation(-c.L / 2 + 0.3 + i * (c.L - 0.6) / Math.max(1, nCross - 1), 0.0, 0));
  cross.castShadow = true;
  group.add(cross);

  // Κρίκοι πρόσδεσης (lashing rings) κατά μήκος του δαπέδου, στις δύο πλευρές.
  const ringGeo = track(new THREE.TorusGeometry(0.03, 0.007, 8, 18));
  const nRing = Math.floor(c.L / 1.0);
  const rings = new THREE.InstancedMesh(ringGeo, castMat, nRing * 2);
  let ri = 0;
  for (const sz of [-1, 1]) for (let i = 0; i < nRing; i++) {
    q.setFromEuler(new THREE.Euler(Math.PI / 2.4 * sz, 0, 0));
    rings.setMatrixAt(ri++, m.compose(new THREE.Vector3(-c.L / 2 + 0.5 + i * (c.L - 1) / Math.max(1, nRing - 1), 0.15, sz * (c.W / 2 - 0.13)), q, one));
  }
  group.add(rings);

  // Αεραγωγοί (vents) ψηλά στον πίσω τοίχο, κοντά στις γωνίες.
  const ventGeo = track(new THREE.BoxGeometry(0.18, 0.07, 0.03));
  const vents = new THREE.InstancedMesh(ventGeo, castMat, 2);
  vents.setMatrixAt(0, m.makeTranslation(-c.L / 2 + 0.45, c.H - 0.3, -c.W / 2 + 0.03));
  vents.setMatrixAt(1, m.makeTranslation(c.L / 2 - 0.45, c.H - 0.3, -c.W / 2 + 0.03));
  group.add(vents);

  // Μεντεσέδες πορτών (3 ανά φύλλο, στις εξωτερικές άκρες) και cam keepers στις άκρες των ράβδων.
  const hingeGeo = track(new THREE.BoxGeometry(0.05, 0.12, 0.07));
  const hinges = new THREE.InstancedMesh(hingeGeo, castMat, 6);
  let hg = 0;
  for (const sz of [-1, 1]) for (const y of [0.45, c.H / 2, c.H - 0.45]) hinges.setMatrixAt(hg++, m.makeTranslation(c.L / 2 + 0.03, y, sz * (c.W / 2 - 0.1)));
  const keeperGeo = track(new THREE.BoxGeometry(0.05, 0.07, 0.06));
  const keepers = new THREE.InstancedMesh(keeperGeo, castMat, 8);
  let kp = 0;
  for (const f of [-0.88, -0.32, 0.32, 0.88]) for (const y of [0.22, c.H - 0.22]) keepers.setMatrixAt(kp++, m.makeTranslation(c.L / 2 + 0.035, y, f * (c.W / 2 - 0.12)));
  hinges.castShadow = true; keepers.castShadow = true;
  group.add(hinges, keepers);

  // ── Παλέτες ──
  const full = slots.slice(0, Math.max(0, Math.min(slots.length, Math.floor(filled))));
  const empty = slots.slice(full.length);
  const woodTop = woodTextures(11, [0.045, 0.5, 0.955]);
  const woodSide = woodTextures(23, []);
  woodSide.map.rotation = Math.PI / 2; woodSide.bump.rotation = Math.PI / 2;
  woodSide.map.center.set(0.5, 0.5); woodSide.bump.center.set(0.5, 0.5);
  for (const t of [woodTop.map, woodTop.bump, woodSide.map, woodSide.bump]) track(t);
  const deckMat = track(new THREE.MeshStandardMaterial({ map: woodTop.map, bumpMap: woodTop.bump, bumpScale: 0.6, roughness: 0.86 }));
  const beamMat = track(new THREE.MeshStandardMaterial({ map: woodSide.map, bumpMap: woodSide.bump, bumpScale: 0.6, roughness: 0.88, color: '#efe2cf' }));
  const deckGeo = track(new RoundedBoxGeometry(0.135, 0.022, PALLET.z, 2, 0.003));
  const stringerGeo = track(new RoundedBoxGeometry(PALLET.x, 0.1, 0.09, 2, 0.004));
  const DECK = 7;
  const decks = new THREE.InstancedMesh(deckGeo, deckMat, Math.max(1, full.length * (DECK + 3)));
  const stringers = new THREE.InstancedMesh(stringerGeo, beamMat, Math.max(1, full.length * 3));
  decks.count = full.length * (DECK + 3); stringers.count = full.length * 3;
  let d = 0; let s = 0;
  for (const p of full) {
    for (let i = 0; i < DECK; i++) decks.setMatrixAt(d++, m.makeTranslation(p.x - PALLET.x / 2 + 0.0675 + i * ((PALLET.x - 0.135) / (DECK - 1)), p.y + PALLET.h - 0.011, p.z));
    for (const bx of [-0.5325, 0, 0.5325]) decks.setMatrixAt(d++, m.makeTranslation(p.x + bx, p.y + 0.011, p.z)); // σανίδες βάσης
    for (const z of [-0.455, 0, 0.455]) stringers.setMatrixAt(s++, m.makeTranslation(p.x, p.y + 0.072, p.z + z));
  }
  for (const im of [decks, stringers]) { im.castShadow = true; im.receiveShadow = true; group.add(im); }

  // ── Φορτίο ──
  const loaded: THREE.InstancedMesh[] = [];
  if (load.kind === 'sacks') {
    // Σακιά (κόλλες, τσιμέντο, κονιάματα): 4 ανά στρώση, 7 στρώσεις, εναλλάξ «δέσιμο» (κάθε δεύτερη
    // στρώση μετατοπισμένη/καθρεφτισμένη) όπως στοιβάζονται στην πράξη.
    const sackMat = track(new THREE.MeshStandardMaterial({ map: track(sackTexture()), roughness: 0.78 }));
    const geo = track(sackGeometry());
    const LAYERS = 7;
    const sacks = new THREE.InstancedMesh(geo, sackMat, Math.max(1, full.length * 4 * LAYERS));
    sacks.count = full.length * 4 * LAYERS;
    let k = 0;
    const lift = SACK.y * 0.82; // τα σακιά «κάθονται» το ένα μέσα στο άλλο
    for (const p of full) {
      for (let ly = 0; ly < LAYERS; ly++) {
        const flip = ly % 2 ? 1 : -1;
        for (let ix = 0; ix < 2; ix++) for (let iz = 0; iz < 2; iz++) {
          q.setFromAxisAngle(yAxis, (R() - 0.5) * 0.06 + (ly % 2 ? Math.PI : 0));
          pos.set(p.x + (ix - 0.5) * SACK.x + (R() - 0.5) * 0.015, p.y + PALLET.h + ly * lift, p.z + (iz - 0.5) * (SACK.z + 0.02) + flip * 0.03);
          sacks.setMatrixAt(k++, m.compose(pos, q, one));
        }
      }
    }
    loaded.push(sacks);
  } else if (load.kind === 'boxes') {
    const side = track(new THREE.MeshStandardMaterial({ map: track(boxSideTexture()), roughness: 0.92 }));
    const top = track(new THREE.MeshStandardMaterial({ map: track(boxTopTexture()), roughness: 0.85 }));
    const boxGeo = track(new RoundedBoxGeometry(BOX.x - 0.008, BOX.y - 0.004, BOX.z - 0.008, 2, 0.008));
    // RoundedBoxGeometry: ίδια σειρά ομάδων με το BoxGeometry (±x, ±y, ±z).
    const PER = BOX_GRID.x * BOX_GRID.y * BOX_GRID.z;
    const boxes = new THREE.InstancedMesh(boxGeo, [side, side, top, top, side, side], Math.max(1, full.length * PER));
    boxes.count = full.length * PER;
    let x = 0;
    for (const p of full) {
      const ox = p.x - (BOX_GRID.x * BOX.x) / 2 + BOX.x / 2;
      const oz = p.z - (BOX_GRID.z * BOX.z) / 2 + BOX.z / 2;
      for (let iy = 0; iy < BOX_GRID.y; iy++) for (let ix = 0; ix < BOX_GRID.x; ix++) for (let iz = 0; iz < BOX_GRID.z; iz++) {
        q.setFromAxisAngle(yAxis, (R() - 0.5) * 0.035);
        pos.set(ox + ix * BOX.x + (R() - 0.5) * 0.008, p.y + PALLET.h + BOX.y / 2 + iy * BOX.y, oz + iz * BOX.z + (R() - 0.5) * 0.008);
        boxes.setMatrixAt(x++, m.compose(pos, q, one));
      }
    }
    loaded.push(boxes);
  } else {
    // Πέτρα: 4 παραλλαγές υφής τραβερτίνη + απόχρωση ανά πλάκα· δύο ιμάντες και γωνιακά προστατευτικά.
    const st = stoneStack(load.slab, load.perPallet);
    const slabGeo = track(new RoundedBoxGeometry(st.a - 0.005, load.slab.t, st.b - 0.005, 2, Math.min(0.003, load.slab.t / 4)));
    const tones: [number, number, number][] = [[201, 178, 140], [188, 163, 124], [212, 192, 157], [178, 152, 114]];
    const variants = tones.map((tone, i) => {
      const t = travertineTextures(100 + i * 17, tone);
      track(t.map); track(t.bump);
      return track(new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 2.2, roughness: 0.93, color: '#ffffff' }));
    });
    const total = full.length * st.perLayer * st.layers;
    const per = variants.map((mat) => { const im = new THREE.InstancedMesh(slabGeo, mat, Math.max(1, total)); im.count = 0; return im; });
    const tint = new THREE.Color();
    const stackH = st.layers * (load.slab.t + 0.003);
    for (const p of full) {
      const sx0 = p.x - (st.nx * st.a) / 2 + st.a / 2;
      const sz0 = p.z - (st.nz * st.b) / 2 + st.b / 2;
      for (let iy = 0; iy < st.layers; iy++) for (let ix = 0; ix < st.nx; ix++) for (let iz = 0; iz < st.nz; iz++) {
        const im = per[Math.floor(R() * per.length)];
        q.setFromAxisAngle(yAxis, (R() - 0.5) * 0.012);
        pos.set(sx0 + ix * st.a + (R() - 0.5) * 0.004, p.y + PALLET.h + load.slab.t / 2 + iy * (load.slab.t + 0.003), sz0 + iz * st.b + (R() - 0.5) * 0.004);
        im.setMatrixAt(im.count, m.compose(pos, q, one));
        im.setColorAt(im.count, tint.setRGB(1, 1, 1).offsetHSL(0, (R() - 0.5) * 0.04, (R() - 0.5) * 0.06));
        im.count++;
      }
    }
    for (const im of per) if (im.instanceColor) im.instanceColor.needsUpdate = true;
    loaded.push(...per);

    // Ξύλινο κλουβί (crate) όπως ταξιδεύει η φυσική πέτρα: 4 ορθοστάτες, 3 οριζόντιες σανίδες ανά
    // πλευρά (κάτω/μέση/πάνω), και μεταλλικοί ιμάντες πάνω από τις σανίδες.
    const sx2 = (st.nx * st.a) / 2 + 0.012; const sz2 = (st.nz * st.b) / 2 + 0.012;
    const crateMat = track(new THREE.MeshStandardMaterial({ map: woodSide.map, bumpMap: woodSide.bump, bumpScale: 0.6, roughness: 0.9, color: '#e8d5b8' }));
    const postGeo = track(new RoundedBoxGeometry(0.045, stackH + 0.02, 0.045, 2, 0.004));
    const slatX = track(new RoundedBoxGeometry(2 * sx2 + 0.045, 0.07, 0.018, 2, 0.003));
    const slatZ = track(new RoundedBoxGeometry(0.018, 0.07, 2 * sz2 + 0.045, 2, 0.003));
    const posts = new THREE.InstancedMesh(postGeo, crateMat, Math.max(1, full.length * 4));
    const slatsX = new THREE.InstancedMesh(slatX, crateMat, Math.max(1, full.length * 6));
    const slatsZ = new THREE.InstancedMesh(slatZ, crateMat, Math.max(1, full.length * 6));
    posts.count = full.length * 4; slatsX.count = full.length * 6; slatsZ.count = full.length * 6;
    const strapMat = track(new THREE.MeshStandardMaterial({ color: '#39424e', roughness: 0.35, metalness: 0.6 }));
    const strapGeo = track(new THREE.BoxGeometry(0.02, stackH + 0.03, 2 * sz2 + 0.05));
    const straps = new THREE.InstancedMesh(strapGeo, strapMat, Math.max(1, full.length * 2));
    straps.count = full.length * 2;
    let pp = 0; let px = 0; let pz = 0; let sp = 0;
    for (const p of full) {
      const y0 = p.y + PALLET.h;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) posts.setMatrixAt(pp++, m.makeTranslation(p.x + sx * sx2, y0 + (stackH + 0.02) / 2, p.z + sz * sz2));
      for (const h of [0.05, stackH / 2, stackH - 0.03]) {
        for (const sz of [-1, 1]) slatsX.setMatrixAt(px++, m.makeTranslation(p.x, y0 + h, p.z + sz * (sz2 + 0.03)));
        for (const sx of [-1, 1]) slatsZ.setMatrixAt(pz++, m.makeTranslation(p.x + sx * (sx2 + 0.03), y0 + h, p.z));
      }
      for (const fx of [-0.32, 0.32]) straps.setMatrixAt(sp++, m.makeTranslation(p.x + fx * 2 * sx2, y0 + stackH / 2, p.z));
    }
    loaded.push(posts, slatsX, slatsZ, straps);
  }
  for (const im of loaded) { im.castShadow = true; im.receiveShadow = true; group.add(im); }

  // Κενές θέσεις: διάφανος όγκος με περίγραμμα — «εδώ χωράει ακόμα μία παλέτα».
  const ghostGeo = track(new THREE.BoxGeometry(PALLET.x - 0.02, LOAD_H, PALLET.z - 0.02));
  const ghostMat = track(new THREE.MeshStandardMaterial({ color: '#10b981', transparent: true, opacity: 0.12, depthWrite: false, roughness: 1 }));
  const ghosts = new THREE.InstancedMesh(ghostGeo, ghostMat, Math.max(1, empty.length));
  ghosts.count = empty.length;
  const ghostEdges = track(new THREE.EdgesGeometry(ghostGeo));
  const edgeMat = track(new THREE.LineBasicMaterial({ color: '#059669', transparent: true, opacity: 0.6 }));
  empty.forEach((p, i) => {
    ghosts.setMatrixAt(i, m.makeTranslation(p.x, p.y + LOAD_H / 2, p.z));
    const e = new THREE.LineSegments(ghostEdges, edgeMat);
    e.position.set(p.x, p.y + LOAD_H / 2, p.z);
    group.add(e);
  });
  group.add(ghosts);

  const instanced = [rods, handles, casts, holes, cross, rings, vents, hinges, keepers, decks, stringers, ghosts, ...loaded];
  return {
    dispose() {
      scene.remove(group);
      for (const im of instanced) im.dispose();
      for (const x of disposables) x.dispose();
    },
  };
}

export default function ContainerScene({
  pallets, perPallet, labels, filled, load = 'boxes', slab, heightClass = 'h-72 sm:h-80', expandable = true, className,
}: ContainerSceneProps) {
  const host = React.useRef<HTMLDivElement>(null);
  const [failed, setFailed] = React.useState(false);
  // Πλήρης οθόνη: ΔΕΥΤΕΡΟ παράθυρο (Dialog) σε όλη την οθόνη με δικό του αντίγραφο της σκηνής.
  // (Το Fullscreen API μπλοκάρεται σε iframes και ένα `fixed` μέσα σε modal εγκλωβίζεται.)
  const [expanded, setExpanded] = React.useState(false);
  const stage = React.useRef<{
    scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; sun: THREE.DirectionalLight;
  } | null>(null);
  const [ready, setReady] = React.useState(false);
  const fitRef = React.useRef<(() => void) | null>(null);
  const info = containerLayout(pallets);
  const fill = filled ?? pallets;
  const fmt = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 2 });

  // Renderer, περιβάλλον, φώτα, κάμερα: ΜΙΑ φορά.
  React.useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setFailed(true);
      return;
    }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const envRT = pmrem.fromScene(room, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.55;

    scene.add(new THREE.HemisphereLight('#f4f7ff', '#b7a183', 0.45));
    const sun = new THREE.DirectionalLight('#fff4e2', 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minPolarAngle = Math.PI * 0.12;
    controls.autoRotate = !reduceMotion;
    controls.autoRotateSpeed = 0.45;
    controls.addEventListener('start', () => { controls.autoRotate = false; }); // ο χρήστης έπιασε τον έλεγχο
    stage.current = { scene, camera, controls, sun };
    setReady(true);

    const resize = () => {
      const w = el.clientWidth; const h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`; renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      fitRef.current?.();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // Απόδοση μόνο όταν φαίνεται (εκτός οθόνης = καμία κατανάλωση).
    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(el);
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      controls.dispose();
      envRT.dispose(); pmrem.dispose(); room.dispose?.();
      renderer.dispose();
      renderer.domElement.remove();
      stage.current = null;
      setReady(false);
    };
  }, []);

  // Περιεχόμενο: ξαναχτίζεται όταν αλλάζουν οι παλέτες, το γέμισμα ή το φορτίο (ίδιος renderer).
  const slabKey = slab ? `${slab.l}:${slab.w}:${slab.t}` : '';
  React.useEffect(() => {
    const st = stage.current;
    if (!ready || !st) return;
    const built = buildScene(st.scene, pallets, fill, { kind: load, slab: slab ?? DEFAULT_SLAB, perPallet });
    return () => built.dispose();
  }, [ready, pallets, fill, load, slabKey, perPallet]); // eslint-disable-line react-hooks/exhaustive-deps

  // Κάμερα/ήλιος ανάλογα με το container (20ft / 40ft): κάδρο που χωράει ολόκληρο το container.
  const size = info.size;
  React.useEffect(() => {
    const st = stage.current;
    if (!ready || !st) return;
    const { L, W, H } = CONTAINERS[size];
    const sc = st.sun.shadow.camera as THREE.OrthographicCamera;
    st.sun.position.set(L * 0.35, H * 5, W * 3.2);
    st.sun.target.position.set(0, 0, 0);
    sc.left = -L / 2 - 1.5; sc.right = L / 2 + 1.5; sc.top = W + 2.5; sc.bottom = -W - 2.5; sc.near = 0.5; sc.far = 50;
    sc.updateProjectionMatrix();
    // Κάδρο: η σφαίρα που περικλείει το container χωρά και στο κατακόρυφο ΚΑΙ στο οριζόντιο πεδίο
    // (σε φαρδιά οθόνη περιορίζει το κατακόρυφο, σε στενή το οριζόντιο).
    const radius = Math.hypot(L, W, H) / 2;
    const fit = () => {
      const v = THREE.MathUtils.degToRad(st.camera.fov / 2);
      const hz = Math.atan(Math.tan(v) * st.camera.aspect);
      const dist = (radius / Math.sin(Math.min(v, hz))) * 0.92;
      const dir = new THREE.Vector3(0.55, 0.6, 1).normalize();
      st.camera.position.copy(st.controls.target).add(dir.multiplyScalar(dist));
      st.controls.minDistance = dist * 0.3;
      st.controls.maxDistance = dist * 1.8;
      st.controls.update();
    };
    st.controls.target.set(0, H * 0.4, 0);
    fitRef.current = fit;
    fit();
  }, [ready, size]);

  const total = pallets * perPallet;
  const stoneInfo = stoneStack(slab ?? DEFAULT_SLAB, perPallet);
  const partial = filled != null && filled < pallets;
  return (
    <figure className={className} aria-label={`1 ${labels.container} = ${fmt(pallets)} ${labels.pallet} = ${fmt(total)} ${labels.base}`}>
      <div className={`relative ${heightClass} overflow-hidden rounded-md border border-border bg-[radial-gradient(ellipse_at_50%_35%,#ffffff_0%,#eef1f4_55%,#dfe4ea_100%)] dark:bg-[radial-gradient(ellipse_at_50%_35%,#334155_0%,#1e293b_60%,#0f172a_100%)]`}>
        {failed ? (
          <p className="grid h-full place-items-center px-4 text-center text-[length:var(--fs-12)] text-muted-foreground">Η τρισδιάστατη προβολή δεν υποστηρίζεται σε αυτή τη συσκευή.</p>
        ) : (
          <div ref={host} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
        )}
        <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-background/85 px-2 py-1.5 text-[length:var(--fs-11)] leading-snug shadow-sm backdrop-blur-sm">
          <div className="font-semibold tabular-nums">1 {labels.container} ({info.size}) = {fmt(pallets)} {labels.pallet}</div>
          <div className="tabular-nums text-muted-foreground">1 {labels.pallet} = {fmt(perPallet)} {labels.base} · σύνολο {fmt(total)} {labels.base}</div>
          {partial && <div className="tabular-nums font-medium text-emerald-700 dark:text-emerald-300">Γεμάτες {fmt(filled)} / {fmt(pallets)} ({Math.round((filled / pallets) * 100)}%)</div>}
        </div>
        {!failed && expandable && (
          <button
            type="button" onClick={() => setExpanded(true)}
            className="absolute bottom-2 right-2 inline-flex size-9 cursor-pointer items-center justify-center rounded-md bg-background/85 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Πλήρης οθόνη" title="Πλήρης οθόνη"
          >
            <FiMaximize2 className="size-4" aria-hidden />
          </button>
        )}
        {info.hidden > 0 && (
          <div className="pointer-events-none absolute right-2 top-2 rounded-md bg-amber-100/90 px-2 py-1 text-[length:var(--fs-11)] font-medium text-amber-900 shadow-sm">
            +{info.hidden} {labels.pallet} δεν χωρούν στο σχέδιο
          </div>
        )}
      </div>
      {expandable && (
        <Dialog open={expanded} onOpenChange={setExpanded}>
          <DialogContent showCloseButton={false} className="h-dvh w-screen max-w-none gap-0 rounded-none border-0 p-0 sm:max-w-none">
            <DialogTitle className="sr-only">3D προβολή φόρτωσης</DialogTitle>
            <ContainerScene
              pallets={pallets} perPallet={perPallet} labels={labels} filled={filled} load={load} slab={slab}
              heightClass="h-dvh" expandable={false} className="h-dvh [&_figcaption]:hidden [&>div]:rounded-none [&>div]:border-0"
            />
            <button
              type="button" onClick={() => setExpanded(false)}
              className="absolute bottom-4 right-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-background/90 px-3 text-[length:var(--fs-13)] font-medium shadow-md backdrop-blur-sm hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <FiMinimize2 className="size-4" aria-hidden /> Κλείσιμο (Esc)
            </button>
          </DialogContent>
        </Dialog>
      )}
      <figcaption className="mt-1 text-[length:var(--fs-11)] text-muted-foreground">
        Σύρε για περιστροφή, ροδέλα για ζουμ.{' '}
        {load === 'stones'
          ? <>Πλάκα {fmt((slab ?? DEFAULT_SLAB).l * 100)}×{fmt((slab ?? DEFAULT_SLAB).w * 100)}×{fmt((slab ?? DEFAULT_SLAB).t * 100)} εκ.{slab ? '' : ' (ενδεικτική — δεν έχουν οριστεί διαστάσεις στο είδος)'} · {stoneInfo.perLayer} ανά στρώση × {stoneInfo.neededLayers} στρώσεις{stoneInfo.capped ? ' (σχεδιάζονται λιγότερες)' : ''}.</>
          : load === 'sacks'
            ? <>Τα σακιά είναι ενδεικτικά (28 ανά παλέτα) — η ποσότητα μετράει σε {labels.base}.</>
            : <>Τα κιβώτια είναι ενδεικτικά — η ποσότητα μετράει σε {labels.base}.</>}
      </figcaption>
    </figure>
  );
}
