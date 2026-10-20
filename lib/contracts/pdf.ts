// lib/contracts/pdf.ts — PDF προσφοράς/σύμβασης (pdf-lib + fontkit, LiberationSans για τα Ελληνικά).
// Δεν ξέρει τίποτα για βάση ή CDN: παίρνει δεδομένα και δίνει bytes. Τα ποσά/γραμμές/milestones
// τυπώνονται από τη βάση· το AI δίνει μόνο το κείμενο (άρθρα, οδηγίες).
import fs from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { wrapText } from '@/lib/install-guide/pdf';
import type { InstallGuide } from '@/lib/install-guide/guide';
import { dayEl, eur, qtyEl, type ContractDoc } from './core';

export type PdfLine = { kind: string; code: string | null; name: string; notes: string | null; qty: number; unit: string | null; unitPrice: number | null; discount: number; amount: number };
export type PdfMilestone = { title: string; deliverables: string | null; dueDate: string | null; amount: number };
export type ContractPdfData = {
  ref: string;
  /** OFFER · CONTRACT · PARTY */
  docKind: 'OFFER' | 'CONTRACT' | 'PARTY';
  version: number;
  projectTitle: string;
  kindLabel: string;
  issuedOn: Date;
  validUntil?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  site?: string | null;
  company: { name: string; legalName?: string | null; vat?: string | null; taxOffice?: string | null; address?: string | null; phones?: string[]; email?: string | null; website?: string | null };
  counterparty: { name: string; afm?: string | null; address?: string | null; email?: string | null; phone?: string | null; specialty?: string | null };
  lines: PdfLine[];
  totals: { net: number; vat: number; gross: number; vatRate: number } | { fee: number };
  milestones: PdfMilestone[];
  doc: ContractDoc;
  itemGuides: { item: string; guide: InstallGuide }[];
  /** Χώροι του έργου με το τελικό δάπεδο (αν η σύμβαση είναι συνδεδεμένη με έργο). */
  rooms?: { name: string; areaM2: number; finish: string; item: string | null; pattern: string | null }[];
};

const A4 = { w: 595.28, h: 841.89 };
const M = { x: 50, top: 54, bottom: 60 };
const CW = A4.w - M.x * 2;
// Παλέτα «πέτρα»: βαθύ ανθρακί, ζεστό χρυσό-ώχρα, απαλό ασβεστόλευκο.
const C = {
  ink: rgb(0.12, 0.12, 0.13), body: rgb(0.22, 0.23, 0.25), muted: rgb(0.47, 0.47, 0.5), line: rgb(0.87, 0.85, 0.82),
  night: rgb(0.13, 0.14, 0.16), gold: rgb(0.72, 0.56, 0.3), goldSoft: rgb(0.97, 0.94, 0.88), stone: rgb(0.965, 0.957, 0.945),
  warn: rgb(0.7, 0.33, 0.06), warnSoft: rgb(1, 0.95, 0.88), ok: rgb(0.1, 0.45, 0.32), okSoft: rgb(0.92, 0.97, 0.94), white: rgb(1, 1, 1),
};
const FONT_DIR = path.join(process.cwd(), 'lib/install-guide/fonts');
const upper = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

const KIND_TITLE: Record<ContractPdfData['docKind'], string> = {
  OFFER: 'ΠΡΟΣΦΟΡΑ', CONTRACT: 'ΣΥΜΒΑΣΗ ΠΩΛΗΣΗΣ & ΕΚΤΕΛΕΣΗΣ', PARTY: 'ΣΥΜΒΑΣΗ ΑΝΑΘΕΣΗΣ ΕΡΓΑΣΙΩΝ',
};

class W {
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];
  constructor(readonly doc: PDFDocument, readonly R: PDFFont, readonly B: PDFFont) { this.add(); }
  add() { this.page = this.doc.addPage([A4.w, A4.h]); this.pages.push(this.page); this.y = A4.h - M.top; }
  ensure(h: number) { if (this.y - h < M.bottom) { this.add(); return true; } return false; }
  wrap(t: string, size: number, font: PDFFont, width: number) { return wrapText(t, (s) => font.widthOfTextAtSize(s, size), width); }
  text(t: string, x: number, y: number, size: number, font: PDFFont, color: RGB = C.ink) { this.page.drawText(t, { x, y, size, font, color }); }
  para(t: string, o: { size?: number; font?: PDFFont; color?: RGB; x?: number; width?: number; gap?: number; lh?: number } = {}) {
    const size = o.size ?? 10; const font = o.font ?? this.R; const x = o.x ?? M.x; const lh = o.lh ?? size * 1.45;
    for (const l of this.wrap(t, size, font, o.width ?? CW - (x - M.x))) {
      this.ensure(lh);
      this.text(l, x, this.y - size, size, font, o.color ?? C.body);
      this.y -= lh;
    }
    this.y -= o.gap ?? 5;
  }
  /** Τίτλος ενότητας: μικρά κεφαλαία σε χρυσό με λεπτή γραμμή. */
  section(t: string, o: { newPage?: boolean } = {}) {
    if (o.newPage) this.add(); else this.ensure(60);
    this.y -= 10;
    const label = upper(t);
    this.text(label, M.x, this.y - 9, 9, this.B, C.gold);
    const w = this.B.widthOfTextAtSize(label, 9);
    this.page.drawLine({ start: { x: M.x + w + 10, y: this.y - 6 }, end: { x: A4.w - M.x, y: this.y - 6 }, thickness: 0.6, color: C.line });
    this.y -= 22;
  }
  bullets(items: string[], o: { x?: number; width?: number; color?: RGB; marker?: 'dot' | 'check' | 'warn' } = {}) {
    const x = o.x ?? M.x; const width = o.width ?? CW;
    for (const it of items) {
      this.wrap(it, 10, this.R, width - 16).forEach((l, i) => {
        this.ensure(14.5);
        if (i === 0) {
          const cy = this.y - 6.5;
          if (o.marker === 'check') {
            this.page.drawLine({ start: { x: x + 1, y: cy }, end: { x: x + 4, y: cy - 3 }, thickness: 1.3, color: o.color ?? C.ok });
            this.page.drawLine({ start: { x: x + 4, y: cy - 3 }, end: { x: x + 9, y: cy + 3.5 }, thickness: 1.3, color: o.color ?? C.ok });
          } else if (o.marker === 'warn') {
            this.text('!', x + 3, this.y - 10, 10, this.B, o.color ?? C.warn);
          } else {
            this.page.drawRectangle({ x: x + 2, y: cy - 2, width: 4, height: 4, color: o.color ?? C.gold });
          }
        }
        this.text(l, x + 16, this.y - 10, 10, this.R, C.body);
        this.y -= 14.5;
      });
      this.y -= 2;
    }
  }
  box(lines: string[], fg: RGB, bg: RGB, label?: string) {
    const size = 9.5; const lh = 13.5;
    const all = lines.flatMap((t) => this.wrap(t, size, this.R, CW - 26));
    const h = all.length * lh + (label ? 16 : 0) + 14;
    this.ensure(Math.min(h, 400) + 4);
    this.page.drawRectangle({ x: M.x, y: this.y - h, width: CW, height: h, color: bg });
    this.page.drawRectangle({ x: M.x, y: this.y - h, width: 2.5, height: h, color: fg });
    let yy = this.y - 8;
    if (label) { this.text(upper(label), M.x + 13, yy - 8, 7.5, this.B, fg); yy -= 16; }
    for (const l of all) { this.text(l, M.x + 13, yy - size, size, this.R, C.body); yy -= lh; }
    this.y -= h + 8;
  }
}

type Col = { label: string; w: number; align?: 'left' | 'right' };

/** Πίνακας με αναδίπλωση στην πρώτη «φαρδιά» στήλη και επανάληψη κεφαλίδας σε νέα σελίδα. */
function table(w: W, cols: Col[], rows: { cells: string[]; sub?: string | null }[], wrapCol: number) {
  const size = 9; const lh = 12;
  const totalW = cols.reduce((t, c) => t + c.w, 0);
  const xs: number[] = [];
  cols.reduce((x, c) => { xs.push(x); return x + (c.w / totalW) * CW; }, M.x);
  const widths = cols.map((c) => (c.w / totalW) * CW);
  const header = () => {
    w.page.drawRectangle({ x: M.x, y: w.y - 20, width: CW, height: 20, color: C.night });
    cols.forEach((c, i) => {
      const label = upper(c.label);
      const tw = w.B.widthOfTextAtSize(label, 7.5);
      w.text(label, c.align === 'right' ? xs[i] + widths[i] - 6 - tw : xs[i] + 6, w.y - 13.5, 7.5, w.B, C.white);
    });
    w.y -= 20;
  };
  w.ensure(46);
  header();
  rows.forEach((r, ri) => {
    const main = w.wrap(r.cells[wrapCol] ?? '', size, w.R, widths[wrapCol] - 12);
    const sub = r.sub ? w.wrap(r.sub, 8, w.R, widths[wrapCol] - 12) : [];
    const h = Math.max(1, main.length) * lh + sub.length * 10.5 + 10;
    if (w.ensure(h)) header();
    if (ri % 2 === 1) w.page.drawRectangle({ x: M.x, y: w.y - h, width: CW, height: h, color: C.stone });
    cols.forEach((c, i) => {
      if (i === wrapCol) {
        main.forEach((l, k) => w.text(l, xs[i] + 6, w.y - 5 - size - k * lh, size, w.R, C.ink));
        sub.forEach((l, k) => w.text(l, xs[i] + 6, w.y - 5 - size - main.length * lh - k * 10.5, 8, w.R, C.muted));
        return;
      }
      const t = r.cells[i] ?? '';
      const tw = w.R.widthOfTextAtSize(t, size);
      w.text(t, c.align === 'right' ? xs[i] + widths[i] - 6 - tw : xs[i] + 6, w.y - 5 - size, size, w.R, C.ink);
    });
    w.y -= h;
  });
  w.page.drawLine({ start: { x: M.x, y: w.y }, end: { x: A4.w - M.x, y: w.y }, thickness: 0.8, color: C.night });
  w.y -= 6;
}

/** Γραμμές σύνοψης ποσών δεξιά (Καθαρή αξία / ΦΠΑ / Σύνολο). */
function sums(w: W, rows: [string, string, boolean?][]) {
  const bw = 220; const x = A4.w - M.x - bw;
  w.ensure(rows.length * 18 + 10);
  rows.forEach(([k, v, strong]) => {
    if (strong) {
      w.page.drawRectangle({ x, y: w.y - 22, width: bw, height: 22, color: C.goldSoft });
      w.page.drawRectangle({ x, y: w.y - 22, width: 2.5, height: 22, color: C.gold });
    }
    const size = strong ? 11 : 9.5; const font = strong ? w.B : w.R;
    w.text(k, x + 10, w.y - (strong ? 15 : 13), size, font, strong ? C.ink : C.muted);
    w.text(v, x + bw - 10 - font.widthOfTextAtSize(v, size), w.y - (strong ? 15 : 13), size, font, C.ink);
    w.y -= strong ? 24 : 17;
  });
  w.y -= 6;
}

function partyCard(w: W, x: number, width: number, top: number, label: string, name: string, rows: string[]) {
  const nameLines = w.wrap(name, 11.5, w.B, width - 24);
  const detail = rows.flatMap((r) => w.wrap(r, 8.8, w.R, width - 24));
  const h = 22 + nameLines.length * 15 + detail.length * 12.5 + 12;
  w.page.drawRectangle({ x, y: top - h, width, height: h, color: C.stone });
  w.page.drawRectangle({ x, y: top - 2, width, height: 2, color: C.gold });
  w.text(upper(label), x + 12, top - 16, 7.5, w.B, C.gold);
  nameLines.forEach((l, i) => w.text(l, x + 12, top - 32 - i * 15, 11.5, w.B, C.ink));
  detail.forEach((l, i) => w.text(l, x + 12, top - 32 - nameLines.length * 15 - i * 12.5 + 1, 8.8, w.R, C.body));
  return h;
}

export async function renderContractPdf(d: ContractPdfData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [reg, bd] = await Promise.all([
    fs.readFile(path.join(FONT_DIR, 'LiberationSans-Regular.ttf')),
    fs.readFile(path.join(FONT_DIR, 'LiberationSans-Bold.ttf')),
  ]);
  const R = await doc.embedFont(reg, { subset: true });
  const B = await doc.embedFont(bd, { subset: true });
  const docTitle = d.doc.title || KIND_TITLE[d.docKind];
  doc.setTitle(`${docTitle} — ${d.ref}`);
  doc.setSubject(d.projectTitle);
  doc.setAuthor(d.company.legalName || d.company.name);
  doc.setLanguage('el-GR');
  doc.setCreator('ATELIER');
  doc.setCreationDate(d.issuedOn);
  const w = new W(doc, R, B);
  const party = d.docKind === 'PARTY';

  // ── Κεφαλίδα: σκούρα ζώνη με επωνυμία και αριθμό ──
  const p = w.page;
  const headH = 132;
  p.drawRectangle({ x: 0, y: A4.h - headH, width: A4.w, height: headH, color: C.night });
  p.drawRectangle({ x: 0, y: A4.h - headH, width: A4.w, height: 3, color: C.gold });
  w.text(upper(d.company.name), M.x, A4.h - 38, 10, B, C.gold);
  const contact = [d.company.address, d.company.phones?.[0], d.company.email].filter(Boolean).join('  ·  ');
  w.text(w.wrap(contact, 7.5, R, CW * 0.62)[0] ?? '', M.x, A4.h - 51, 7.5, R, rgb(0.72, 0.72, 0.74));
  const refLabel = `${d.ref}${d.version > 1 ? ` · έκδ. ${d.version}` : ''}`;
  w.text(refLabel, A4.w - M.x - B.widthOfTextAtSize(refLabel, 9), A4.h - 38, 9, B, C.white);
  const issued = `Ημερομηνία ${dayEl(d.issuedOn)}`;
  w.text(issued, A4.w - M.x - R.widthOfTextAtSize(issued, 7.5), A4.h - 51, 7.5, R, rgb(0.72, 0.72, 0.74));
  w.text(KIND_TITLE[d.docKind], M.x, A4.h - 84, 8.5, B, C.gold);
  const tl = w.wrap(d.projectTitle, 20, B, CW);
  tl.slice(0, 2).forEach((l, i) => w.text(l, M.x, A4.h - 106 - i * 23, 20, B, C.white));
  w.y = A4.h - headH - 22;

  // ── Γρήγορα στοιχεία ──
  const facts: [string, string][] = ([
    ['Τύπος', d.kindLabel],
    ['Τοποθεσία', d.site ?? ''],
    d.docKind === 'OFFER' ? ['Ισχύς έως', d.validUntil ? dayEl(d.validUntil) : ''] : ['Διάρκεια', d.startDate || d.endDate ? `${dayEl(d.startDate)} – ${dayEl(d.endDate)}` : ''],
    [party ? 'Συνολική αμοιβή' : 'Σύνολο με ΦΠΑ', 'fee' in d.totals ? eur(d.totals.fee) : eur(d.totals.gross)],
  ] as [string, string][]).filter(([, v]) => v);
  const colW = CW / facts.length;
  const factLines = facts.map(([, v]) => w.wrap(v, 9.5, B, colW - 20).slice(0, 2));
  const fh = 34 + Math.max(...factLines.map((l) => l.length)) * 12;
  w.page.drawRectangle({ x: M.x, y: w.y - fh, width: CW, height: fh, color: C.goldSoft });
  facts.forEach(([k], i) => {
    const x = M.x + 12 + i * colW;
    if (i) w.page.drawLine({ start: { x: x - 12, y: w.y - 9 }, end: { x: x - 12, y: w.y - fh + 9 }, thickness: 0.5, color: C.line });
    w.text(upper(k), x, w.y - 16, 7, B, C.muted);
    factLines[i].forEach((l, k) => w.text(l, x, w.y - 31 - k * 12, 9.5, B, C.ink));
  });
  w.y -= fh + 18;

  // ── Συμβαλλόμενοι ──
  const half = (CW - 14) / 2;
  const company = [
    d.company.legalName && d.company.legalName !== d.company.name ? d.company.legalName : null,
    [d.company.vat ? `ΑΦΜ ${d.company.vat}` : null, d.company.taxOffice ? `ΔΟΥ ${d.company.taxOffice}` : null].filter(Boolean).join(' · ') || null,
    d.company.address ?? null, d.company.phones?.length ? `Τηλ. ${d.company.phones.join(', ')}` : null, d.company.email ?? null,
  ].filter((x): x is string => !!x);
  const cp = [
    d.counterparty.specialty ?? null, d.counterparty.afm ? `ΑΦΜ ${d.counterparty.afm}` : null, d.counterparty.address ?? null,
    d.counterparty.phone ? `Τηλ. ${d.counterparty.phone}` : null, d.counterparty.email ?? null,
  ].filter((x): x is string => !!x);
  const top = w.y;
  const h1 = partyCard(w, M.x, half, top, d.docKind === 'OFFER' ? 'Από' : party ? 'Αναθέτουσα (πρώτη συμβαλλόμενη)' : 'Πωλητής (πρώτος συμβαλλόμενος)', d.company.name, company);
  const h2 = partyCard(w, M.x + half + 14, half, top, d.docKind === 'OFFER' ? 'Προς' : party ? 'Ανάδοχος (δεύτερος συμβαλλόμενος)' : 'Αγοραστής (δεύτερος συμβαλλόμενος)', d.counterparty.name, cp.length ? cp : ['—']);
  w.y = top - Math.max(h1, h2) - 18;

  if (d.doc.preamble) w.para(d.doc.preamble, { size: 10.2 });
  if (d.doc.scopeSummary) w.box([d.doc.scopeSummary], C.gold, C.stone, party ? 'Αντικείμενο ανάθεσης' : 'Αντικείμενο');

  // ── Πίνακας γραμμών ──
  w.section(party ? 'Πίνακας εργασιών & αμοιβής' : 'Υλικά & υπηρεσίες');
  if (party) {
    table(w, [{ label: '#', w: 4 }, { label: 'Εργασία / υλικό', w: 52 }, { label: 'Ποσότητα', w: 14, align: 'right' }, { label: 'Αμοιβή', w: 16, align: 'right' }],
      d.lines.map((l, i) => ({ cells: [String(i + 1), l.name, `${qtyEl(l.qty)} ${l.unit ?? ''}`.trim(), eur(l.amount)], sub: [l.code, l.notes].filter(Boolean).join(' · ') || null })), 1);
  } else {
    table(w, [{ label: '#', w: 4 }, { label: 'Περιγραφή', w: 44 }, { label: 'Ποσότητα', w: 13, align: 'right' }, { label: 'Τιμή', w: 12, align: 'right' }, { label: 'Έκπτ.', w: 8, align: 'right' }, { label: 'Αξία', w: 14, align: 'right' }],
      d.lines.map((l, i) => ({
        cells: [String(i + 1), l.name, `${qtyEl(l.qty)} ${l.unit ?? ''}`.trim(), l.unitPrice == null ? '' : eur(l.unitPrice), l.discount ? `${qtyEl(l.discount)}%` : '', eur(l.amount)],
        sub: [l.kind === 'SERVICE' ? 'Εργασία' : null, l.code, l.notes].filter(Boolean).join(' · ') || null,
      })), 1);
  }
  if ('fee' in d.totals) sums(w, [['Συνολική αμοιβή', eur(d.totals.fee), true]]);
  else sums(w, [['Καθαρή αξία', eur(d.totals.net)], [`ΦΠΑ ${qtyEl(d.totals.vatRate)}%`, eur(d.totals.vat)], ['Σύνολο', eur(d.totals.gross), true]]);

  // ── Χώροι & τελικά δάπεδα ──
  if (d.rooms?.length) {
    w.section('Χώροι & τελικά δάπεδα');
    table(w, [{ label: '#', w: 4 }, { label: 'Χώρος', w: 22 }, { label: 'Εμβαδό', w: 12, align: 'right' }, { label: 'Δάπεδο', w: 14 }, { label: 'Υλικό', w: 34 }],
      d.rooms.map((r, i) => ({ cells: [String(i + 1), r.name, `${qtyEl(r.areaM2)} m²`, r.finish, r.item ?? '—'], sub: r.pattern })), 4);
  }

  // ── Πρόγραμμα παραδοτέων & πληρωμών ──
  if (d.milestones.length) {
    w.section('Πρόγραμμα παραδοτέων & πληρωμών');
    table(w, [{ label: '#', w: 4 }, { label: 'Ορόσημο & παραδοτέα', w: 56 }, { label: 'Προθεσμία', w: 16, align: 'right' }, { label: 'Πληρωμή', w: 16, align: 'right' }],
      d.milestones.map((m, i) => ({ cells: [String(i + 1), m.title, m.dueDate ? dayEl(m.dueDate) : '—', m.amount ? eur(m.amount) : '—'], sub: m.deliverables })), 1);
  }

  // ── Άρθρα ──
  if (d.doc.articles.length) {
    w.section(d.docKind === 'OFFER' ? 'Όροι προσφοράς' : 'Όροι σύμβασης');
    d.doc.articles.forEach((a, i) => {
      w.ensure(56);
      const label = d.docKind === 'OFFER' ? `${i + 1}.` : `Άρθρο ${i + 1}`;
      w.text(upper(label), M.x, w.y - 9, 8, B, C.gold);
      const hl = w.wrap(a.heading, 11.5, B, CW);
      hl.forEach((l, k) => w.text(l, M.x, w.y - 25 - k * 15, 11.5, B, C.ink));
      w.y -= 22 + hl.length * 15;
      a.paragraphs.forEach((t) => w.para(t));
      if (a.bullets.length) w.bullets(a.bullets);
      w.y -= 6;
    });
  }
  // Το κλείσιμο μένει στην ίδια σελίδα με τις υπογραφές.
  const closingH = d.doc.closing ? w.wrap(d.doc.closing, 10, R, CW).length * 14.5 + 10 : 0;
  w.ensure(closingH + 132);
  if (d.doc.closing) w.para(d.doc.closing, { gap: 10 });

  // ── Υπογραφές ──
  w.y -= 16;
  const sigW = (CW - 40) / 2;
  const sig = (x: number, label: string, name: string) => {
    w.text(upper(label), x, w.y - 9, 7.5, B, C.gold);
    w.page.drawLine({ start: { x, y: w.y - 72 }, end: { x: x + sigW, y: w.y - 72 }, thickness: 0.7, color: C.muted });
    w.text(w.wrap(name, 9.5, B, sigW)[0] ?? '', x, w.y - 86, 9.5, B, C.ink);
    w.text('Υπογραφή & σφραγίδα', x, w.y - 99, 7.5, R, C.muted);
  };
  sig(M.x, d.docKind === 'OFFER' ? 'Για την εταιρία' : 'Ο πρώτος συμβαλλόμενος', d.company.legalName || d.company.name);
  sig(M.x + sigW + 40, d.docKind === 'OFFER' ? 'Αποδοχή πελάτη' : 'Ο δεύτερος συμβαλλόμενος', d.counterparty.name);
  w.y -= 112;

  // ── Παράρτημα Α: οδηγίες εγκατάστασης (AI) ──
  if (d.doc.installation.length) {
    w.section(party ? 'Παράρτημα Α — Οδηγίες εγκατάστασης' : 'Τι περιλαμβάνει η τοποθέτηση', { newPage: party });
    d.doc.installation.forEach((s) => {
      w.ensure(50);
      const hl = w.wrap(s.heading, 12, B, CW);
      hl.forEach((l, k) => w.text(l, M.x, w.y - 12 - k * 15, 12, B, C.ink));
      w.y -= 18 + hl.length * 15 - 12;
      s.steps.forEach((st, i) => {
        const n = String(i + 1);
        const lines = w.wrap(st, 10, R, CW - 30);
        w.ensure(Math.min(lines.length * 14 + 6, 120));
        const r = 8.5;
        w.page.drawCircle({ x: M.x + r, y: w.y - r - 1, size: r, color: C.night });
        w.text(n, M.x + r - B.widthOfTextAtSize(n, 8.5) / 2, w.y - r - 4, 8.5, B, C.white);
        lines.forEach((l, k) => { if (k) w.ensure(14); w.text(l, M.x + 26, w.y - 11, 10, R, C.body); w.y -= 14; });
        w.y -= Math.max(0, 2 * r + 4 - lines.length * 14) + 3;
      });
      if (s.warnings.length) w.box(s.warnings, C.warn, C.warnSoft, 'Προσοχή');
      if (s.checks.length) { w.text(upper('Έλεγχοι ποιότητας'), M.x, w.y - 9, 7.5, B, C.ok); w.y -= 16; w.bullets(s.checks, { marker: 'check', color: C.ok }); }
      w.y -= 8;
    });
  }

  // ── Παράρτημα Β: οι οδηγοί εγκατάστασης των ειδών ΑΥΤΟΥΣΙΟΙ (πρωτογενής πηγή) ──
  if (party && d.itemGuides.length) {
    w.section('Παράρτημα Β — Οδηγοί εγκατάστασης ειδών', { newPage: true });
    for (const { item, guide: g } of d.itemGuides) {
      w.ensure(70);
      w.page.drawRectangle({ x: M.x, y: w.y - 26, width: CW, height: 26, color: C.stone });
      w.text(w.wrap(g.title || item, 11.5, B, CW - 24)[0] ?? item, M.x + 12, w.y - 17, 11.5, B, C.ink);
      w.y -= 34;
      if (g.summary) w.para(g.summary, { size: 9.5 });
      const meta = [g.difficulty && `Δυσκολία: ${g.difficulty}`, g.duration && `Διάρκεια: ${g.duration}`, g.crew && `Συνεργείο: ${g.crew}`].filter(Boolean).join('  ·  ');
      if (meta) w.para(meta, { size: 8.5, color: C.muted });
      if (g.tools.length) { w.text(upper('Εργαλεία'), M.x, w.y - 9, 7.5, B, C.gold); w.y -= 15; w.bullets(g.tools); }
      if (g.preparation.length) { w.text(upper('Προετοιμασία'), M.x, w.y - 9, 7.5, B, C.gold); w.y -= 15; w.bullets(g.preparation); }
      g.steps.forEach((s, i) => {
        w.ensure(34);
        w.text(`${i + 1}. ${w.wrap(s.title, 10.5, B, CW - 20)[0] ?? ''}`, M.x, w.y - 10.5, 10.5, B, C.ink);
        w.y -= 16;
        if (s.detail) w.para(s.detail, { x: M.x + 14, size: 9.5 });
        if (s.warning) w.box([s.warning], C.warn, C.warnSoft, 'Προσοχή');
      });
      if (g.safety.length) { w.text(upper('Ασφάλεια'), M.x, w.y - 9, 7.5, B, C.warn); w.y -= 15; w.bullets(g.safety, { marker: 'warn' }); }
      if (g.qualityChecks.length) { w.text(upper('Έλεγχος ποιότητας'), M.x, w.y - 9, 7.5, B, C.ok); w.y -= 15; w.bullets(g.qualityChecks, { marker: 'check' }); }
      w.y -= 10;
    }
  }

  // ── Υποσέλιδο ──
  w.pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M.x, y: 40 }, end: { x: A4.w - M.x, y: 40 }, thickness: 0.5, color: C.line });
    const initials = i > 0 && d.docKind !== 'OFFER';
    const left = w.wrap(`${d.company.legalName || d.company.name}  ·  ${d.ref}  ·  ${d.projectTitle}`, 7.5, R, initials ? CW * 0.4 : CW - 90)[0] ?? '';
    pg.drawText(left, { x: M.x, y: 27, size: 7.5, font: R, color: C.muted });
    const right = `Σελίδα ${i + 1} από ${w.pages.length}`;
    pg.drawText(right, { x: A4.w - M.x - R.widthOfTextAtSize(right, 7.5), y: 27, size: 7.5, font: R, color: C.muted });
    // μονογραφές σε κάθε σελίδα της σύμβασης πλην της πρώτης
    if (initials) pg.drawText('Μονογραφές:  ____  /  ____', { x: M.x + CW * 0.48, y: 27, size: 7, font: R, color: C.muted });
  });

  return Buffer.from(await doc.save());
}
