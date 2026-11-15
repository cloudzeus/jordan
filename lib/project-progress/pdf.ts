// lib/project-progress/pdf.ts — PDF «Αναφορά πορείας έργου» προς τον πελάτη. Ίδια εμφάνιση με το PDF
// προσφοράς/σύμβασης (lib/contracts/pdf.ts): πρόοδος εργασιών, χρονοδιάγραμμα και οικονομική εικόνα
// ΠΟΥ ΒΛΕΠΕΙ Ο ΠΕΛΑΤΗΣ (τιμολογημένο / εισπραγμένο / υπόλοιπο). ΧΩΡΙΣ κόστη, γενικά έξοδα ή κέρδος.
import fs from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
import { A4, C, CW, FONT_DIR, M, W, table, sums, upper, type Col } from '@/lib/contracts/pdf';
import { eur, dayEl } from '@/lib/contracts/core';

export type ProgressTask = { name: string; phaseLabel: string; start: string; end: string; progress: number };

export type ProgressPdfData = {
  ref: string;            // κωδικός έργου
  projectName: string;
  issuedOn: Date;
  statusLabel: string;
  fromDate: Date | null;
  finalDate: Date | null;
  progress: number;       // συνολική ολοκλήρωση 0–100
  site: string | null;
  company: { name: string; legalName?: string | null; vat?: string | null; address?: string | null; phones?: string[]; email?: string | null };
  customer: { name: string; afm?: string | null; address?: string | null; phone?: string | null; email?: string | null } | null;
  tasks: ProgressTask[];
  /** Οικονομικά που βλέπει ο πελάτης — ποτέ κόστη/κέρδος. null αν δεν υπάρχουν στοιχεία. */
  financials: { invoicedGross: number; collected: number; open: number } | null;
  remarks?: string | null;
};

const fmtD = (d: Date | null) => (d ? dayEl(d) : '—');

export async function renderProgressPdf(d: ProgressPdfData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [reg, bd] = await Promise.all([
    fs.readFile(path.join(FONT_DIR, 'LiberationSans-Regular.ttf')),
    fs.readFile(path.join(FONT_DIR, 'LiberationSans-Bold.ttf')),
  ]);
  const R = await doc.embedFont(reg, { subset: true });
  const B = await doc.embedFont(bd, { subset: true });
  doc.setTitle(`Αναφορά πορείας έργου — ${d.ref}`);
  doc.setSubject(d.projectName);
  doc.setAuthor(d.company.legalName || d.company.name);
  doc.setLanguage('el-GR');
  doc.setCreator('ATELIER');
  doc.setCreationDate(d.issuedOn);
  const w = new W(doc, R, B);

  // ── Κεφαλίδα (ίδια με τα άλλα PDF) ──
  const p = w.page;
  const headH = 132;
  p.drawRectangle({ x: 0, y: A4.h - headH, width: A4.w, height: headH, color: C.night });
  p.drawRectangle({ x: 0, y: A4.h - headH, width: A4.w, height: 3, color: C.gold });
  w.text(upper(d.company.name), M.x, A4.h - 38, 10, B, C.gold);
  const contact = [d.company.address, d.company.phones?.[0], d.company.email].filter(Boolean).join('  ·  ');
  w.text(w.wrap(contact, 7.5, R, CW * 0.62)[0] ?? '', M.x, A4.h - 51, 7.5, R, rgb(0.72, 0.72, 0.74));
  w.text(d.ref, A4.w - M.x - B.widthOfTextAtSize(d.ref, 9), A4.h - 38, 9, B, C.white);
  const issued = `Ημερομηνία ${dayEl(d.issuedOn)}`;
  w.text(issued, A4.w - M.x - R.widthOfTextAtSize(issued, 7.5), A4.h - 51, 7.5, R, rgb(0.72, 0.72, 0.74));
  w.text('ΑΝΑΦΟΡΑ ΠΟΡΕΙΑΣ ΕΡΓΟΥ', M.x, A4.h - 84, 8.5, B, C.gold);
  w.wrap(d.projectName, 20, B, CW).slice(0, 2).forEach((l, i) => w.text(l, M.x, A4.h - 106 - i * 23, 20, B, C.white));
  w.y = A4.h - headH - 22;

  // ── Γρήγορα στοιχεία ──
  const facts: [string, string][] = [
    ['Κατάσταση', d.statusLabel || '—'],
    ['Έναρξη', fmtD(d.fromDate)],
    ['Λήξη', fmtD(d.finalDate)],
    ['Ολοκλήρωση', `${Math.round(d.progress)}%`],
  ];
  const colW = CW / facts.length;
  const factLines = facts.map(([, v]) => w.wrap(v, 9.5, B, colW - 20).slice(0, 2));
  const fh = 34 + Math.max(...factLines.map((l) => l.length)) * 12;
  w.page.drawRectangle({ x: M.x, y: w.y - fh, width: CW, height: fh, color: C.goldSoft });
  facts.forEach(([k], i) => {
    const x = M.x + 12 + i * colW;
    if (i) w.page.drawLine({ start: { x: x - 12, y: w.y - 9 }, end: { x: x - 12, y: w.y - fh + 9 }, thickness: 0.5, color: C.line });
    w.text(upper(k), x, w.y - 16, 7, B, C.muted);
    factLines[i].forEach((l, k2) => w.text(l, x, w.y - 31 - k2 * 12, 9.5, B, C.ink));
  });
  w.y -= fh + 18;

  // ── Πελάτης / εργοτάξιο ──
  if (d.customer || d.site) {
    const lines = [
      d.customer?.name,
      [d.customer?.afm && `ΑΦΜ ${d.customer.afm}`, d.customer?.address].filter(Boolean).join('  ·  ') || null,
      [d.customer?.phone, d.customer?.email].filter(Boolean).join('  ·  ') || null,
      d.site ? `Εργοτάξιο: ${d.site}` : null,
    ].filter((x): x is string => !!x);
    if (lines.length) w.box(lines, C.ink, C.stone, 'Πελάτης');
    w.y -= 6;
  }

  // ── Πρόοδος εργασιών ──
  w.section('Πορεία εργασιών');
  if (d.tasks.length) {
    const cols: Col[] = [
      { label: 'Εργασία', w: 46 },
      { label: 'Φάση', w: 18 },
      { label: 'Περίοδος', w: 22 },
      { label: 'Πρόοδος', w: 14, align: 'right' },
    ];
    table(w, cols, d.tasks.map((t) => ({
      cells: [t.name, t.phaseLabel, `${dayEl(t.start)} – ${dayEl(t.end)}`, `${Math.round(t.progress)}%`],
      sub: null,
    })), 0);
    w.para('Εμφανίζονται οι εργασίες που αφορούν εσάς. Η συνολική ολοκλήρωση σταθμίζεται με τη διάρκεια κάθε εργασίας.', { size: 8.5, color: C.muted, gap: 8 });
  } else {
    w.para('Δεν υπάρχουν ακόμη καταχωρημένες εργασίες ορατές στον πελάτη.', { size: 9.5, color: C.muted, gap: 8 });
  }

  // ── Οικονομική εικόνα (πελάτη) ──
  if (d.financials) {
    w.section('Οικονομική εικόνα');
    sums(w, [
      ['Τιμολογημένο (με ΦΠΑ)', eur(d.financials.invoicedGross)],
      ['Εισπραχθέντα', eur(d.financials.collected)],
      ['Υπόλοιπο', eur(d.financials.open), true],
    ]);
    w.para('Τα ποσά προκύπτουν από τα παραστατικά του έργου στο SoftOne κατά την ημερομηνία έκδοσης της αναφοράς.', { size: 8.5, color: C.muted, gap: 8 });
  }

  // ── Σημειώσεις ──
  if (d.remarks?.trim()) {
    w.section('Σημειώσεις');
    for (const para of d.remarks.split(/\n{2,}/)) w.para(para, { size: 10, gap: 6 });
  }

  // ── Υποσέλιδο (ίδιο με τα άλλα PDF) ──
  w.pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M.x, y: 40 }, end: { x: A4.w - M.x, y: 40 }, thickness: 0.5, color: C.line });
    const left = w.wrap(`${d.company.legalName || d.company.name}  ·  ${d.ref}  ·  ${d.projectName}`, 7.5, R, CW - 90)[0] ?? '';
    pg.drawText(left, { x: M.x, y: 27, size: 7.5, font: R, color: C.muted });
    const right = `Σελίδα ${i + 1} από ${w.pages.length}`;
    pg.drawText(right, { x: A4.w - M.x - R.widthOfTextAtSize(right, 7.5), y: 27, size: 7.5, font: R, color: C.muted });
  });
  return Buffer.from(await doc.save());
}
