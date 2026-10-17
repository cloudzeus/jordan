// Υλικά/υφές για τις 3D σκηνές (container, μονάδες): ΟΛΑ διαδικαστικά σε canvas, με σταθερό seed.
import * as THREE from 'three';

// ── Τυχαίοι αριθμοί με seed (σταθερή εικόνα) ────────────────────────────────────────────────
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas(w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return { cv, g: cv.getContext('2d')! };
}
export function tex(cv: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ── Υφές ────────────────────────────────────────────────────────────────────────────────────
/** Ξύλο παλέτας (πεύκο): νερά κατά μήκος του άξονα v, ρόζοι, καρφιά στις θέσεις των δοκών. */
export function woodTextures(seed: number, nails: number[]) {
  const R = rng(seed);
  const W = 128; const H = 1024;
  const { cv, g } = canvas(W, H);
  const { cv: bcv, g: b } = canvas(W, H);
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#c7a174'); grad.addColorStop(0.5, '#d6b487'); grad.addColorStop(1, '#c39b6c');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  b.fillStyle = '#808080'; b.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    const x = R() * W; const amp = 1 + R() * 3; const f = 0.004 + R() * 0.01; const ph = R() * 10;
    const dark = 0.06 + R() * 0.16;
    g.strokeStyle = `rgba(${95 + R() * 30},${62 + R() * 20},${35},${dark})`; g.lineWidth = 0.5 + R() * 2;
    b.strokeStyle = `rgba(40,40,40,${dark * 2})`; b.lineWidth = g.lineWidth;
    g.beginPath(); b.beginPath();
    for (let y = 0; y <= H; y += 8) {
      const xx = x + Math.sin(y * f + ph) * amp;
      if (y === 0) { g.moveTo(xx, y); b.moveTo(xx, y); } else { g.lineTo(xx, y); b.lineTo(xx, y); }
    }
    g.stroke(); b.stroke();
  }
  for (let k = 0; k < 2; k++) { // ρόζοι (μικροί, ανοιχτοί — όχι «τρύπες»)
    const cx = 20 + R() * (W - 40); const cy = 120 + R() * (H - 240); const r = 2.5 + R() * 3;
    for (let ring = 3; ring >= 0; ring--) {
      g.fillStyle = `rgba(${120 - ring * 6},${80 - ring * 4},40,${0.12 + ring * 0.05})`;
      g.beginPath(); g.ellipse(cx, cy, r * (1 + ring * 0.5), r * (2.4 + ring * 1.4), 0, 0, Math.PI * 2); g.fill();
    }
    b.fillStyle = 'rgba(50,50,50,0.35)'; b.beginPath(); b.ellipse(cx, cy, r, r * 2.4, 0, 0, Math.PI * 2); b.fill();
  }
  for (const v of nails) for (const u of [0.28, 0.72]) { // κεφαλές καρφιών
    const x = u * W; const y = v * H;
    g.fillStyle = 'rgba(70,72,76,0.95)'; g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(160,165,170,0.7)'; g.beginPath(); g.arc(x - 0.8, y - 0.8, 1.2, 0, Math.PI * 2); g.fill();
    b.fillStyle = '#202020'; b.beginPath(); b.arc(x, y, 3.4, 0, Math.PI * 2); b.fill();
  }
  return { map: tex(cv), bump: tex(bcv, false) };
}

/** Τραβερτίνης: στρώσεις (κύματα), πόροι επιμήκεις κατά τη στρώση, κόκκος. */
export function travertineTextures(seed: number, base: [number, number, number]) {
  const R = rng(seed);
  const S = 512;
  const { cv, g } = canvas(S, S);
  const { cv: bcv, g: b } = canvas(S, S);
  g.fillStyle = `rgb(${base.join(',')})`; g.fillRect(0, 0, S, S);
  b.fillStyle = '#9a9a9a'; b.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) { // στρώσεις
    const y0 = R() * S; const th = 4 + R() * 26; const light = R() > 0.5;
    const a = 0.05 + R() * 0.12; const f1 = 0.004 + R() * 0.01; const f2 = 0.02 + R() * 0.03; const ph = R() * 9;
    g.fillStyle = light ? `rgba(255,248,235,${a})` : `rgba(120,95,60,${a})`;
    g.beginPath(); g.moveTo(0, y0);
    for (let x = 0; x <= S; x += 8) g.lineTo(x, y0 + Math.sin(x * f1 + ph) * 10 + Math.sin(x * f2) * 3);
    for (let x = S; x >= 0; x -= 8) g.lineTo(x, y0 + th + Math.sin(x * f1 + ph + 0.6) * 10);
    g.closePath(); g.fill();
  }
  for (let i = 0; i < 420; i++) { // πόροι
    const x = R() * S; const y = R() * S; const rx = 0.8 + R() * (R() > 0.92 ? 9 : 3.5); const ry = rx * (0.25 + R() * 0.35);
    g.fillStyle = `rgba(${105 + R() * 30},${85 + R() * 20},${58},${0.35 + R() * 0.4})`;
    g.beginPath(); g.ellipse(x, y, rx, ry, (R() - 0.5) * 0.25, 0, Math.PI * 2); g.fill();
    b.fillStyle = `rgba(20,20,20,${0.55 + R() * 0.4})`;
    b.beginPath(); b.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); b.fill();
  }
  const img = g.getImageData(0, 0, S, S); // κόκκος
  for (let p = 0; p < img.data.length; p += 4) {
    const n = (R() - 0.5) * 14;
    img.data[p] += n; img.data[p + 1] += n; img.data[p + 2] += n * 0.9;
  }
  g.putImageData(img, 0, 0);
  return { map: tex(cv), bump: tex(bcv, false) };
}

/** Πλαϊνό κιβωτίου (όπως η φωτογραφία): kraft με νεύρωση, καμπύλες μπλε/κόκκινη/πορτοκαλί, ετικέτα, «FRAGILE». */
export function boxSideTexture() {
  const { cv, g } = canvas(1024, 720);
  g.fillStyle = '#c99c69'; g.fillRect(0, 0, 1024, 720);
  for (let x = 0; x < 1024; x += 4) { g.fillStyle = `rgba(90,60,30,${x % 8 ? 0.025 : 0.05})`; g.fillRect(x, 0, 1.5, 720); }
  const sw = (c: string, dx: number, w: number) => {
    g.strokeStyle = c; g.lineWidth = w;
    g.beginPath(); g.moveTo(120 + dx, -10); g.bezierCurveTo(10 + dx, 300, 120 + dx, 600, 520 + dx, 740); g.stroke();
  };
  sw('#2f4a6e', 0, 46); sw('#d1392f', 50, 44); sw('#e2762f', 110, 50);
  g.fillStyle = '#fbfbf6'; g.fillRect(520, 110, 440, 175);
  g.fillStyle = '#1d1d1d';
  for (let i = 0, x = 540; x < 670; i++) { const w = i % 4 === 0 ? 6 : i % 3 ? 2 : 4; g.fillRect(x, 130, w, 100); x += w + 3; }
  g.font = '600 17px sans-serif'; g.fillText('765-QX-84063', 540, 260);
  for (let r = 0; r < 4; r++) g.fillRect(700, 140 + r * 18, 230 - r * 25, 6);
  g.fillStyle = '#fbfbf6'; g.fillRect(740, 420, 210, 250);
  g.strokeStyle = '#1d1d1d'; g.lineWidth = 4;
  for (const [x, y] of [[758, 438], [852, 438], [758, 522], [852, 522]]) g.strokeRect(x, y, 80, 76);
  g.fillStyle = '#1d1d1d'; g.font = 'bold 44px sans-serif'; g.fillText('FRAGILE', 752, 648);
  g.fillRect(752, 656, 180, 6);
  return tex(cv);
}
/** Πάνω όψη: kraft με καφέ ταινία στο κέντρο. */
export function boxTopTexture() {
  const { cv, g } = canvas(512, 512);
  g.fillStyle = '#c59866'; g.fillRect(0, 0, 512, 512);
  g.fillStyle = 'rgba(80,50,25,0.25)'; g.fillRect(0, 252, 512, 3);
  g.fillStyle = 'rgba(176,128,72,0.95)'; g.fillRect(0, 214, 512, 84);
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 222, 512, 14);
  return tex(cv);
}
/** Δάπεδο container: σκληρό ξύλο σε σανίδες. */
export function floorTexture(L: number) {
  const R = rng(7);
  const { cv, g } = canvas(2048, 256);
  const planks = 14;
  for (let i = 0; i < planks; i++) {
    const y = (i * 256) / planks; const h = 256 / planks;
    const t = 70 + R() * 30;
    g.fillStyle = `rgb(${t + 40},${t + 8},${t - 20})`; g.fillRect(0, y, 2048, h);
    for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(40,20,5,${0.05 + R() * 0.08})`; g.fillRect(0, y + R() * h, 2048, 1); }
    g.fillStyle = 'rgba(20,10,0,0.55)'; g.fillRect(0, y, 2048, 1.5);
    for (let x = R() * 300; x < 2048; x += 300 + R() * 500) g.fillRect(x, y, 2, h);
  }
  const t = tex(cv);
  t.repeat.set(Math.max(1, Math.round(L / 6)), 1);
  return t;
}

