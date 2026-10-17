'use client';

// Στιγμιότυπο της 3D φόρτωσης για τα email (PNG 1200×630, αδιαφανές φόντο — σωστό και σε dark mode
// προγραμμάτων αλληλογραφίας). Ίδια σκηνή με την 3D προβολή, offscreen, χωρίς DOM.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildScene, containerLayout } from './container-scene';

export type SnapshotInput = {
  pallets: number;
  perPallet: number;
  filled: number;
  load: 'boxes' | 'stones' | 'sacks';
  slab?: { l: number; w: number; t: number } | null;
};

const W = 1200;
const H = 630;
const DIMS = { '20ft': { L: 6.06, W: 2.44, H: 2.59 }, '40ft': { L: 12.19, W: 2.44, H: 2.59 } } as const;

function backdrop() {
  const cv = document.createElement('canvas');
  cv.width = 16; cv.height = 512;
  const g = cv.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#eef1f4'); gr.addColorStop(1, '#dde3ea');
  g.fillStyle = gr; g.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function renderContainerSnapshot(input: SnapshotInput): Promise<Blob> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const bg = backdrop();
    scene.background = bg;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.55;
    scene.add(new THREE.HemisphereLight('#f4f7ff', '#b7a183', 0.45));

    const { size } = containerLayout(input.pallets);
    const d = DIMS[size];
    const sun = new THREE.DirectionalLight('#fff4e2', 2.6);
    sun.position.set(d.L * 0.35, d.H * 5, d.W * 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.normalBias = 0.02;
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -d.L / 2 - 1.5; sc.right = d.L / 2 + 1.5; sc.top = d.W + 2.5; sc.bottom = -d.W - 2.5; sc.near = 0.5; sc.far = 50;
    scene.add(sun, sun.target);

    const built = buildScene(scene, input.pallets, input.filled, { kind: input.load, slab: input.slab ?? { l: 0.6, w: 0.4, t: 0.02 }, perPallet: input.perPallet });

    // Κάδρο: όλο το container, ελαφρώς από ψηλά, με χώρο γύρω του.
    const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 200);
    const radius = Math.hypot(d.L, d.W, d.H) / 2;
    const v = THREE.MathUtils.degToRad(camera.fov / 2);
    const hz = Math.atan(Math.tan(v) * camera.aspect);
    const dist = (radius / Math.sin(Math.min(v, hz))) * 0.86;
    const target = new THREE.Vector3(0, d.H * 0.36, 0);
    camera.position.copy(target).add(new THREE.Vector3(0.5, 0.58, 1).normalize().multiplyScalar(dist));
    camera.lookAt(target);

    renderer.render(scene, camera);
    const blob = await new Promise<Blob>((res, rej) => renderer.domElement.toBlob((b) => (b ? res(b) : rej(new Error('Αποτυχία δημιουργίας εικόνας'))), 'image/png'));

    built.dispose(); env.dispose(); pmrem.dispose(); bg.dispose();
    return blob;
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

/** Ανεβάζει το στιγμιότυπο της προσφοράς· `notify` στέλνει τυχόν «η τιμή έπεσε» αμέσως μετά. */
export async function uploadOfferSnapshot(offerId: string, input: SnapshotInput, notify = false) {
  const blob = await renderContainerSnapshot(input);
  const res = await fetch(`/api/admin/dynamic-offers/${offerId}/snapshot${notify ? '?notify=1' : ''}`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.message ?? 'Αποτυχία αποθήκευσης της 3D εικόνας');
  return d as { url: string; drop: { level: number; price: number; sent: number; failed: number; skipped: number } | null };
}
