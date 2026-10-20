'use client';

// Φόρτωση κάτοψης στον browser: εικόνα (PNG/JPG/WebP…) ή PDF (pdfjs, μία σελίδα τη φορά).
// Κρατάμε δύο αναλύσεις: `display` (ευκρινής υφή για το three.js) και `analysis` (≤ ANALYSIS_MAX
// pixels στη μεγάλη πλευρά) όπου τρέχουν ανίχνευση τοίχων/flood fill. Οι συντεταγμένες όλου του
// εργαλείου είναι σε pixels της `analysis`.

const ANALYSIS_MAX = 1600;
const DISPLAY_MAX = 4096;

export type LoadedPlan = {
  name: string;
  display: HTMLCanvasElement;
  analysis: ImageData;
  /** Σελίδες PDF (1 για εικόνα). */
  pages: number;
  page: number;
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

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; canvas: HTMLCanvasElement; viewport: unknown }) => { promise: Promise<void> };
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
