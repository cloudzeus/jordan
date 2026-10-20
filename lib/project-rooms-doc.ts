/**
 * Χώροι & δάπεδα σε WORD (.docx) — δύο έγγραφα από τα ίδια δεδομένα:
 *  • «Προδιαγραφές δαπέδων»: ποιο υλικό σε ποιον χώρο, τεχνικά χαρακτηριστικά του είδους, ποσότητες.
 *  • «Οδηγίες προς εργολάβο»: ανά χώρο τι τοποθετείται και πώς (διάταξη, σοβατεπί, σημειώσεις),
 *    βήματα/έλεγχοι από τον οδηγό τοποθέτησης κάθε είδους και λίστα παραλαβής.
 * Καθαρό: δεν ξέρει τίποτα για βάση — παίρνει δεδομένα, δίνει bytes.
 */
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, LevelFormat, Packer, PageNumber, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import { FINISH_BY_KEY, finishLabel, materialNeeds, orderArea, skirtingLength, type RoomView } from './project-rooms-core';

export type RoomsDocKind = 'spec' | 'contractor';
export type DocGuide = {
  summary: string; tools: string[]; preparation: string[];
  steps: Array<{ title: string; detail: string; warning?: string }>; qualityChecks: string[]; commonMistakes: string[]; aftercare: string[];
};
export type RoomsDocInput = {
  kind: RoomsDocKind;
  companyName: string;
  project: { code: string; name: string; customer?: string | null; site?: string | null };
  rooms: RoomView[];
  /** Χαρακτηριστικά ειδών (ItemAttribute) ανά MTRL. */
  attributes: Record<number, Array<{ name: string; value: string; unit: string | null }>>;
  /** Οδηγός τοποθέτησης ανά MTRL (μόνο για τον εργολάβο). */
  guides: Record<number, DocGuide>;
  date: Date;
};

const FONT = 'Calibri';
const nf = (v: number) => v.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number) => v.toLocaleString('el-GR', { maximumFractionDigits: 1 });
const hex = (c: string) => c.replace('#', '').toUpperCase();

const text = (t: string, o: { bold?: boolean; color?: string; size?: number; italics?: boolean } = {}) => new TextRun({ text: t, font: FONT, ...o });
const para = (c: string | TextRun[], o: { heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]; bullet?: boolean; after?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({
    children: typeof c === 'string' ? [text(c)] : c, heading: o.heading, alignment: o.align,
    numbering: o.bullet ? { reference: 'bullets', level: 0 } : undefined, spacing: { after: o.after ?? 80 },
  });
const labelled = (label: string, value: string) => para([text(`${label}: `, { bold: true, color: '374151' }), text(value)]);
const border = { style: BorderStyle.SINGLE, size: 4, color: 'D6D3D1' };

function table(head: string[], rows: string[][], widths: number[], right: number[] = [], fill?: (r: number) => string | undefined) {
  const cell = (t: string, i: number, o: { head?: boolean; fill?: string } = {}) => new TableCell({
    width: { size: widths[i], type: WidthType.PERCENTAGE },
    shading: o.head ? { type: ShadingType.CLEAR, color: 'auto', fill: '1F2937' } : o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({ alignment: right.includes(i) ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [text(t, { bold: o.head, color: o.head ? 'FFFFFF' : undefined, size: 19 })] })],
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, i, { head: true })) }),
      ...rows.map((r, ri) => new TableRow({ children: r.map((t, i) => cell(t, i, { fill: i === 0 ? fill?.(ri) : undefined })) })),
    ],
  });
}

const itemText = (r: RoomView) => (r.itemName ? `${r.itemCode ? `${r.itemCode} · ` : ''}${r.itemName}` : '— (να οριστεί)');

export function buildRoomsDocument(d: RoomsDocInput): Document {
  const contractor = d.kind === 'contractor';
  const title = contractor ? 'Οδηγίες προς εργολάβο — Δάπεδα' : 'Προδιαγραφές δαπέδων';
  const body: Array<Paragraph | Table> = [];
  const totalArea = d.rooms.reduce((s, r) => s + r.areaM2, 0);
  const needs = materialNeeds(d.rooms);

  body.push(para([text(title, { bold: true, size: 40, color: '111827' })], { after: 60 }));
  body.push(para([text(`${d.project.code} · ${d.project.name}`, { size: 24, color: '6B7280' })], { after: 200 }));
  if (d.project.customer) body.push(labelled('Πελάτης', d.project.customer));
  if (d.project.site) body.push(labelled('Τοποθεσία', d.project.site));
  body.push(labelled('Ημερομηνία', d.date.toLocaleDateString('el-GR')));
  body.push(labelled('Σύνολο', `${d.rooms.length} χώροι · ${nf(totalArea)} m² καθαρό εμβαδό δαπέδων`));
  body.push(para('', { after: 120 }));

  if (contractor) {
    body.push(para('Το έγγραφο περιγράφει τι τοποθετείται σε κάθε χώρο. Πριν από την έναρξη, επιβεβαίωσε επί τόπου τις διαστάσεις και την κατάσταση του υποστρώματος· για κάθε απόκλιση ενημέρωσε πριν προχωρήσεις.', { after: 160 }));
  }

  // ── Πίνακας χώρων ──
  body.push(para('Χώροι & τελικό δάπεδο', { heading: HeadingLevel.HEADING_1 }));
  body.push(table(
    ['Χώρος', 'Εμβαδό', 'Δάπεδο', 'Υλικό', 'Διάταξη / φινίρισμα', 'Σοβατεπί'],
    d.rooms.map((r) => [r.name, `${nf(r.areaM2)} m²`, finishLabel(r.finish), itemText(r), r.pattern ?? '—', skirtingLength(r) ? `${nf(skirtingLength(r))} m` : '—']),
    [16, 11, 12, 27, 22, 12], [1, 5],
    (i) => { const f = d.rooms[i]?.finish; return f ? hex(FINISH_BY_KEY.get(f)?.soft ?? '#FFFFFF') : undefined; },
  ));
  body.push(para('', { after: 120 }));

  // ── Ποσότητες ανά υλικό ──
  if (needs.length) {
    body.push(para(contractor ? 'Υλικά προς τοποθέτηση' : 'Σύνοψη υλικών & ποσοτήτων', { heading: HeadingLevel.HEADING_1 }));
    body.push(table(
      ['Υλικό', 'Χώροι', 'Καθαρά', 'Με φύρα', 'Σοβατεπί'],
      needs.map((n) => [`${n.code ? `${n.code} · ` : ''}${n.name}`, n.rooms.join(', '), `${nf(n.netM2)} m²`, `${nf(n.orderM2)} m²`, n.skirtingM ? `${nf(n.skirtingM)} m` : '—']),
      [34, 30, 12, 12, 12], [2, 3, 4],
    ));
    body.push(para('', { after: 120 }));
  }

  // ── Ανά χώρο ──
  body.push(para(contractor ? 'Εργασίες ανά χώρο' : 'Περιγραφή ανά χώρο', { heading: HeadingLevel.HEADING_1 }));
  d.rooms.forEach((r, i) => {
    body.push(para([text(`${i + 1}. ${r.name}`, { bold: true }), text(`   ${nf(r.areaM2)} m²`, { color: '6B7280' })], { heading: HeadingLevel.HEADING_2 }));
    body.push(labelled('Δάπεδο', `${finishLabel(r.finish)} — ${itemText(r)}`));
    if (r.pattern) body.push(labelled('Διάταξη / φινίρισμα', r.pattern));
    if (r.finish) body.push(labelled(contractor ? 'Ποσότητα που παραδίδεται' : 'Ποσότητα παραγγελίας', `${nf(orderArea(r))} m² (καθαρά ${nf(r.areaM2)} m² + φύρα ${pct(r.wastePct)}%)`));
    if (skirtingLength(r)) body.push(labelled('Σοβατεπί', `${nf(skirtingLength(r))} m από το ίδιο υλικό`));
    if (r.notes) body.push(labelled('Σημειώσεις', r.notes));
    const attrs = !contractor && r.mtrl ? d.attributes[r.mtrl] ?? [] : [];
    if (attrs.length) {
      body.push(para([text('Τεχνικά χαρακτηριστικά υλικού', { bold: true, color: '374151' })], { after: 40 }));
      for (const a of attrs) body.push(para(`${a.name}: ${a.value}${a.unit ? ` ${a.unit}` : ''}`, { bullet: true, after: 20 }));
    }
    body.push(para('', { after: 60 }));
  });

  // ── Οδηγοί τοποθέτησης (εργολάβος) ──
  if (contractor) {
    const withGuide = needs.filter((n) => n.mtrl && d.guides[n.mtrl]);
    if (withGuide.length) {
      body.push(para('Οδηγίες τοποθέτησης ανά υλικό', { heading: HeadingLevel.HEADING_1 }));
      for (const n of withGuide) {
        const g = d.guides[n.mtrl!];
        body.push(para([text(`${n.code ? `${n.code} · ` : ''}${n.name}`, { bold: true })], { heading: HeadingLevel.HEADING_2 }));
        if (g.summary) body.push(para(g.summary));
        if (g.tools.length) { body.push(labelled('Εργαλεία', g.tools.join(', '))); }
        if (g.preparation.length) {
          body.push(para([text('Προετοιμασία', { bold: true })], { after: 40 }));
          for (const p of g.preparation) body.push(para(p, { bullet: true, after: 20 }));
        }
        g.steps.forEach((s, k) => {
          body.push(para([text(`Βήμα ${k + 1}. ${s.title}`, { bold: true })], { after: 20 }));
          if (s.detail) body.push(para(s.detail, { after: 40 }));
          if (s.warning) body.push(para([text('Προσοχή: ', { bold: true, color: 'B45309' }), text(s.warning, { color: 'B45309' })]));
        });
        if (g.commonMistakes.length) {
          body.push(para([text('Συνήθη λάθη', { bold: true })], { after: 40 }));
          for (const m of g.commonMistakes) body.push(para(m, { bullet: true, after: 20 }));
        }
        if (g.aftercare.length) {
          body.push(para([text('Μετά την τοποθέτηση', { bold: true })], { after: 40 }));
          for (const m of g.aftercare) body.push(para(m, { bullet: true, after: 20 }));
        }
      }
    }
    // Λίστα παραλαβής: οι έλεγχοι ποιότητας των οδηγών + γενικοί.
    const checks = [...new Set([
      'Υπόστρωμα επίπεδο, στεγνό και καθαρό πριν από την έναρξη.',
      'Οι διαστάσεις κάθε χώρου επιβεβαιώθηκαν επί τόπου.',
      ...withGuide.flatMap((n) => d.guides[n.mtrl!].qualityChecks),
      'Ο χώρος παραδόθηκε καθαρός, χωρίς υπολείμματα υλικών.',
    ])];
    body.push(para('Λίστα ελέγχου παραλαβής', { heading: HeadingLevel.HEADING_1 }));
    for (const c of checks) body.push(para([text('☐  ', { size: 24 }), text(c)], { after: 60 }));
  }

  return new Document({
    creator: d.companyName,
    title,
    styles: {
      default: { document: { run: { font: FONT, size: 21 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 28, bold: true, color: '111827' }, paragraph: { spacing: { before: 320, after: 140 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 23, bold: true, color: '1F2937' }, paragraph: { spacing: { before: 220, after: 80 } } },
      ],
    },
    numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }] }] },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      headers: { default: new Header({ children: [para([text(`${d.companyName} — ${title} · ${d.project.code}`, { size: 16, color: '9CA3AF' })], { align: AlignmentType.RIGHT })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ font: FONT, size: 16, color: '9CA3AF', children: ['Σελίδα ', PageNumber.CURRENT, ' από ', PageNumber.TOTAL_PAGES] })] })] }) },
      children: body,
    }],
  });
}

export async function buildRoomsDocx(d: RoomsDocInput): Promise<Buffer> {
  return Packer.toBuffer(buildRoomsDocument(d));
}
