'use client';

// Φόρτωση κάτοψης στον browser: εικόνα (PNG/JPG/WebP…) ή PDF (pdfjs, μία σελίδα τη φορά).
// Κρατάμε δύο αναλύσεις: `display` (ευκρινής υφή για το three.js) και `analysis` (≤ ANALYSIS_MAX
// pixels στη μεγάλη πλευρά) όπου τρέχουν ανίχνευση τοίχων/flood fill. Οι συντεταγμένες όλου του
// εργαλείου είναι σε pixels της `analysis`.

import { flattenPath, pdfOpsToRaw, type CadSegment, type Matrix } from '@/lib/floorplan/cad/pdf-vectors';

const ANALYSIS_MAX = 1600;
const DISPLAY_MAX = 4096;

export type LoadedPlan = {
  name: string;
  display: HTMLCanvasElement;
  analysis: ImageData;
  /** Σελίδες PDF (1 για εικόνα). */
  pages: number;
  page: number;
  /** Κενός κάναβος (χωρίς σχέδιο): γνωστή κλίμακα, pixels ανάλυσης ανά μέτρο. */
  pxPerM?: number;
};

function fit(w: number, h: number, max: number) {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

function toCanvases(src: CanvasImageSource, w: number, h: number) {
  const d = fit(w, h, DISPLAY_MAX);
  const display = document.createElement('canvas');
  display.width = d.w; display.height = d.h;
  const dc = display.getContext('2d')!;
  dc.fillStyle = '#fff'; dc.fillRect(0, 0, d.w, d.h);
  dc.drawImage(src, 0, 0, d.w, d.h);
  const a = fit(w, h, ANALYSIS_MAX);
  const ac = document.createElement('canvas');
  ac.width = a.w; ac.height = a.h;
  const actx = ac.getContext('2d', { willReadFrequently: true })!;
  actx.imageSmoothingQuality = 'high';
  actx.drawImage(display, 0, 0, a.w, a.h);
  return { display, analysis: actx.getImageData(0, 0, a.w, a.h) };
}

export const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

async function loadImage(file: File): Promise<LoadedPlan> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error('Η εικόνα δεν διαβάζεται — δοκίμασε PNG ή JPG.');
  const { display, analysis } = toCanvases(bmp, bmp.width, bmp.height);
  bmp.close();
  return { name: file.name, display, analysis, pages: 1, page: 1 };
}

type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
  // Τα OCG (layers) ζουν στο ΕΓΓΡΑΦΟ, όχι στη σελίδα.
  getOptionalContentConfig: () => Promise<{ getGroup: (id: string) => { name?: string } | null } | null>;
};
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number; transform: number[] };
  render: (o: { canvasContext: CanvasRenderingContext2D; canvas: HTMLCanvasElement; viewport: unknown }) => { promise: Promise<void> };
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[] }>;
};

// Το legacy build: το «modern» της 5.x θέλει πολύ νέα JS API (π.χ. Map#getOrInsertComputed)
// που λείπουν από αρκετούς browsers ακόμη.
let pdfjsP: Promise<typeof import('pdfjs-dist')> | null = null;
function pdfjs() {
  // Ο worker φορτώνεται με new Worker(new URL(...)) — το μοτίβο που υποστηρίζουν Turbopack και webpack.
  pdfjsP ??= (import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<typeof import('pdfjs-dist')>).then((m) => {
    if (!m.GlobalWorkerOptions.workerPort) {
      m.GlobalWorkerOptions.workerPort = new Worker(new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' });
    }
    return m;
  });
  return pdfjsP;
}

const docs = new WeakMap<File, Promise<PdfDoc>>();

async function loadPdf(file: File, page: number): Promise<LoadedPlan> {
  let docP = docs.get(file);
  if (!docP) {
    docP = file.arrayBuffer().then(async (buf) => (await pdfjs()).getDocument({ data: new Uint8Array(buf) }).promise as unknown as PdfDoc);
    docs.set(file, docP);
  }
  const doc = await docP.catch(() => { docs.delete(file); throw new Error('Το PDF δεν ανοίγει (κατεστραμμένο ή με κωδικό).'); });
  const n = Math.min(Math.max(1, page), doc.numPages);
  const p = await doc.getPage(n);
  const base = p.getViewport({ scale: 1 });
  // Σχέδια σε A3/A1 είναι ήδη μεγάλα σε points· στοχεύουμε ~DISPLAY_MAX στη μεγάλη πλευρά.
  const scale = Math.min(6, DISPLAY_MAX / Math.max(base.width, base.height));
  const vp = p.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await p.render({ canvasContext: ctx, canvas: c, viewport: vp }).promise;
  const { display, analysis } = toCanvases(c, c.width, c.height);
  return { name: file.name, display, analysis, pages: doc.numPages, page: n };
}

export function loadPlan(file: File, page = 1): Promise<LoadedPlan> {
  return isPdf(file) ? loadPdf(file, page) : loadImage(file);
}

/**
 * Διανυσματική εξαγωγή μιας σελίδας PDF σε px της `analysis` (ίδιο coordinate space με το εργαλείο):
 * OCG layers + operator-list → `CadSegment[]`. I/O glue — επαληθεύεται με manual QA (Plan 06, Task 5).
 */
export async function pageVectors(
  file: File, page: number, targetW: number,
): Promise<{ segments: CadSegment[]; layers: { id: string; name: string }[]; w: number; h: number }> {
  const m = await pdfjs();
  let docP = docs.get(file);
  if (!docP) {
    docP = file.arrayBuffer().then(async (buf) => (await pdfjs()).getDocument({ data: new Uint8Array(buf) }).promise as unknown as PdfDoc);
    docs.set(file, docP);
  }
  const doc = await docP;
  const n = Math.min(Math.max(1, page), doc.numPages);
  const p = await doc.getPage(n);
  const base = p.getViewport({ scale: 1 });
  const vp = p.getViewport({ scale: targetW / base.width });
  const oc = await doc.getOptionalContentConfig().catch(() => null);
  const layerName = (args: unknown): string | null => {
    const a = args as unknown[];
    if (!Array.isArray(a) || a[0] !== 'OC') return null;
    const props = a[1] as { id?: string } | string | null;
    const id = typeof props === 'string' ? props : props?.id;
    if (!id) return null;
    return oc?.getGroup(id)?.name ?? String(id);
  };
  const opList = await p.getOperatorList();
  const OPS = (m as unknown as { OPS: Record<string, number> }).OPS;
  const raw = pdfOpsToRaw(opList.fnArray, opList.argsArray, OPS, layerName);
  const segments = flattenPath(raw, vp.transform as Matrix);
  const layers: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const s of segments) if (s.layer && !seen.has(s.layer)) { seen.add(s.layer); layers.push({ id: s.layer, name: s.layer }); }
  return { segments, layers, w: Math.round(vp.width), h: Math.round(vp.height) };
}

/**
 * Κενός κάναβος για σχεδίαση τοίχων από το μηδέν (όταν το αρχείο του πελάτη δεν διαβάζεται ή δεν
 * υπάρχει). Η κλίμακα είναι γνωστή εκ κατασκευής· γραμμές ανά 0,5 m / 1 m / 5 m με αρίθμηση.
 */
export function blankPlan(widthM = 20, heightM = 14): LoadedPlan {
  const pxPerM = Math.floor(ANALYSIS_MAX / Math.max(widthM, heightM));
  const aw = Math.round(widthM * pxPerM), ah = Math.round(heightM * pxPerM);
  const k = 2;
  const display = document.createElement('canvas');
  display.width = aw * k; display.height = ah * k;
  const g = display.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, display.width, display.height);
  const step = (pxPerM * k) / 2;
  for (let i = 0; i * step <= display.width + 1; i++) {
    g.strokeStyle = i % 10 === 0 ? '#94A3B8' : i % 2 === 0 ? '#CBD5E1' : '#E2E8F0';
    g.lineWidth = i % 10 === 0 ? 2 : 1;
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, display.height); g.stroke();
  }
  for (let i = 0; i * step <= display.height + 1; i++) {
    g.strokeStyle = i % 10 === 0 ? '#94A3B8' : i % 2 === 0 ? '#CBD5E1' : '#E2E8F0';
    g.lineWidth = i % 10 === 0 ? 2 : 1;
    g.beginPath(); g.moveTo(0, i * step); g.lineTo(display.width, i * step); g.stroke();
  }
  g.fillStyle = '#64748B';
  g.font = `${Math.round(pxPerM * k * 0.28)}px ui-monospace, monospace`;
  for (let m = 5; m < widthM; m += 5) g.fillText(`${m} m`, m * pxPerM * k + 6, pxPerM * k * 0.4);
  for (let m = 5; m < heightM; m += 5) g.fillText(`${m} m`, 6, m * pxPerM * k - 6);
  const ac = document.createElement('canvas');
  ac.width = aw; ac.height = ah;
  const actx = ac.getContext('2d', { willReadFrequently: true })!;
  actx.drawImage(display, 0, 0, aw, ah);
  return { name: `Κενός κάναβος ${widthM}×${heightM} m`, display, analysis: actx.getImageData(0, 0, aw, ah), pages: 1, page: 1, pxPerM };
}
