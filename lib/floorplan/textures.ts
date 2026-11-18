// Procedural textures για την 3D προβολή κάτοψης — δημιουργούνται με canvas (χωρίς εξωτερικά assets).
// Καθαρή λογική: δέχεται canvas context και ζωγραφίζει επαναλαμβανόμενα patterns για τούβλο, ξύλο, τζάμι.
import * as THREE from 'three';

const SIZE = 256;

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  return c;
}

/** Επαναλαμβανόμενο texture από canvas. */
export function canvasTexture(c: HTMLCanvasElement, repeat: [number, number] = [2, 2]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  return t;
}

/** Τούβλο: οριζόντιες σειρές ορθογωνίων με εναλλαγή μισού μήκους και σκιά κάτω. */
export function brickTexture(): THREE.CanvasTexture {
  const c = makeCanvas();
  const g = c.getContext('2d')!;
  g.fillStyle = '#9a5f4a';
  g.fillRect(0, 0, SIZE, SIZE);
  const bh = SIZE / 8, bw = SIZE / 4, gap = 3;
  for (let row = 0; row < 8; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let col = -1; col < 5; col++) {
      const x = off + col * bw, y = row * bh;
      g.fillStyle = `hsl(${14 + Math.random() * 10}, ${38 + Math.random() * 14}%, ${34 + Math.random() * 12}%)`;
      g.fillRect(x + gap / 2, y + gap / 2, bw - gap, bh - gap);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x + gap / 2, y + bh - gap - 2, bw - gap, 2);
    }
  }
  return canvasTexture(c, [4, 2]);
}

/** Σοβάς/σκυρόδεμα: ομοιόμορφα ανοικτό γκρι με αμυδρό θόρυβο. */
export function plasterTexture(): THREE.CanvasTexture {
  const c = makeCanvas();
  const g = c.getContext('2d')!;
  g.fillStyle = '#c8c2b8';
  g.fillRect(0, 0, SIZE, SIZE);
  const img = g.getImageData(0, 0, SIZE, SIZE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return canvasTexture(c, [3, 1]);
}

/** Ξύλο πόρτας: κάθετα νερά με εναλλαγή τόνων. */
export function woodTexture(): THREE.CanvasTexture {
  const c = makeCanvas();
  const g = c.getContext('2d')!;
  g.fillStyle = '#8a5c3d';
  g.fillRect(0, 0, SIZE, SIZE);
  for (let x = 0; x < SIZE; x += 4) {
    const w = 2 + Math.random() * 6;
    g.fillStyle = `hsl(${26 + Math.random() * 8}, ${32 + Math.random() * 12}%, ${26 + Math.random() * 14}%)`;
    g.fillRect(x, 0, w, SIZE);
  }
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let x = 0; x < SIZE; x += 32) g.fillRect(x, 0, 1.5, SIZE);
  return canvasTexture(c, [1, 2]);
}

/** Τζάμι: ανοιχτό γαλάζιο με αχνή λάμψη. */
export function glassTexture(): THREE.CanvasTexture {
  const c = makeCanvas();
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, SIZE, SIZE);
  grad.addColorStop(0, 'rgba(190,230,255,0.75)');
  grad.addColorStop(0.5, 'rgba(220,245,255,0.35)');
  grad.addColorStop(1, 'rgba(170,215,245,0.65)');
  g.fillStyle = grad;
  g.fillRect(0, 0, SIZE, SIZE);
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 3;
  g.strokeRect(8, 8, SIZE - 16, SIZE - 16);
  return canvasTexture(c, [1, 1]);
}

/** Μαρμάρινο δάπεδο: ανοικτό φόντο με αχνές φλέβες. */
export function floorTexture(): THREE.CanvasTexture {
  const c = makeCanvas();
  const g = c.getContext('2d')!;
  g.fillStyle = '#d8d4cc';
  g.fillRect(0, 0, SIZE, SIZE);
  g.strokeStyle = 'rgba(0,0,0,0.06)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 24; i++) {
    g.beginPath();
    const y = Math.random() * SIZE;
    g.moveTo(0, y);
    for (let x = 0; x <= SIZE; x += 16) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 8 + (Math.random() - 0.5) * 4);
    g.stroke();
  }
  return canvasTexture(c, [8, 8]);
}
