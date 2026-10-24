// lib/contracts/history-core.ts — ΚΑΘΑΡΟ. Ιστορικό επικοινωνίας προσφοράς/έργου: ενώνει μηνύματα (σημειώσεις,
// ερωτήσεις, αιτήματα αλλαγής, απαντήσεις) και συμβάντα (αποστολή έκδοσης, αποδοχή, αναπροσαρμογή…) σε μία
// χρονολογική λίστα. Ο πελάτης βλέπει μόνο ό,τι μοιραζόμαστε μαζί του.

export const NOTE_KIND_LABEL: Record<string, string> = {
  NOTE: 'Σημείωση', INSTRUCTION: 'Ειδική οδηγία', QUESTION: 'Ερώτηση', CHANGE: 'Αίτημα αλλαγής',
};
export const EVENT_LABEL: Record<string, string> = {
  REQUESTED: 'Αίτημα προσφοράς', SENT: 'Αποστολή προσφοράς', ACCEPTED: 'Αποδοχή', REVISED: 'Νέα έκδοση', AI_REVISED: 'Αναπροσαρμογή (AI)', RESTORED: 'Επαναφορά έκδοσης',
  ACTIVATED: 'Ενεργοποίηση', COMPLETED: 'Ολοκλήρωση', CANCELLED: 'Ακύρωση', RESOLVED: 'Κλείσιμο αιτήματος', REOPENED: 'Επανάνοιγμα αιτήματος',
};

export type HistoryNote = {
  id: string; contractId: string; kind: string; body: string; targetLabel: string | null; replyToId: string | null; revision: number | null;
  authorKind: 'STAFF' | 'CUSTOMER'; authorName: string | null; shareWith: string[]; resolved: boolean; photoCount: number; createdAt: string;
};
export type HistoryEvent = {
  id: string; contractId: string; type: string; actorKind: string; actorName: string | null; summary: string; customer: boolean; revision: number | null; createdAt: string;
};
export type HistoryEntry = {
  id: string; contractId: string; contractRef: string | null; at: string; source: 'NOTE' | 'EVENT';
  /** Τίτλος γραμμής: «Ερώτηση», «Απάντηση», «Αποστολή προσφοράς»… */
  title: string; body: string; who: string; fromCustomer: boolean; target: string | null; revision: number | null;
  /** Για μηνύματα: ανοιχτό αίτημα/ερώτηση που περιμένει απάντηση. */
  open: boolean;
};

export type HistoryViewer = 'STAFF' | 'CUSTOMER';
const customerSees = (n: HistoryNote) => n.authorKind === 'CUSTOMER' || n.shareWith.includes('CUSTOMER');

/** Είναι «αίτημα» του πελάτη (ερώτηση / αλλαγή) που δεν έχει κλείσει; Απάντηση από εμάς δεν το κλείνει από μόνη της. */
export const isOpenRequest = (n: Pick<HistoryNote, 'kind' | 'authorKind' | 'resolved' | 'replyToId'>) =>
  n.authorKind === 'CUSTOMER' && !n.replyToId && (n.kind === 'QUESTION' || n.kind === 'CHANGE') && !n.resolved;

export function buildHistory(
  notes: HistoryNote[], events: HistoryEvent[], viewer: HistoryViewer,
  opts: { refs?: Record<string, string>; companyName?: string } = {},
): HistoryEntry[] {
  const ref = (id: string) => opts.refs?.[id] ?? null;
  const out: HistoryEntry[] = [];
  for (const n of notes) {
    if (viewer === 'CUSTOMER' && !customerSees(n)) continue;
    const reply = !!n.replyToId;
    const who = n.authorKind === 'CUSTOMER'
      ? (viewer === 'CUSTOMER' ? 'Εσείς' : `Πελάτης${n.authorName ? ` · ${n.authorName}` : ''}`)
      : (viewer === 'CUSTOMER' ? (opts.companyName ?? 'Εμείς') : n.authorName ?? 'Εμείς');
    out.push({
      id: n.id, contractId: n.contractId, contractRef: ref(n.contractId), at: n.createdAt, source: 'NOTE',
      title: reply ? 'Απάντηση' : NOTE_KIND_LABEL[n.kind] ?? 'Σημείωση',
      body: n.photoCount ? `${n.body}\n(${n.photoCount} φωτογραφ${n.photoCount === 1 ? 'ία' : 'ίες'})` : n.body,
      who, fromCustomer: n.authorKind === 'CUSTOMER', target: n.targetLabel, revision: n.revision, open: isOpenRequest(n),
    });
  }
  for (const e of events) {
    if (viewer === 'CUSTOMER' && !e.customer) continue;
    out.push({
      id: e.id, contractId: e.contractId, contractRef: ref(e.contractId), at: e.createdAt, source: 'EVENT',
      title: EVENT_LABEL[e.type] ?? e.type, body: e.summary,
      who: e.actorKind === 'CUSTOMER' ? (viewer === 'CUSTOMER' ? 'Εσείς' : `Πελάτης${e.actorName ? ` · ${e.actorName}` : ''}`) : e.actorKind === 'SYSTEM' ? 'Σύστημα' : (viewer === 'CUSTOMER' ? (opts.companyName ?? 'Εμείς') : e.actorName ?? 'Εμείς'),
      fromCustomer: e.actorKind === 'CUSTOMER', target: null, revision: e.revision, open: false,
    });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1));
}

/** CSV του ιστορικού (για αρχείο / αποστολή). */
export function historyCsv(rows: HistoryEntry[]): string {
  const cell = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['Ημερομηνία', 'Προσφορά', 'Έκδοση', 'Τύπος', 'Από', 'Αφορά', 'Κείμενο'];
  return '﻿' + [head, ...rows.map((r) => [r.at, r.contractRef, r.revision, r.title, r.who, r.target, r.body])].map((r) => r.map(cell).join(';')).join('\r\n');
}
