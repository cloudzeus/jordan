// lib/install-guide/pdf.ts — PDF του οδηγού εγκατάστασης (pdf-lib + fontkit, LiberationSans για τα
// Ελληνικά). Δεν ξέρει τίποτα για βάση ή CDN: παίρνει τον οδηγό + τις εικόνες (JPEG) και δίνει bytes.
import fs from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import type { InstallGuide } from './guide';

export interface GuidePdfImage { data: Buffer; caption: string }
export interface GuidePdfMeta {
  code: string;
  name: string;
  profileLabel: string;
  category?: string | null;
  createdAt: Date;
  author?: string | null;
}

/**
 * Σπάει κείμενο σε γραμμές που χωρούν στο `maxWidth`. Κρατά τις αλλαγές γραμμής του κειμένου και
 * κόβει λέξεις που μόνες τους δεν χωρούν (π.χ. URL ή κωδικοί).
 */
export function wrapText(text: string, measure: (s: string) => number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.replace(/\r/g, '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (let w of words) {
      while (measure(w) > maxWidth && w.length > 1) {
        // Λέξη μεγαλύτερη από τη γραμμή: όσοι χαρακτήρες χωρούν, σε δική τους γραμμή.
        if (line) { out.push(line); line = ''; }
        let n = w.length - 1;
        while (n > 1 && measure(w.slice(0, n)) > maxWidth) n--;
        out.push(w.slice(0, n));
        w = w.slice(n);
      }
      const next = line ? `${line} ${w}` : w;
      if (measure(next) <= maxWidth) line = next;
      else { out.push(line); line = w; }
    }
    if (line) out.push(line);
  }
  return out;
}

const A4 = { w: 595.28, h: 841.89 };
const M = { x: 46, top: 50, bottom: 56 };
const CW = A4.w - M.x * 2;
const C = {
  ink: rgb(0.11, 0.12, 0.15), muted: rgb(0.42, 0.45, 0.5), line: rgb(0.86, 0.87, 0.9),
  brand: rgb(0.13, 0.29, 0.53), brandSoft: rgb(0.92, 0.95, 0.99),
  tip: rgb(0.02, 0.47, 0.34), tipSoft: rgb(0.91, 0.97, 0.94),
  warn: rgb(0.71, 0.33, 0.04), warnSoft: rgb(1, 0.96, 0.89),
  danger: rgb(0.73, 0.11, 0.11), dangerSoft: rgb(0.99, 0.93, 0.93),
  white: rgb(1, 1, 1),
};

/** Ελληνικά κεφαλαία χωρίς τόνους («Δυσκολία» → «ΔΥΣΚΟΛΙΑ»). */
const upper = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

const FONT_DIR = path.join(process.cwd(), 'lib/install-guide/fonts');

class Writer {
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];
  constructor(readonly doc: PDFDocument, readonly regular: PDFFont, readonly bold: PDFFont) { this.addPage(); }

  addPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.pages.push(this.page);
    this.y = A4.h - M.top;
  }
  ensure(h: number) { if (this.y - h < M.bottom) this.addPage(); }
  lines(text: string, size: number, font: PDFFont, width: number) {
    return wrapText(text, (s) => font.widthOfTextAtSize(s, size), width);
  }
  /** Παράγραφος με αυτόματη αλλαγή σελίδας ανά γραμμή. */
  para(text: string, o: { size?: number; font?: PDFFont; color?: RGB; x?: number; width?: number; gap?: number } = {}) {
    const size = o.size ?? 10.5; const font = o.font ?? this.regular; const x = o.x ?? M.x; const lh = size * 1.38;
    for (const l of this.lines(text, size, font, o.width ?? CW - (x - M.x))) {
      this.ensure(lh);
      this.page.drawText(l, { x, y: this.y - size, size, font, color: o.color ?? C.ink });
      this.y -= lh;
    }
    this.y -= o.gap ?? 4;
  }
  heading(text: string, color: RGB = C.brand) {
    this.ensure(40);
    this.y -= 8;
    this.page.drawRectangle({ x: M.x, y: this.y - 16, width: 3, height: 16, color });
    this.page.drawText(text, { x: M.x + 10, y: this.y - 13, size: 13, font: this.bold, color });
    this.y -= 26;
  }
  bullets(items: string[], o: { x?: number; width?: number; marker?: string; color?: RGB } = {}) {
    const x = o.x ?? M.x; const width = o.width ?? CW;
    for (const it of items) {
      const lines = this.lines(it, 10.5, this.regular, width - 14);
      lines.forEach((l, i) => {
        this.ensure(14.5);
        if (i === 0) this.page.drawText(o.marker ?? '•', { x: x + 2, y: this.y - 10.5, size: 10.5, font: this.bold, color: o.color ?? C.brand });
        this.page.drawText(l, { x: x + 14, y: this.y - 10.5, size: 10.5, font: this.regular, color: C.ink });
        this.y -= 14.5;
      });
      this.y -= 2;
    }
  }
  /** Χρωματιστό πλαίσιο (Συμβουλή / Προσοχή) — μένει ολόκληρο σε μία σελίδα. */
  callout(label: string, text: string, fg: RGB, bg: RGB, x = M.x, width = CW) {
    const size = 10; const lh = 13.6;
    const lines = this.lines(`${label}: ${text}`, size, this.regular, width - 20);
    const h = lines.length * lh + 12;
    this.ensure(h + 4);
    this.page.drawRectangle({ x, y: this.y - h, width, height: h, color: bg });
    this.page.drawRectangle({ x, y: this.y - h, width: 3, height: h, color: fg });
    lines.forEach((l, i) => {
      const yy = this.y - 6 - size - i * lh;
      if (i === 0 && l.startsWith(`${label}:`)) {
        this.page.drawText(`${label}:`, { x: x + 11, y: yy, size, font: this.bold, color: fg });
        const rest = l.slice(label.length + 1);
        this.page.drawText(rest, { x: x + 11 + this.bold.widthOfTextAtSize(`${label}:`, size), y: yy, size, font: this.regular, color: C.ink });
      } else {
        this.page.drawText(l, { x: x + 11, y: yy, size, font: this.regular, color: C.ink });
      }
    });
    this.y -= h + 6;
  }
  /** Εικόνες σε σειρές των δύο, με λεζάντα. */
  images(list: { img: PDFImage; caption: string; n: number }[], x = M.x, width = CW) {
    const gap = 10;
    for (let i = 0; i < list.length; i += 2) {
      const row = list.slice(i, i + 2);
      const cellW = row.length === 1 && list.length === 1 ? Math.min(width, 300) : (width - gap) / 2;
      const dims = row.map(({ img }) => {
        const s = Math.min(cellW / img.width, 210 / img.height);
        return { w: img.width * s, h: img.height * s };
      });
      const rowH = Math.max(...dims.map((d) => d.h)) + 16;
      this.ensure(rowH + 4);
      row.forEach(({ img, caption, n }, k) => {
        const cx = x + k * (cellW + gap);
        const d = dims[k];
        this.page.drawRectangle({ x: cx - 0.5, y: this.y - d.h - 0.5, width: d.w + 1, height: d.h + 1, borderColor: C.line, borderWidth: 0.8 });
        this.page.drawImage(img, { x: cx, y: this.y - d.h, width: d.w, height: d.h });
        const cap = this.lines(`Εικ. ${n} — ${caption}`, 8, this.regular, cellW)[0] ?? '';
        this.page.drawText(cap, { x: cx, y: this.y - d.h - 10, size: 8, font: this.regular, color: C.muted });
      });
      this.y -= rowH + 4;
    }
  }
}

/** Ο οδηγός ως PDF A4. `images[i]` αντιστοιχεί στο δείγμα #(i+1) του prompt. */
export async function renderGuidePdf(guide: InstallGuide, meta: GuidePdfMeta, images: GuidePdfImage[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [reg, bd] = await Promise.all([
    fs.readFile(path.join(FONT_DIR, 'LiberationSans-Regular.ttf')),
    fs.readFile(path.join(FONT_DIR, 'LiberationSans-Bold.ttf')),
  ]);
  const regular = await doc.embedFont(reg, { subset: true });
  const bold = await doc.embedFont(bd, { subset: true });
  doc.setTitle(guide.title || `Οδηγός εγκατάστασης — ${meta.name}`);
  doc.setSubject(`${meta.code} · ${meta.name}`);
  doc.setLanguage('el-GR');
  doc.setCreator('ATELIER');
  doc.setCreationDate(meta.createdAt);

  // Οι εικόνες ενσωματώνονται μία φορά — ένα δείγμα μπορεί να εμφανιστεί σε δύο βήματα.
  const embedded = await Promise.all(images.map((im) => doc.embedJpg(im.data).catch(() => null)));
  const W = new Writer(doc, regular, bold);
  const p = W.page;

  // ── Κεφαλίδα ──
  const titleLines = W.lines(guide.title || `Οδηγός εγκατάστασης — ${meta.name}`, 19, bold, CW - 24);
  const headH = 64 + titleLines.length * 23;
  p.drawRectangle({ x: 0, y: A4.h - headH, width: A4.w, height: headH, color: C.brand });
  p.drawText('ΟΔΗΓΟΣ ΕΓΚΑΤΑΣΤΑΣΗΣ', { x: M.x, y: A4.h - 30, size: 9, font: bold, color: rgb(0.75, 0.84, 0.96) });
  titleLines.forEach((l, i) => p.drawText(l, { x: M.x, y: A4.h - 54 - i * 23, size: 19, font: bold, color: C.white }));
  const sub = `${meta.code} · ${meta.name}`;
  p.drawText(W.lines(sub, 10, regular, CW)[0] ?? sub, { x: M.x, y: A4.h - headH + 16, size: 10, font: regular, color: rgb(0.86, 0.91, 0.98) });
  W.y = A4.h - headH - 16;

  // ── Γρήγορα στοιχεία ──
  const facts: [string, string][] = ([
    ['Κατηγορία', [...new Set([meta.profileLabel, meta.category].filter(Boolean).map((v) => v!.trim()))].join(' · ')],
    ['Δυσκολία', guide.difficulty], ['Διάρκεια', guide.duration], ['Συνεργείο', guide.crew],
  ] as [string, string][]).filter(([, v]) => v);
  if (facts.length) {
    const colW = CW / facts.length;
    const boxH = 38;
    p.drawRectangle({ x: M.x, y: W.y - boxH, width: CW, height: boxH, color: C.brandSoft });
    facts.forEach(([k, v], i) => {
      const x = M.x + 10 + i * colW;
      p.drawText(upper(k), { x, y: W.y - 13, size: 7.5, font: bold, color: C.muted });
      p.drawText(W.lines(v, 10, bold, colW - 16)[0] ?? '', { x, y: W.y - 28, size: 10, font: bold, color: C.ink });
    });
    W.y -= boxH + 12;
  }

  if (guide.summary) W.para(guide.summary, { size: 11, gap: 6 });

  // ── Εργαλεία / υλικά σε δύο στήλες ──
  if (guide.tools.length || guide.materials.length) {
    W.heading('Εργαλεία & υλικά');
    const startY = W.y; const startPage = W.page;
    const half = (CW - 16) / 2;
    const col = (title: string, items: string[], x: number) => {
      W.page = startPage; W.y = startY;
      W.page.drawText(title, { x, y: W.y - 10, size: 10, font: bold, color: C.muted });
      W.y -= 16;
      W.bullets(items.length ? items : ['—'], { x, width: half });
      return { y: W.y, page: W.page };
    };
    const a = col('Εργαλεία', guide.tools, M.x);
    const b = col('Υλικά & αναλώσιμα', guide.materials, M.x + half + 16);
    // Συνέχεια κάτω από τη μακρύτερη στήλη (στην πιο πρόσφατη σελίδα, αν κάποια άλλαξε σελίδα).
    const pa = W.pages.indexOf(a.page); const pb = W.pages.indexOf(b.page);
    const end = pa !== pb ? (pa > pb ? a : b) : (a.y < b.y ? a : b);
    W.page = end.page; W.y = end.y;
  }

  if (guide.preparation.length) { W.heading('Προετοιμασία'); W.bullets(guide.preparation); }

  // ── Βήματα ──
  W.heading('Βήματα εγκατάστασης');
  guide.steps.forEach((s, i) => {
    const n = String(i + 1);
    W.ensure(60);
    const r = 11;
    W.page.drawCircle({ x: M.x + r, y: W.y - r, size: r, color: C.brand });
    W.page.drawText(n, { x: M.x + r - bold.widthOfTextAtSize(n, 11) / 2, y: W.y - r - 4, size: 11, font: bold, color: C.white });
    const tx = M.x + 2 * r + 10; const tw = CW - (tx - M.x);
    const tl = W.lines(s.title || `Βήμα ${n}`, 12, bold, tw);
    tl.forEach((l, k) => W.page.drawText(l, { x: tx, y: W.y - 15 - k * 16, size: 12, font: bold, color: C.ink }));
    W.y -= Math.max(2 * r + 4, tl.length * 16 + 8);
    if (s.detail) W.para(s.detail, { x: tx, width: tw });
    if (s.tip) W.callout('Συμβουλή', s.tip, C.tip, C.tipSoft, tx, tw);
    if (s.warning) W.callout('Προσοχή', s.warning, C.warn, C.warnSoft, tx, tw);
    const imgs = s.images.map((k) => ({ img: embedded[k - 1], caption: images[k - 1]?.caption ?? '', n: k })).filter((x): x is { img: PDFImage; caption: string; n: number } => !!x.img);
    if (imgs.length) W.images(imgs, tx, tw);
    W.y -= 6;
  });

  // Δείγματα που δεν μπήκαν σε κανένα βήμα — δεν χάνονται, μπαίνουν σε δική τους ενότητα.
  const used = new Set(guide.steps.flatMap((s) => s.images));
  const rest = embedded.map((img, i) => ({ img, caption: images[i].caption, n: i + 1 })).filter((x): x is { img: PDFImage; caption: string; n: number } => !!x.img && !used.has(x.n));
  if (rest.length) { W.heading('Δείγματα εγκατάστασης'); W.images(rest); }

  if (guide.safety.length) { W.heading('Ασφάλεια', C.danger); W.bullets(guide.safety, { color: C.danger, marker: '!' }); }
  if (guide.qualityChecks.length) { W.heading('Έλεγχος ποιότητας', C.tip); W.bullets(guide.qualityChecks, { color: C.tip }); }
  if (guide.commonMistakes.length) { W.heading('Συνηθισμένα λάθη', C.warn); W.bullets(guide.commonMistakes, { color: C.warn }); }
  if (guide.aftercare.length) { W.heading('Μετά την εγκατάσταση'); W.bullets(guide.aftercare); }

  // ── Υποσέλιδο σε κάθε σελίδα ──
  const date = meta.createdAt.toLocaleDateString('el-GR', { timeZone: 'Europe/Athens' });
  W.pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M.x, y: 36 }, end: { x: A4.w - M.x, y: 36 }, thickness: 0.6, color: C.line });
    const left = W.lines(`${meta.code} · ${meta.name} — ${date}${meta.author ? ` · ${meta.author}` : ''}`, 8, regular, CW - 80)[0] ?? '';
    pg.drawText(left, { x: M.x, y: 24, size: 8, font: regular, color: C.muted });
    const right = `Σελίδα ${i + 1} / ${W.pages.length}`;
    pg.drawText(right, { x: A4.w - M.x - regular.widthOfTextAtSize(right, 8), y: 24, size: 8, font: regular, color: C.muted });
  });

  return Buffer.from(await doc.save());
}
