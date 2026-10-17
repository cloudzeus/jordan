// Μοντέλα για τις 3D σκηνές: σακί (κόλλες, τσιμέντο, κονιάματα), παλέτα, κιβώτιο, πλάκα πέτρας.
// Όλα διαδικαστικά. Τα γεωμετρικά είναι σε ΜΕΤΡΑ, με τη βάση τους στο y = 0.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { boxSideTexture, boxTopTexture, canvas, rng, tex, travertineTextures, woodTextures } from './materials';

export const SACK = { x: 0.6, y: 0.13, z: 0.42 };

/**
 * Σακί 25 kg: «μαξιλάρι» από χαρτί kraft. Κουτί με πολλά τμήματα που φουσκώνει στη μέση και
 * λεπταίνει στις άκρες (υπερέλλειψη), με ραφές/τσαλακώματα στις στενές πλευρές.
 */
export function sackGeometry(size = SACK) {
  const g = new THREE.BoxGeometry(size.x, size.y, size.z, 28, 6, 20);
  const p = g.attributes.position as THREE.BufferAttribute;
  const R = rng(42);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const nx = Math.abs(v.x) / (size.x / 2);
    const nz = Math.abs(v.z) / (size.z / 2);
    // Πάχος: γεμάτο στη μέση, «κλείνει» στις άκρες (κυρίως στις στενές πλευρές με τη ραφή).
    const pinch = (1 - Math.pow(nx, 6) * 0.85) * (1 - Math.pow(nz, 4) * 0.55);
    v.y *= pinch;
    // Οι πλευρές φουσκώνουν προς τα έξω στο κέντρο του ύψους.
    const bulge = 1 + 0.06 * (1 - Math.pow(Math.abs(v.y) / (size.y / 2), 2));
    v.x *= bulge; v.z *= bulge;
    // Μικρά τσαλακώματα κοντά στις ραφές.
    if (nx > 0.8) v.y += (R() - 0.5) * 0.006;
    v.y += size.y / 2; // βάση στο 0
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Υφή σακιού: kraft καφέ-κεραμιδί, ίνες, ελαφριές κηλίδες, ραφές στα άκρα. */
export function sackTexture(seed = 5) {
  const R = rng(seed);
  const { cv, g } = canvas(512, 512);
  g.fillStyle = '#9c6047'; g.fillRect(0, 0, 512, 512);
  const img = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (R() - 0.5) * 18;
    img.data[i] += n; img.data[i + 1] += n * 0.85; img.data[i + 2] += n * 0.7;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 40; i++) { // κηλίδες/σκόνη
    g.fillStyle = `rgba(${R() > 0.5 ? '255,235,215' : '90,50,35'},${0.03 + R() * 0.05})`;
    g.beginPath(); g.ellipse(R() * 512, R() * 512, 20 + R() * 60, 10 + R() * 30, R() * 3, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(70,40,28,0.35)'; g.lineWidth = 2; // ραφές στις στενές πλευρές
  for (const x of [18, 494]) { g.beginPath(); for (let y = 0; y < 512; y += 10) { g.moveTo(x, y); g.lineTo(x, y + 5); } g.stroke(); }
  return tex(cv);
}

export type Materials = ReturnType<typeof createMaterials>;

/** Κοινά υλικά — ΔΗΜΙΟΥΡΓΟΥΝΤΑΙ ΜΙΑ φορά ανά renderer και αποδεσμεύονται με `dispose`. */
export function createMaterials() {
  const woodTop = woodTextures(11, [0.045, 0.5, 0.955]);
  const woodSide = woodTextures(23, []);
  woodSide.map.rotation = Math.PI / 2; woodSide.bump.rotation = Math.PI / 2;
  woodSide.map.center.set(0.5, 0.5); woodSide.bump.center.set(0.5, 0.5);
  const trav = travertineTextures(100, [201, 178, 140]);
  const textures = [woodTop.map, woodTop.bump, woodSide.map, woodSide.bump, trav.map, trav.bump];
  const sideTex = boxSideTexture(); const topTex = boxTopTexture(); const sackTex = sackTexture();
  textures.push(sideTex, topTex, sackTex);
  const m = {
    deck: new THREE.MeshStandardMaterial({ map: woodTop.map, bumpMap: woodTop.bump, bumpScale: 0.6, roughness: 0.86 }),
    beam: new THREE.MeshStandardMaterial({ map: woodSide.map, bumpMap: woodSide.bump, bumpScale: 0.6, roughness: 0.88, color: '#efe2cf' }),
    boxSide: new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.92 }),
    boxTop: new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.85 }),
    stone: new THREE.MeshStandardMaterial({ map: trav.map, bumpMap: trav.bump, bumpScale: 2.2, roughness: 0.93 }),
    sack: new THREE.MeshStandardMaterial({ map: sackTex, roughness: 0.78, metalness: 0 }),
  };
  return {
    ...m,
    dispose() { for (const x of Object.values(m)) x.dispose(); for (const t of textures) t.dispose(); },
  };
}

/** Μία παλέτα 1,2 × 1,0 m (7 σανίδες πάνω, 3 δοκοί, 3 σανίδες βάσης). */
export function createPallet(mat: Materials) {
  const g = new THREE.Group();
  const deck = new RoundedBoxGeometry(0.135, 0.022, 1.0, 2, 0.003);
  const beam = new RoundedBoxGeometry(1.2, 0.1, 0.09, 2, 0.004);
  for (let i = 0; i < 7; i++) { const d = new THREE.Mesh(deck, mat.deck); d.position.set(-0.6 + 0.0675 + i * ((1.2 - 0.135) / 6), 0.133, 0); g.add(d); }
  for (const x of [-0.5325, 0, 0.5325]) { const d = new THREE.Mesh(deck, mat.deck); d.position.set(x, 0.011, 0); g.add(d); }
  for (const z of [-0.455, 0, 0.455]) { const b = new THREE.Mesh(beam, mat.beam); b.position.set(0, 0.072, z); g.add(b); }
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  return { group: g, height: 0.144, dispose() { deck.dispose(); beam.dispose(); } };
}

/** Κιβώτιο πλακιδίων (όπως η φωτογραφία). */
export function createBox(mat: Materials, size = { x: 0.38, y: 0.26, z: 0.31 }) {
  const geo = new RoundedBoxGeometry(size.x, size.y, size.z, 2, 0.008);
  const mesh = new THREE.Mesh(geo, [mat.boxSide, mat.boxSide, mat.boxTop, mat.boxTop, mat.boxSide, mat.boxSide]);
  mesh.position.y = size.y / 2; mesh.castShadow = true; mesh.receiveShadow = true;
  return { mesh, dispose() { geo.dispose(); } };
}

/** Πλάκα πέτρας. */
export function createSlab(mat: Materials, size = { l: 0.6, w: 0.4, t: 0.02 }) {
  const geo = new RoundedBoxGeometry(size.l, size.t, size.w, 2, Math.min(0.003, size.t / 4));
  const mesh = new THREE.Mesh(geo, mat.stone);
  mesh.position.y = size.t / 2; mesh.castShadow = true; mesh.receiveShadow = true;
  return { mesh, dispose() { geo.dispose(); } };
}

/** Σακί. */
export function createSack(mat: Materials, size = SACK) {
  const geo = sackGeometry(size);
  const mesh = new THREE.Mesh(geo, mat.sack);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return { mesh, dispose() { geo.dispose(); } };
}
