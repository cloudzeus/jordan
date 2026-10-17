/**
 * ΚΑΤΕΥΘΥΝΣΕΙΣ ΣΕ WORD (.docx) — γενικός, επαναχρησιμοποιήσιμος δημιουργός εγγράφου οδηγιών.
 *
 * Δεν ξέρει τίποτα για έργα ή κόστος: παίρνει ομάδες παραληπτών (λογιστήριο, integrator, όσοι
 * εκδίδουν τιμολόγια…) και θέματα (τι είναι λάθος, τι να γίνει, ποια καρτέλα/λογαριασμός, ποια
 * παραστατικά) και βγάζει καθαρό, δομημένο έγγραφο στα Ελληνικά. Τα θέματα τα φτιάχνει κάθε ενότητα
 * με δικό της προσαρμογέα (π.χ. `lib/project-profit/instructions.ts`, αργότερα το «Πραγματικό κόστος»).
 */
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, LevelFormat, Packer, PageNumber, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';

export type InstructionSeverity = 'high' | 'mid' | 'low';

export type InstructionRecipient = {
  key: string;
  /** «Λογιστήριο», «Integrator SoftOne», «Τιμολόγηση & εισπράξεις»… */
  title: string;
  /** Μία-δύο προτάσεις: ποιος είναι και τι του ζητάμε. */
  intro?: string;
};

export type InstructionDoc = {
  code: string;
  date: string | null;
  amount?: number | null;
  /** π.χ. ΜΑΡΚ, σειρά, συναλλασσόμενος. */
  note?: string | null;
};

export type InstructionItem = {
  recipient: string;
  severity: InstructionSeverity;
  title: string;
  /** Τι είναι λάθος / τι λείπει. */
  problem: string;
  /** Τι πρέπει να γίνει. */
  action: string;
  /** Καρτέλα ή λογαριασμός όπου αφορά (κατά το λογιστικό μοντέλο της εγκατάστασης). */
  account?: string | null;
  /** Πλαίσιο, π.χ. «Έργο 0000010 «ΔΟΜΗ…»». */
  context?: string | null;
  /** Κατάσταση απάντησης (π.χ. «Ελήφθη από λογιστή 17/10/2026»). */
  status?: string | null;
  amount?: number | null;
  docs?: InstructionDoc[];
  /** Ευρήματα χωρίς παραστατικά (π.χ. ανά σειρά). */
  rows?: string[];
};

export type InstructionsInput = {
  title: string;
  subtitle?: string;
  companyName: string;
  generatedAt: Date;
  recipients: InstructionRecipient[];
  items: InstructionItem[];
  /** Γενικές σημειώσεις στην αρχή (π.χ. λογιστικό μοντέλο). */
  notes?: string[];
};

const FONT = 'Calibri';
const SEVERITY_LABEL: Record<InstructionSeverity, string> = { high: 'Υψηλή', mid: 'Μεσαία', low: 'Χαμηλή' };
const SEVERITY_ORDER: Record<InstructionSeverity, number> = { high: 0, mid: 1, low: 2 };
const SEVERITY_COLOR: Record<InstructionSeverity, string> = { high: 'B91C1C', mid: 'B45309', low: '4B5563' };
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideHorizontal: BORDER, insideVertical: BORDER };

export const fmtEur = (n: number) => `${n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
export const fmtDateEl = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('el-GR', { timeZone: 'UTC' }) : '—');

const text = (t: string, o: { bold?: boolean; color?: string; size?: number; italics?: boolean } = {}) =>
  new TextRun({ text: t, font: FONT, bold: o.bold, color: o.color, size: o.size, italics: o.italics });

const para = (runs: TextRun[] | string, o: { spacingAfter?: number; heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]; bullet?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({
    children: typeof runs === 'string' ? [text(runs)] : runs,
    heading: o.heading,
    alignment: o.align,
    spacing: { after: o.spacingAfter ?? 120 },
    ...(o.bullet ? { numbering: { reference: 'bullets', level: 0 } } : {}),
  });

const labelled = (label: string, value: string) => para([text(`${label}: `, { bold: true }), text(value)]);

function cell(content: string, o: { bold?: boolean; shade?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; width?: number } = {}) {
  return new TableCell({
    children: [new Paragraph({ alignment: o.align, children: [text(content, { bold: o.bold, size: 18 })] })],
    shading: o.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F4F6' } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
  });
}

function table(head: string[], rows: string[][], numeric: number[] = [], widths?: number[]) {
  const align = (i: number) => (numeric.includes(i) ? AlignmentType.RIGHT : AlignmentType.LEFT);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: BORDERS,
    rows: [
      new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, { bold: true, shade: true, align: align(i), width: widths?.[i] })) }),
      ...rows.map((r) => new TableRow({ children: r.map((v, i) => cell(v, { align: align(i), width: widths?.[i] })) })),
    ],
  });
}

/** Σειρά: πρώτα οι παραλήπτες με τη σειρά που δόθηκαν, μέσα σε καθέναν πρώτα τα σοβαρά. */
export function groupInstructions(input: Pick<InstructionsInput, 'recipients' | 'items'>) {
  return input.recipients
    .map((r) => ({
      recipient: r,
      items: input.items.filter((i) => i.recipient === r.key)
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (b.amount ?? 0) - (a.amount ?? 0) || a.title.localeCompare(b.title, 'el')),
    }))
    .filter((g) => g.items.length > 0);
}

export function buildInstructionsDocument(input: InstructionsInput): Document {
  const groups = groupInstructions(input);
  const body: (Paragraph | Table)[] = [];

  body.push(para([text(input.title, { bold: true, size: 36 })], { spacingAfter: 80 }));
  if (input.subtitle) body.push(para([text(input.subtitle, { size: 22, color: '4B5563' })]));
  body.push(para([text(`${input.companyName} · ${input.generatedAt.toLocaleString('el-GR', { dateStyle: 'long', timeStyle: 'short' })}`, { size: 20, color: '6B7280' })], { spacingAfter: 240 }));

  // Σύνοψη ανά παραλήπτη.
  body.push(para('Σύνοψη', { heading: HeadingLevel.HEADING_1 }));
  if (!groups.length) {
    body.push(para('Δεν υπάρχουν ανοιχτά θέματα.'));
  } else {
    body.push(table(
      ['Παραλήπτης', 'Θέματα', 'Υψηλής σοβαρότητας', 'Ποσό που επηρεάζεται'],
      groups.map((g) => [
        g.recipient.title,
        String(g.items.length),
        String(g.items.filter((i) => i.severity === 'high').length),
        fmtEur(g.items.reduce((s, i) => s + Math.abs(i.amount ?? 0), 0)),
      ]),
      [1, 2, 3], [46, 14, 18, 22],
    ));
  }
  for (const n of input.notes ?? []) body.push(para([text(n, { italics: true, color: '4B5563', size: 20 })], { spacingAfter: 80 }));

  for (const g of groups) {
    body.push(para(g.recipient.title, { heading: HeadingLevel.HEADING_1 }));
    if (g.recipient.intro) body.push(para(g.recipient.intro));
    g.items.forEach((it, idx) => {
      body.push(para([
        text(`${idx + 1}. ${it.title}`, { bold: true }),
        text(`   [${SEVERITY_LABEL[it.severity]}]`, { color: SEVERITY_COLOR[it.severity], size: 18, bold: true }),
      ], { heading: HeadingLevel.HEADING_2 }));
      if (it.context) body.push(labelled('Αφορά', it.context));
      body.push(labelled('Τι είναι λάθος', it.problem));
      body.push(labelled('Τι να γίνει', it.action));
      if (it.account) body.push(labelled('Καρτέλα / λογαριασμός', it.account));
      if (it.amount != null) body.push(labelled('Ποσό', fmtEur(it.amount)));
      if (it.status) body.push(labelled('Κατάσταση', it.status));
      for (const r of it.rows ?? []) body.push(para(r, { bullet: true, spacingAfter: 40 }));
      if (it.docs?.length) {
        const notes = it.docs.some((d) => d.note);
        body.push(table(
          ['Παραστατικό', 'Ημερομηνία', 'Ποσό', ...(notes ? ['Σημείωση'] : [])],
          it.docs.map((d) => [d.code, fmtDateEl(d.date), d.amount == null ? '—' : fmtEur(d.amount), ...(notes ? [d.note ?? ''] : [])]),
          [2], notes ? [28, 18, 20, 34] : [40, 30, 30],
        ));
        body.push(para('', { spacingAfter: 120 }));
      }
    });
  }

  return new Document({
    creator: input.companyName,
    title: input.title,
    styles: {
      default: { document: { run: { font: FONT, size: 21 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 30, bold: true, color: '111827' }, paragraph: { spacing: { before: 360, after: 160 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, bold: true, color: '1F2937' }, paragraph: { spacing: { before: 240, after: 100 } } },
      ],
    },
    numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }] }] },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      headers: { default: new Header({ children: [para([text(`${input.companyName} — ${input.title}`, { size: 16, color: '9CA3AF' })], { align: AlignmentType.RIGHT })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ font: FONT, size: 16, color: '9CA3AF', children: ['Σελίδα ', PageNumber.CURRENT, ' από ', PageNumber.TOTAL_PAGES] })] })] }) },
      children: body,
    }],
  });
}

export async function buildInstructionsDocx(input: InstructionsInput): Promise<Buffer> {
  return Packer.toBuffer(buildInstructionsDocument(input));
}

/** Όνομα αρχείου ασφαλές για Content-Disposition (UTF-8 + ASCII εφεδρεία). */
export function docxDisposition(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]+/g, '_');
  return `attachment; filename="instructions.docx"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
