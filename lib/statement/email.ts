/**
 * Email «Κατάσταση λογαριασμού» προς πελάτη — καθαρή συνάρτηση. Το αναλυτικό (όλες οι κινήσεις)
 * πηγαίνει στο συνημμένο PDF (lib/statement/pdf.ts)· το email δείχνει τα βασικά με μια ματιά.
 */
import {
  callout, dataTable, facts, none, paragraph, renderEmail, stats,
  type EmailBrand, type RenderedEmail,
} from '@/lib/email/layout';
import { balanceEl, dayEl, eurEl, overdue, periodLabel, type Statement } from '@/lib/statement/core';

export type StatementCustomer = {
  trdr: number;
  code: string;
  name: string;
  afm?: string | null;
  doy?: string | null;
  address?: string | null;
  zip?: string | null;
  city?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type StatementDoc = {
  brand: EmailBrand;
  customer: StatementCustomer;
  statement: Statement;
  /** YYYY-MM-DD */
  issuedOn: string;
  /** Προσωπικό μήνυμα του χρήστη που το στέλνει (προαιρετικό). */
  message?: string | null;
};

export const statementRef = (d: Pick<StatementDoc, 'customer' | 'issuedOn'>) => `ΚΛ-${d.customer.code || d.customer.trdr}-${d.issuedOn.replace(/-/g, '')}`;
export const statementFileName = (d: Pick<StatementDoc, 'customer' | 'issuedOn'>) => `katastasi-logariasmou-${(d.customer.code || String(d.customer.trdr)).replace(/[^\w.-]+/g, '_')}-${d.issuedOn}.pdf`;
/** Αιτιολογία κατάθεσης: κωδικός + επωνυμία (κομμένη), ώστε να αναγνωρίζεται η πληρωμή. */
export const paymentReference = (c: StatementCustomer) => `${c.code} ${c.name}`.slice(0, 60).trim();

const MAX_OPEN = 12;
const MAX_LINES = 8;

export function statementEmail(d: StatementDoc): RenderedEmail {
  const { brand, customer: c, statement: s } = d;
  const due = overdue(s);
  const clear = Math.abs(s.closing) < 0.005;
  const banks = brand.bankAccounts ?? [];
  const recent = s.lines.slice(-MAX_LINES).reverse();

  return renderEmail({
    brand,
    subject: `Κατάσταση λογαριασμού ${periodLabel(s)} · ${brand.name}`,
    preheader: clear ? 'Ο λογαριασμός σας είναι εξοφλημένος.' : `Υπόλοιπο ${balanceEl(s.closing)}${due > 0 ? ` · ληξιπρόθεσμο ${eurEl(due)}` : ''}`,
    label: 'Κατάσταση λογαριασμού',
    eyebrow: statementRef(d),
    title: 'Κατάσταση λογαριασμού',
    greeting: `${c.name},`,
    intro: `Σας αποστέλλουμε την κατάσταση του λογαριασμού σας για την περίοδο ${periodLabel(s)}. Στο συνημμένο PDF θα βρείτε την αναλυτική καρτέλα με όλες τις κινήσεις.`,
    blocks: [
      d.message ? callout('accent', d.message) : none,
      stats([
        { label: s.inCredit ? 'Πιστωτικό υπόλοιπο' : 'Υπόλοιπο', value: eurEl(Math.abs(s.closing)), tone: clear || s.inCredit ? 'good' : 'accent', hint: `στις ${dayEl(s.to)}` },
        { label: 'Ληξιπρόθεσμο', value: eurEl(due), tone: due > 0 ? 'warn' : 'neutral', hint: 'άνω των 30 ημερών' },
        { label: 'Τελευταία πληρωμή', value: s.lastPayment ? eurEl(s.lastPayment.amount) : '—', hint: s.lastPayment ? dayEl(s.lastPayment.day) : 'καμία στο διάστημα' },
      ]),
      facts([
        ['Πελάτης', c.name], ['Κωδικός πελάτη', c.code], ['ΑΦΜ', [c.afm, c.doy ? `ΔΟΥ ${c.doy}` : null].filter(Boolean).join(' · ')],
        ['Περίοδος', periodLabel(s)],
      ], { title: 'Στοιχεία' }),
      dataTable([{ label: 'Σύνοψη περιόδου' }, { label: 'Ποσό', align: 'right' }], [
        ...(s.from ? [['Προηγούμενο υπόλοιπο', balanceEl(s.opening)]] : []),
        ['Χρεώσεις (τιμολόγια)', eurEl(s.periodDebit)],
        ['Πιστώσεις (πληρωμές, πιστωτικά)', eurEl(s.periodCredit)],
      ], { foot: ['Υπόλοιπο τέλους', balanceEl(s.closing)] }),
      s.open.length
        ? dataTable(
          [{ label: 'Παραστατικό', nowrap: true }, { label: 'Ημ/νία', nowrap: true }, { label: 'Ημέρες', align: 'right' }, { label: 'Ανοιχτό', align: 'right' }],
          s.open.slice(0, MAX_OPEN).map((o) => [o.fincode, dayEl(o.day), o.days == null ? '—' : String(o.days), eurEl(o.open)]),
          { title: 'Ανοιχτά παραστατικά', foot: [s.open.length > MAX_OPEN ? `+${s.open.length - MAX_OPEN} ακόμη στο PDF` : 'Σύνολο', '', '', eurEl(s.open.reduce((t, o) => t + o.open, 0))] },
        )
        : callout('good', clear ? 'Δεν υπάρχουν ανοιχτά παραστατικά — ευχαριστούμε για τη συνεργασία.' : 'Δεν υπάρχουν ανοιχτά τιμολόγια.', 'Εξοφλημένος λογαριασμός'),
      recent.length
        ? dataTable(
          [{ label: 'Ημ/νία', nowrap: true }, { label: 'Κίνηση' }, { label: 'Ποσό', align: 'right' }],
          recent.map((l) => [dayEl(l.day), `${l.kindLabel} ${l.fincode}`, `${l.side === 'C' ? '−' : ''}${eurEl(l.amount)}`]),
          { title: s.lines.length > MAX_LINES ? `Τελευταίες ${MAX_LINES} κινήσεις` : 'Κινήσεις περιόδου' },
        )
        : paragraph('Δεν υπάρχουν κινήσεις στην περίοδο.'),
      !clear && !s.inCredit && banks.length
        ? dataTable([{ label: 'Τράπεζα' }, { label: 'IBAN', nowrap: true }], banks.map((b) => [b.bank, b.iban]), {
          title: 'Τρόποι πληρωμής',
          foot: [`Δικαιούχος: ${brand.legalName || brand.name}`, `Αιτιολογία: ${paymentReference(c)}`],
        })
        : none,
      !clear && !s.inCredit ? callout('neutral', 'Αν έχετε ήδη εξοφλήσει, παρακαλούμε αγνοήστε το υπόλοιπο — η πληρωμή σας θα φανεί στην επόμενη ενημέρωση. Για οποιαδήποτε διαφορά απαντήστε σε αυτό το email.') : none,
    ],
    signoff: true,
    note: 'Η κατάσταση εκδόθηκε από τα στοιχεία του λογιστηρίου μας κατά την ημερομηνία έκδοσης και έχει ενημερωτικό χαρακτήρα.',
  });
}
