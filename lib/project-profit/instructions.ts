/**
 * Κερδοφορία έργων → έγγραφο κατευθύνσεων (lib/instructions-doc). ΚΑΘΑΡΟ: χωρίς βάση/SoftOne.
 *
 * Κάθε θέμα πηγαίνει σε ΜΙΑ ομάδα, σε αυτούς που κάνουν τη διόρθωση:
 *  - Τιμολόγηση & εισπράξεις: πωλήσεις/εμβάσματα πελατών χωρίς έργο·
 *  - Αγορές & παραλαβές: τιμολόγια προμηθευτών χωρίς έργο, μετασχηματισμοί, υλικά χωρίς κόστος·
 *  - Λογιστήριο: κρίσεις (έργο χωρίς κόστος, εισπράξεις > τιμολόγηση) — και εποπτεύει όλα στα «Ερωτήματα λογιστή»·
 *  - Integrator: ρυθμίσεις SoftOne.
 */
import type { InstructionItem, InstructionRecipient } from '@/lib/instructions-doc';
import type { DataIssue } from './issues';

export const PROJECT_RECIPIENTS: InstructionRecipient[] = [
  { key: 'issuers', title: 'Τιμολόγηση & εισπράξεις', intro: 'Για όσους εκδίδουν παραστατικά πώλησης και καταχωρούν εμβάσματα πελατών στο SoftOne. Σε κάθε παραστατικό και έμβασμα που αφορά έργο συμπληρώνεται το πεδίο «Έργο».' },
  { key: 'purchasing', title: 'Αγορές & παραλαβές', intro: 'Για όσους καταχωρούν τιμολόγια προμηθευτών, υπεργολάβων και μεταφορέων και κινήσεις αποθήκης. Κάθε κόστος έργου φέρει το «Έργο» στην κεφαλή (ή στη γραμμή, αν μοιράζεται σε έργα).' },
  { key: 'accountant', title: 'Λογιστήριο', intro: 'Θέματα που θέλουν κρίση του λογιστή. Ο λογιστής εποπτεύει επίσης όλα τα θέματα του εγγράφου και απαντά στην εφαρμογή, στα «Ερωτήματα λογιστή» (ομάδα «Έργα»).' },
  { key: 'integrator', title: 'Integrator SoftOne', intro: 'Ρυθμίσεις της εγκατάστασης SoftOne που αφήνουν τα στοιχεία των έργων ελλιπή.' },
];

export const PROJECT_NOTES = [
  'Λογιστικό μοντέλο: το SoftOne της εγκατάστασης κρατά εμπορική διαχείριση (πωλήσεις, αγορές, εμβάσματα πελατών/προμηθευτών) χωρίς γενική λογιστική — δεν υπάρχει λογιστικό σχέδιο (ACNT). Γι\' αυτό κάθε θέμα δείχνει την καρτέλα του πελάτη ή του προμηθευτή όπου γίνεται η διόρθωση, όχι λογαριασμό γενικής.',
  'Μέχρι να διορθωθεί ένα θέμα, το ποσό του ΔΕΝ μετρά στα οικονομικά του έργου. Τα θέματα φεύγουν μόνα τους στον επόμενο υπολογισμό, μόλις διορθωθούν στο SoftOne.',
];

export function recipientFor(issue: Pick<DataIssue, 'key' | 'audience'>): string {
  if (issue.audience === 'integrator') return 'integrator';
  const kind = issue.key.split(':')[0];
  if (kind === 'sales-no-project' || kind === 'receipts-no-project') return 'issuers';
  if (kind === 'purchases-no-project' || kind === 'from-order' || kind === 'stock-estimate') return 'purchasing';
  return 'accountant';
}

const LIST_MARKER = /\s(?:Παραστατικά|Εμβάσματα|Τιμολόγια): .*$/s;

/** Η οδηγία χωρίζεται σε «τι είναι λάθος» και «τι να γίνει» στο «Ενέργεια…:». Η λίστα παραστατικών
 *  φεύγει από το κείμενο όταν υπάρχει πίνακας παραστατικών. */
export function splitDetail(detail: string, hasDocs: boolean): { problem: string; action: string } {
  const m = /\s?Ενέργεια[^:]*:\s*/.exec(detail);
  const problem = (m ? detail.slice(0, m.index) : detail).trim();
  let action = m ? detail.slice(m.index + m[0].length).trim() : 'Δες την περιγραφή.';
  if (hasDocs) action = action.replace(LIST_MARKER, '').trim();
  // Στο έγγραφο δεν υπάρχει «εδώ»: η απάντηση δίνεται στην εφαρμογή.
  action = action.replace(/απάντησε εδώ/g, 'απάντησε στα «Ερωτήματα λογιστή» της εφαρμογής');
  return { problem, action: action.charAt(0).toUpperCase() + action.slice(1) };
}

export type InstructionsLookup = {
  projects: Map<number, { code: string; name: string }>;
  traders: Map<number, { code: string; name: string }>;
  /** Απάντηση λογιστή ανά κλειδί ερωτήματος (`project:<issue.key>`). */
  answers?: Map<string, { label: string }>;
};

const ANSWER_KEY = (issueKey: string) => `project:${issueKey}`;
export { ANSWER_KEY as projectQuestionKey };

export function issuesToInstructions(issues: DataIssue[], lookup: InstructionsLookup): InstructionItem[] {
  return issues.map((i) => {
    const { problem, action } = splitDetail(i.detail, i.docs.length > 0);
    const [kind, idPart] = i.key.split(':');
    const trdr = Number(idPart);
    const t = ['sales-no-project', 'receipts-no-project', 'purchases-no-project'].includes(kind) ? lookup.traders.get(trdr) : undefined;
    const account = t ? `Καρτέλα ${kind === 'purchases-no-project' ? 'προμηθευτή' : 'πελάτη'} ${t.code} «${t.name}»` : null;
    const ps = i.prjcs.map((p) => lookup.projects.get(p)).filter((p): p is { code: string; name: string } => !!p);
    const context = ps.length === 0 ? null
      : ps.length <= 3 ? ps.map((p) => `Έργο ${p.code} «${p.name}»`).join(', ')
        : `${ps.length} έργα (${ps.slice(0, 3).map((p) => p.code).join(', ')} κ.ά.)`;
    return {
      recipient: recipientFor(i),
      severity: i.severity,
      title: i.title,
      problem,
      action,
      account,
      context,
      status: lookup.answers?.get(ANSWER_KEY(i.key))?.label ?? (i.audience === 'accountant' ? 'Αναπάντητο στα «Ερωτήματα λογιστή»' : null),
      amount: i.amount,
      docs: i.docs.map((d) => ({ code: d.fincode, date: d.date, amount: d.amount })),
      rows: i.rows,
    };
  });
}
