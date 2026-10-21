// lib/statement/pdf.ts — PDF «Κατάσταση λογαριασμού» (A4, pdf-lib + LiberationSans για τα Ελληνικά).
// Δεν ξέρει τίποτα για βάση ή SoftOne: παίρνει έτοιμο StatementDoc και δίνει bytes.
import fs from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { wrapText } from '@/lib/install-guide/pdf';
import { AGING_LABEL, balanceEl, dayEl, eurEl, overdue, periodLabel } from '@/lib/statement/core';
import { paymentReference, statementRef, type StatementDoc } from '@/lib/statement/email';

const A4 = { w: 595.28, h: 841.89 };
const M = { x: 44, top: 42, bottom: 48 };
const CW = A4.w - M.x * 2;
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
// Ίδια παλέτα με τα email (lib/email/layout.ts).
const C = {
  ink: hex('#1C1B19'), body: hex('#3D3934'), muted: hex('#6B655E'), line: hex('#E6E0D7'), soft: hex('#FAF8F5'),
  accent: hex('#8A5A12'), accentSoft: hex('#F7F0E4'), warn: hex('#8A4A0B'), warnSoft: hex('#FBF2E4'), good: hex('#2E6A3E'), white: rgb(1, 1, 1),
};
const FONT_DIR = path.join(process.cwd(), 'lib/install-guide/fonts');
const upper = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

type Col = { label: string; w: number; align?: 'left' | 'right' };

class Pdf {
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];
  constructor(readonly doc: PDFDocument, readonly reg: PDFFont, readonly bold: PDFFont) { this.add(); }
  add() { this.page = this.doc.addPage([A4.w, A4.h]); this.pages.push(this.page); this.y = A4.h - M.top; }
  ensure(h: number) { if (this.y - h < M.bottom) { this.add(); return true; } return false; }
  w(s: string, size: number, f = this.reg) { return f.widthOfTextAtSize(s, size); }
  text(s: string, x: number, y: number, o: { size?: number; font?: PDFFont; color?: RGB; align?: 'left' | 'right' } = {}) {
    const size = o.size ?? 9;
    const font = o.font ?? this.reg;
    const str = s;
    const x0 = o.align === 'right' ? x - this.w(str, size, font) : x;
    this.page.drawText(str, { x: x0, y, size, font, color: o.color ?? C.ink });
  }
  /** Κόβει με «…» ώστε να χωρά. */
  fit(s: string, width: number, size: number, f = this.reg) {
    if (this.w(s, size, f) <= width) return s;
    let t = s;
    while (t.length > 1 && this.w(`${t}…`, size, f) > width) t = t.slice(0, -1);
    return `${t}…`;
  }
  rect(x: number, y: number, w: number, h: number, color: RGB) { this.page.drawRectangle({ x, y, width: w, height: h, color }); }
  hline(y: number, color = C.line, t = 0.6, x = M.x, w = CW) { this.page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness: t, color }); }
  lines(s: string, size: number, width: number, f = this.reg) { return wrapText(s, (t) => this.w(t, size, f), width); }

  sectionTitle(t: string) {
    this.ensure(46);
    this.y -= 14;
    this.text(upper(t), M.x, this.y - 9, { size: 8.5, font: this.bold, color: C.accent });
    this.y -= 16;
  }

  tableHead(cols: Col[]) {
    let x = M.x;
    for (const c of cols) {
      this.text(upper(c.label), c.align === 'right' ? x + c.w - 4 : x + 4, this.y - 9, { size: 7, font: this.bold, color: C.muted, align: c.align });
      x += c.w;
    }
    this.y -= 14;
    this.hline(this.y, C.ink, 0.8);
  }

  /** Πίνακας με επανάληψη κεφαλίδας σε κάθε νέα σελίδα. */
  table(cols: Col[], rows: { cells: string[]; bold?: boolean; tint?: RGB; color?: RGB }[], foot?: string[]) {
    const H = 17;
    this.ensure(H * 3);
    this.tableHead(cols);
    rows.forEach((r, i) => {
      if (this.ensure(H)) this.tableHead(cols);
      if (r.tint) this.rect(M.x, this.y - H, CW, H, r.tint);
      else if (i % 2 === 1) this.rect(M.x, this.y - H, CW, H, C.soft);
      let x = M.x;
      r.cells.forEach((v, j) => {
        const c = cols[j];
        const f = r.bold ? this.bold : this.reg;
        this.text(this.fit(v, c.w - 8, 8.5, f), c.align === 'right' ? x + c.w - 4 : x + 4, this.y - 11.5, { size: 8.5, font: f, align: c.align, color: r.color ?? C.ink });
        x += c.w;
      });
      this.y -= H;
    });
    if (foot) {
      if (this.ensure(H + 4)) this.tableHead(cols);
      this.hline(this.y, C.ink, 0.8);
      let x = M.x;
      foot.forEach((v, j) => {
        const c = cols[j];
        if (v) this.text(this.fit(v, c.w - 8, 9, this.bold), c.align === 'right' ? x + c.w - 4 : x + 4, this.y - 12.5, { size: 9, font: this.bold, align: c.align });
        x += c.w;
      });
      this.y -= H + 2;
    }
  }
}

export async function renderStatementPdf(d: StatementDoc): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [r, b] = await Promise.all([
    fs.readFile(path.join(FONT_DIR, 'LiberationSans-Regular.ttf')),
    fs.readFile(path.join(FONT_DIR, 'LiberationSans-Bold.ttf')),
  ]);
  const reg = await doc.embedFont(r, { subset: true });
  const bold = await doc.embedFont(b, { subset: true });
  const { brand, customer: c, statement: s } = d;
  const ref = statementRef(d);
  doc.setTitle(`Κατάσταση λογαριασμού — ${c.name} — ${periodLabel(s)}`);
  doc.setAuthor(brand.legalName || brand.name);
  doc.setSubject(ref);
  doc.setCreator(brand.name);
  doc.setLanguage('el-GR');

  const p = new Pdf(doc, reg, bold);

  // ── Κεφαλίδα: εταιρεία αριστερά, τίτλος + στοιχεία έκδοσης δεξιά ───────────────────────────
  p.rect(0, A4.h - 4, A4.w, 4, C.accent);
  const y = p.y;
  p.text(upper(brand.name), M.x, y - 16, { size: 15, font: bold });
  const legal = [brand.legalName, brand.vat ? `ΑΦΜ ${brand.vat}` : null, brand.taxOffice ? `ΔΟΥ ${brand.taxOffice}` : null].filter(Boolean).join(' · ');
  const contact = [brand.address, (brand.phones ?? []).slice(0, 2).join(' · '), brand.email, brand.website?.replace(/^https?:\/\//, '').replace(/\/$/, '')].filter(Boolean) as string[];
  let ly = y - 32;
  for (const l of [legal, ...contact]) {
    if (!l) continue;
    p.text(p.fit(l, CW * 0.55, 8), M.x, ly, { size: 8, color: C.muted });
    ly -= 11;
  }
  const rx = M.x + CW;
  p.text('ΚΑΤΑΣΤΑΣΗ ΛΟΓΑΡΙΑΣΜΟΥ', rx, y - 14, { size: 11, font: bold, color: C.accent, align: 'right' });
  const meta: [string, string][] = [['Αρ. αναφοράς', ref], ['Ημ/νία έκδοσης', dayEl(d.issuedOn)], ['Περίοδος', periodLabel(s)]];
  let my = y - 32;
  for (const [k, v] of meta) {
    p.text(v, rx, my, { size: 8.5, font: bold, align: 'right' });
    p.text(k, rx - p.w(v, 8.5, bold) - 8, my, { size: 8, color: C.muted, align: 'right' });
    my -= 12;
  }
  p.y = Math.min(ly, my) - 10;
  p.hline(p.y, C.line, 0.8);

  // ── Πελάτης ─────────────────────────────────────────────────────────────────────────────────
  p.y -= 14;
  const custLines = [
    [c.afm ? `ΑΦΜ ${c.afm}` : null, c.doy ? `ΔΟΥ ${c.doy}` : null, `Κωδ. πελάτη ${c.code}`].filter(Boolean).join(' · '),
    [c.address, [c.zip, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    [c.phone, c.email].filter(Boolean).join(' · '),
  ].filter(Boolean);
  const nameLines = p.lines(c.name, 11.5, CW - 28, bold).slice(0, 2);
  const boxH = 24 + nameLines.length * 14 + custLines.length * 11 + 6;
  p.rect(M.x, p.y - boxH, CW, boxH, C.soft);
  p.rect(M.x, p.y - boxH, 2.5, boxH, C.accent);
  p.text('ΠΡΟΣ', M.x + 14, p.y - 15, { size: 7, font: bold, color: C.muted });
  let cy = p.y - 30;
  for (const l of nameLines) { p.text(l, M.x + 14, cy, { size: 11.5, font: bold }); cy -= 14; }
  for (const l of custLines) { p.text(p.fit(l, CW - 28, 8.5), M.x + 14, cy + 2, { size: 8.5, color: C.body }); cy -= 11; }
  p.y -= boxH + 16;

  // ── Σύνοψη: 4 κουτιά ────────────────────────────────────────────────────────────────────────
  const due = overdue(s);
  const boxes: { label: string; value: string; strong?: boolean }[] = [
    { label: s.from ? 'Προηγούμενο υπόλοιπο' : 'Από μεταφορά', value: s.from ? balanceEl(s.opening) : '—' },
    { label: 'Χρεώσεις περιόδου', value: eurEl(s.periodDebit) },
    { label: 'Πιστώσεις περιόδου', value: eurEl(s.periodCredit) },
    { label: s.inCredit ? 'Πιστωτικό υπόλοιπο' : 'Υπόλοιπο', value: eurEl(Math.abs(s.closing)), strong: true },
  ];
  const gap = 8;
  const bw = (CW - gap * 3) / 4;
  boxes.forEach((bx, i) => {
    const x = M.x + i * (bw + gap);
    p.rect(x, p.y - 50, bw, 50, bx.strong ? C.ink : C.soft);
    p.text(upper(bx.label), x + 10, p.y - 16, { size: 6.5, font: bold, color: bx.strong ? hex('#D9CBB3') : C.muted });
    p.text(p.fit(bx.value, bw - 20, 13, bold), x + 10, p.y - 37, { size: 13, font: bold, color: bx.strong ? C.white : C.ink });
  });
  p.y -= 62;

  // ── Ενηλικίωση οφειλών ─────────────────────────────────────────────────────────────────────
  if (s.open.length) {
    const aw = (CW - gap * 3) / 4;
    s.aging.forEach((a, i) => {
      const x = M.x + i * (aw + gap);
      const hot = a.key !== 'current' && a.amount > 0;
      p.rect(x, p.y - 30, aw, 30, hot ? C.warnSoft : C.white);
      p.page.drawRectangle({ x, y: p.y - 30, width: aw, height: 30, borderColor: C.line, borderWidth: 0.6 });
      p.text(AGING_LABEL[a.key], x + 8, p.y - 11, { size: 7, color: C.muted });
      p.text(eurEl(a.amount), x + aw - 8, p.y - 24, { size: 9.5, font: bold, color: hot ? C.warn : C.ink, align: 'right' });
    });
    p.y -= 38;
    if (due > 0) {
      p.text(`Ληξιπρόθεσμο (άνω των 30 ημερών): ${eurEl(due)}`, M.x, p.y - 8, { size: 8.5, font: bold, color: C.warn });
      p.y -= 14;
    }
  }

  // ── Κινήσεις περιόδου ──────────────────────────────────────────────────────────────────────
  p.sectionTitle('Κινήσεις περιόδου');
  const mov: Col[] = [
    { label: 'Ημ/νία', w: 56 }, { label: 'Παραστατικό', w: 82 }, { label: 'Περιγραφή', w: CW - 56 - 82 - 70 * 3 },
    { label: 'Χρέωση', w: 70, align: 'right' }, { label: 'Πίστωση', w: 70, align: 'right' }, { label: 'Υπόλοιπο', w: 70, align: 'right' },
  ];
  const movRows = [
    ...(s.from ? [{ cells: [dayEl(s.from), '', 'Προηγούμενο υπόλοιπο', '', '', balanceEl(s.opening)], bold: true, tint: C.accentSoft }] : []),
    ...s.lines.map((l) => ({
      cells: [dayEl(l.day), l.fincode, [l.kindLabel, l.project].filter(Boolean).join(' · '), l.debit ? eurEl(l.debit) : '', l.credit ? eurEl(l.credit) : '', balanceEl(l.balance)],
    })),
  ];
  if (!s.lines.length) movRows.push({ cells: ['', '', 'Καμία κίνηση στην περίοδο', '', '', ''], bold: false, tint: C.white });
  p.table(mov, movRows, ['', '', 'Σύνολα περιόδου', eurEl(s.periodDebit), eurEl(s.periodCredit), balanceEl(s.closing)]);

  // ── Ανοιχτά παραστατικά ────────────────────────────────────────────────────────────────────
  p.sectionTitle('Ανοιχτά παραστατικά');
  if (s.open.length) {
    const oc: Col[] = [
      { label: 'Παραστατικό', w: 92 }, { label: 'Ημ/νία', w: 60 }, { label: 'Έργο', w: CW - 92 - 60 - 50 - 80 * 2 },
      { label: 'Ημέρες', w: 50, align: 'right' }, { label: 'Αξία', w: 80, align: 'right' }, { label: 'Ανοιχτό', w: 80, align: 'right' },
    ];
    p.table(oc, s.open.map((o) => ({
      cells: [o.fincode, dayEl(o.day), o.project ?? '', o.days == null ? '—' : String(o.days), eurEl(o.amount), eurEl(o.open)],
      color: (o.days ?? 0) > 30 ? C.warn : undefined,
    })), ['Σύνολο', '', '', '', '', eurEl(s.open.reduce((t, o) => t + o.open, 0))]);
  } else {
    p.ensure(20);
    p.text(s.inCredit ? `Κανένα ανοιχτό τιμολόγιο — υπάρχει πιστωτικό υπόλοιπο ${eurEl(-s.closing)} υπέρ σας.` : 'Κανένα ανοιχτό παραστατικό — ο λογαριασμός είναι εξοφλημένος.', M.x, p.y - 10, { size: 9, color: C.good, font: bold });
    p.y -= 18;
  }

  // ── Στοιχεία πληρωμής ──────────────────────────────────────────────────────────────────────
  const banks = brand.bankAccounts ?? [];
  if (banks.length && s.closing > 0.005) {
    p.sectionTitle('Στοιχεία πληρωμής');
    const h = 30 + banks.length * 13 + 14;
    p.ensure(h + 6);
    p.page.drawRectangle({ x: M.x, y: p.y - h, width: CW, height: h, borderColor: C.line, borderWidth: 0.8 });
    let by = p.y - 16;
    p.text(`Δικαιούχος: ${brand.legalName || brand.name}`, M.x + 12, by, { size: 8.5, font: bold });
    p.text(`Ποσό: ${eurEl(s.closing)}`, M.x + CW - 12, by, { size: 8.5, font: bold, align: 'right' });
    by -= 15;
    for (const bk of banks) {
      p.text(bk.bank, M.x + 12, by, { size: 8.5, color: C.body });
      p.text(bk.iban, M.x + 150, by, { size: 9, font: bold });
      by -= 13;
    }
    p.text(`Αιτιολογία κατάθεσης: ${paymentReference(c)}`, M.x + 12, by - 1, { size: 8, color: C.muted });
    p.y -= h + 6;
  }

  // ── Σημείωση ───────────────────────────────────────────────────────────────────────────────
  const note = 'Η κατάσταση εκδόθηκε από τα στοιχεία του λογιστηρίου μας κατά την ημερομηνία έκδοσης και έχει ενημερωτικό χαρακτήρα. '
    + 'Τα «ανοιχτά παραστατικά» προκύπτουν από τις πληρωμές σας κατά σειρά παλαιότητας. Αν έχετε ήδη εξοφλήσει, παρακαλούμε αγνοήστε το υπόλοιπο. '
    + 'Για οποιαδήποτε διαφορά επικοινωνήστε μαζί μας εντός 15 ημερών.';
  const nl = p.lines(note, 7.5, CW);
  p.ensure(nl.length * 10 + 16);
  p.y -= 14;
  for (const l of nl) { p.text(l, M.x, p.y - 8, { size: 7.5, color: C.muted }); p.y -= 10; }

  // ── Υποσέλιδο σε κάθε σελίδα ──────────────────────────────────────────────────────────────
  const total = p.pages.length;
  p.pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M.x, y: 34 }, end: { x: M.x + CW, y: 34 }, thickness: 0.6, color: C.line });
    const left = `${brand.legalName || brand.name}${brand.vat ? ` · ΑΦΜ ${brand.vat}` : ''} · ${ref}`;
    pg.drawText(left, { x: M.x, y: 23, size: 7, font: reg, color: C.muted });
    const right = `Σελίδα ${i + 1} από ${total}`;
    pg.drawText(right, { x: M.x + CW - reg.widthOfTextAtSize(right, 7), y: 23, size: 7, font: reg, color: C.muted });
  });

  return doc.save();
}
