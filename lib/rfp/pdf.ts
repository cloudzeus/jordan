// lib/rfp/pdf.ts — PDF «Αίτημα προσφοράς» (specs) προς συνεργεία. ΧΩΡΙΣ τις τιμές μας και χωρίς το
// όνομα/τη διεύθυνση του πελάτη: αντικείμενο, εργασίες με ποσότητες, κάτοψη & χώροι, προθεσμία,
// τρόπος απάντησης και όροι. Ίδια εμφάνιση με το PDF σύμβασης (lib/contracts/pdf.ts).
import fs from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
import { A4, C, CW, FONT_DIR, M, W, floorPlanSection, table, upper, type PdfFloorPlan } from '@/lib/contracts/pdf';
import { dayEl, qtyEl } from '@/lib/contracts/core';
import { RFP_TERMS } from './core';

export type RfpPdfData = {
  ref: string;
  title: string;
  issuedOn: Date;
  dueDate: string | null;
  area: string | null;
  kindLabel: string;
  scope: string;
  company: { name: string; legalName?: string | null; address?: string | null; phones?: string[]; email?: string | null };
  lines: { kind: string; name: string; qty: number; unit: string | null; notes: string | null }[];
  floorPlan: PdfFloorPlan | null;
};


export async function renderRfpPdf(d: RfpPdfData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [reg, bd] = await Promise.all([
    fs.readFile(path.join(FONT_DIR, 'LiberationSans-Regular.ttf')),
    fs.readFile(path.join(FONT_DIR, 'LiberationSans-Bold.ttf')),
  ]);
  const R = await doc.embedFont(reg, { subset: true });
  const B = await doc.embedFont(bd, { subset: true });
  doc.setTitle(`Αίτημα προσφοράς — ${d.ref}`);
  doc.setSubject(d.title);
  doc.setAuthor(d.company.legalName || d.company.name);
  doc.setLanguage('el-GR');
  doc.setCreator('ATELIER');
  doc.setCreationDate(d.issuedOn);
  const w = new W(doc, R, B);

  // ── Κεφαλίδα ──
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
  w.text('ΑΙΤΗΜΑ ΠΡΟΣΦΟΡΑΣ', M.x, A4.h - 84, 8.5, B, C.gold);
  w.wrap(d.title, 20, B, CW).slice(0, 2).forEach((l, i) => w.text(l, M.x, A4.h - 106 - i * 23, 20, B, C.white));
  w.y = A4.h - headH - 22;

  // ── Γρήγορα στοιχεία ──
  const facts = ([
    ['Περιοχή', d.area ?? '—'],
    ['Είδος', d.kindLabel],
    ['Προθεσμία απάντησης', d.dueDate ? dayEl(d.dueDate) : 'Το συντομότερο'],
    ...(d.floorPlan ? [['Επιφάνειες', `${qtyEl(Math.round((d.floorPlan.floorM2 + d.floorPlan.wallsM2) * 100) / 100)} m²`]] : []),
  ] as [string, string][]);
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

  // ── Αντικείμενο ──
  if (d.scope.trim()) {
    w.section('Αντικείμενο');
    for (const para of d.scope.split(/\n{2,}/)) w.para(para, { size: 10, gap: 6 });
  }

  // ── Εργασίες & ποσότητες (χωρίς τιμές) ──
  if (d.lines.length) {
    w.section('Εργασίες & ποσότητες');
    table(w, [{ label: 'Περιγραφή', w: 58 }, { label: 'Ποσότητα', w: 16, align: 'right' }, { label: 'Αφορά', w: 26 }], d.lines.map((l) => ({
      cells: [l.name, `${qtyEl(Math.round(l.qty * 1000) / 1000)}${l.unit ? ` ${l.unit}` : ''}`, l.kind === 'MATERIAL' ? 'Υλικό — από εμάς' : 'Εργασία συνεργείου'],
      sub: l.notes,
    })), 0);
    w.para('Οι ποσότητες υλικών δίνονται για τον υπολογισμό της εργασίας· η προμήθειά τους γίνεται από την εταιρία μας.', { size: 8.5, color: C.muted, gap: 8 });
  }

  // ── Κάτοψη & χώροι ──
  if (d.floorPlan && d.floorPlan.rows.length) await floorPlanSection(w, d.floorPlan, true);

  // ── Πώς απαντάτε + όροι ──
  w.section('Πώς απαντάτε', { newPage: !d.floorPlan });
  w.bullets([
    'Ανοίξτε τον σύνδεσμο του email (ή το «Αιτήματα προσφοράς» στο περιβάλλον σας).',
    'Δώστε το συνολικό ποσό χωρίς ΦΠΑ, την πιθανή ημερομηνία έναρξης και τη διάρκεια των εργασιών, και ό,τι σχόλιο χρειάζεται.',
    'Αποδεχτείτε τους όρους και πατήστε «Υποβολή προσφοράς». Μπορείτε να διορθώσετε την προσφορά σας όσο το αίτημα είναι ανοιχτό.',
    d.dueDate ? `Προθεσμία: έως ${dayEl(d.dueDate)}.` : 'Παρακαλούμε απαντήστε το συντομότερο.',
  ]);
  w.section('Όροι');
  w.bullets(RFP_TERMS, { marker: 'check' });

  // ── Υποσέλιδο ──
  w.pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M.x, y: 40 }, end: { x: A4.w - M.x, y: 40 }, thickness: 0.5, color: C.line });
    const left = w.wrap(`${d.company.legalName || d.company.name}  ·  ${d.ref}  ·  ${d.title}`, 7.5, R, CW - 90)[0] ?? '';
    pg.drawText(left, { x: M.x, y: 27, size: 7.5, font: R, color: C.muted });
    const right = `Σελίδα ${i + 1} από ${w.pages.length}`;
    pg.drawText(right, { x: A4.w - M.x - R.widthOfTextAtSize(right, 7.5), y: 27, size: 7.5, font: R, color: C.muted });
  });
  return Buffer.from(await doc.save());
}
