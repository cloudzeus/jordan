// lib/contracts/offer-requests-core.ts — καθαρή λογική. Η διαδρομή ενός αιτήματος προσφοράς από την πύλη:
// αίτημα → το είδαμε → προσφορά στάλθηκε → αποδοχή → έργο → ολοκλήρωση (ή ακύρωση σε οποιοδήποτε σημείο).

export const WORKFLOW_STEPS = [
  { key: 'REQUESTED', label: 'Αίτημα' },
  { key: 'OPENED', label: 'Το είδαμε' },
  { key: 'SENT', label: 'Προσφορά στάλθηκε' },
  { key: 'ACCEPTED', label: 'Αποδοχή' },
  { key: 'ACTIVATED', label: 'Έργο σε εξέλιξη' },
  { key: 'COMPLETED', label: 'Ολοκληρώθηκε' },
] as const;
export type WorkflowKey = (typeof WORKFLOW_STEPS)[number]['key'];

export type WorkflowStep = { key: WorkflowKey; label: string; at: string | null; done: boolean; current: boolean };
/** Σε ποια «καρτέλα» ανήκει: νέο (δεν το άνοιξε κανείς), σε εξέλιξη, κλειστό (ολοκληρώθηκε/ακυρώθηκε). */
export type RequestBucket = 'NEW' | 'OPEN' | 'CLOSED';

export type WorkflowEvent = { type: string; createdAt: string };

/** Οι ημερομηνίες κάθε βήματος από τα συμβάντα· η κατάσταση της σύμβασης συμπληρώνει όσα έγιναν πριν υπάρξει καταγραφή. */
export function requestWorkflow(events: WorkflowEvent[], status: string): { steps: WorkflowStep[]; cancelledAt: string | null; bucket: RequestBucket; next: string } {
  const first = (t: string) => events.filter((e) => e.type === t).map((e) => e.createdAt).sort()[0] ?? null;
  const reached: Record<WorkflowKey, boolean> = {
    REQUESTED: true,
    OPENED: !!first('OPENED') || status !== 'DRAFT',
    SENT: !!first('SENT') || ['SENT', 'ACCEPTED', 'ACTIVE', 'COMPLETED'].includes(status),
    ACCEPTED: !!first('ACCEPTED') || ['ACCEPTED', 'ACTIVE', 'COMPLETED'].includes(status),
    ACTIVATED: !!first('ACTIVATED') || ['ACTIVE', 'COMPLETED'].includes(status),
    COMPLETED: status === 'COMPLETED',
  };
  const cancelled = status === 'CANCELLED';
  const lastDone = WORKFLOW_STEPS.reduce((i, s, idx) => (reached[s.key] ? idx : i), 0);
  const steps = WORKFLOW_STEPS.map((s, idx) => ({
    key: s.key, label: s.label, at: first(s.key), done: reached[s.key],
    current: !cancelled && status !== 'COMPLETED' && idx === lastDone + 1,
  }));
  const cancelledAt = cancelled ? first('CANCELLED') : null;
  const bucket: RequestBucket = cancelled || status === 'COMPLETED' ? 'CLOSED' : reached.OPENED ? 'OPEN' : 'NEW';
  const next = cancelled ? 'Ακυρώθηκε'
    : status === 'COMPLETED' ? 'Ολοκληρώθηκε'
    : !reached.OPENED ? 'Ανοίξτε το αίτημα'
    : !reached.SENT ? 'Ετοιμάστε και στείλτε την προσφορά'
    : !reached.ACCEPTED ? 'Περιμένουμε την απάντηση του πελάτη'
    : !reached.ACTIVATED ? 'Ενεργοποιήστε το έργο'
    : 'Το έργο εκτελείται';
  return { steps, cancelledAt, bucket, next };
}
