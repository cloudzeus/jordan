/**
 * Κατάλογος ΟΛΩΝ των email της εφαρμογής, με δείγμα δεδομένων — για τη σελίδα «Πρότυπα email»
 * (προεπισκόπηση + δοκιμαστική αποστολή) και τα tests. Κάθε εγγραφή καλεί το ΙΔΙΟ πρότυπο που
 * χρησιμοποιεί η πραγματική αποστολή, οπότε ό,τι βλέπεις είναι ό,τι φεύγει.
 */
import type { EmailBrand, RenderedEmail } from '@/lib/email/layout';
import { htmlToText } from '@/lib/email/layout';
import * as T from '@/lib/email/templates';
import { offerEmailHtml, offerEmailSubject, type OfferEmailData } from '@/lib/dynamic-offer-email';
import { statementEmail } from '@/lib/statement/email';
import { sampleStatementDoc } from '@/lib/statement/sample';
import { formatSlotEl } from '@/lib/appointments-core';

export type CatalogGroup = 'statement' | 'account' | 'appointments' | 'offers' | 'orders' | 'newsletter' | 'projects';
export const GROUP_LABEL: Record<CatalogGroup, string> = {
  statement: 'Οικονομικά πελάτη',
  account: 'Λογαριασμός & κωδικοί',
  appointments: 'Ραντεβού',
  offers: 'Δυναμικές προσφορές & πληρωμές',
  orders: 'Παραγγελίες',
  newsletter: 'Newsletter',
  projects: 'Έργα',
};

export type CatalogEntry = {
  id: string;
  group: CatalogGroup;
  title: string;
  audience: 'customer' | 'staff';
  /** Πότε φεύγει (για το προσωπικό). */
  trigger: string;
  /** Συνημμένα που συνοδεύουν το πραγματικό email. */
  attachments?: string[];
  render: (brand: EmailBrand) => RenderedEmail;
};

/** Ταυτότητα για tests / όταν δεν διαβάζονται οι Ρυθμίσεις. */
export const SAMPLE_BRAND: EmailBrand = {
  name: 'Atelier by Damask', legalName: 'ATELIER ΜΙΚΕ', vat: '801771250',
  address: 'Λεωφ. Βουλιαγμένης 39 & Ραζηκότζικα 4, 116 36 Μετς, Αθήνα', phones: ['210 2162310', '6937 038850'],
  email: 'sales@atelier-dm.gr', website: 'https://atelierdamask.gr/',
};

const APP = 'https://app.atelierdamask.gr';
const S = '2026-10-22T07:00:00.000Z';
const E = '2026-10-22T08:00:00.000Z';
const when = formatSlotEl(S, E);
const ADDR = 'Λεωφ. Βουλιαγμένης 39 & Ραζηκότζικα 4, 116 36 Μετς, Αθήνα';

const offer = (kind: 'publish' | 'drop', b: EmailBrand): OfferEmailData => ({
  kind, company: { name: b.name, phone: b.phones?.[0], email: b.email, address: b.address },
  recipientName: 'κ. Παπαδόπουλε', title: 'Κοινό container — Τραβερτίνης Ιταλίας',
  products: [{ name: 'Τραβερτίνης Classico 60×40', code: 'TRV-6040', baseUnit: 'τ.μ.', sqmPerPallet: 32, prices: [42, 39, 36] }],
  minOrder: 1, closesAt: '2026-11-15T00:00:00.000Z', capacity: 20, filled: kind === 'drop' ? 11 : 7,
  levels: [{ level: 1, fromPallets: 0 }, { level: 2, fromPallets: 10 }, { level: 3, fromPallets: 20 }],
  currentLevel: kind === 'drop' ? 2 : 1, previousLevel: kind === 'drop' ? 1 : null, ctaUrl: `${APP}/dashboard/offers/demo`,
});

export const EMAIL_CATALOG: CatalogEntry[] = [
  {
    id: 'statement', group: 'statement', title: 'Κατάσταση λογαριασμού (υπόλοιπο)', audience: 'customer',
    trigger: 'Χειροκίνητα: Πρότυπα email → Κατάσταση λογαριασμού → Αποστολή στον πελάτη.', attachments: ['PDF κατάστασης λογαριασμού'],
    render: (b) => statementEmail(sampleStatementDoc(b)),
  },
  // Λογαριασμός & κωδικοί
  { id: 'otp-register', group: 'account', title: 'Κωδικός επιβεβαίωσης email (εγγραφή)', audience: 'customer', trigger: 'Εγγραφή στο website/portal.', render: (b) => T.otpEmail(b, { kind: 'register', code: '482913', minutes: 15 }) },
  { id: 'otp-login', group: 'account', title: 'Κωδικός σύνδεσης', audience: 'customer', trigger: 'Σύνδεση με κωδικό μίας χρήσης.', render: (b) => T.otpEmail(b, { kind: 'login', code: '205774', minutes: 15 }) },
  { id: 'otp-reset', group: 'account', title: 'Επαναφορά κωδικού πρόσβασης', audience: 'customer', trigger: '«Ξέχασα τον κωδικό».', render: (b) => T.otpEmail(b, { kind: 'reset', code: '930152', minutes: 15 }) },
  {
    id: 'welcome', group: 'account', title: 'Άνοιγμα λογαριασμού (καλωσόρισμα)', audience: 'customer', trigger: 'Καρτέλα πελάτη/συνεργάτη → ⋮ → Πρόσβαση στο portal.',
    render: (b) => T.welcomeEmail(b, { name: 'Μαρία Παπαδοπούλου', email: 'maria@example.com', orgName: 'ΑΡΧΙΤΕΚΤΟΝΙΚΗ ΔΕΙΓΜΑ ΙΚΕ', loginUrl: `${APP}/auth/signin`, lostUrl: `${APP}/auth/lost-password` }),
  },
  {
    id: 'access-request', group: 'account', title: 'Αίτημα πρόσβασης από το website', audience: 'staff', trigger: 'Φόρμα «Αίτημα πρόσβασης» του website.',
    render: (b) => T.accessRequestEmail(b, { kind: 'Πελάτης', name: 'Νίκος Αντωνίου', company: 'ΑΝΤΩΝΙΟΥ ΚΑΤΑΣΚΕΥΕΣ ΑΕ', profession: 'Κατασκευαστική', vat: '099999999', email: 'nikos@example.com', phone: '6900000000', message: 'Θα θέλαμε πρόσβαση για τις προσφορές container.' }),
  },
  // Ραντεβού
  ...(['received', 'confirmed', 'rescheduled', 'cancelled'] as const).map((k): CatalogEntry => ({
    id: `visitor-${k}`, group: 'appointments', audience: 'customer',
    title: { received: 'Ραντεβού — λάβαμε το αίτημα', confirmed: 'Ραντεβού — επιβεβαίωση', rescheduled: 'Ραντεβού — νέα ώρα', cancelled: 'Ραντεβού — ακύρωση' }[k],
    trigger: { received: 'Κράτηση από το website (αναμένει επιβεβαίωση).', confirmed: 'Επιβεβαίωση από το προσωπικό ή αυτόματα.', rescheduled: 'Μεταφορά ραντεβού.', cancelled: 'Ακύρωση ραντεβού.' }[k],
    attachments: k === 'received' ? undefined : ['.ics ημερολογίου'],
    render: (b) => T.visitorAppointmentEmail(b, k, { code: 'ΡΝΤ-000042', when, topic: 'Επιλογή υλικών για έργο', where: ADDR, hours: 'Λειτουργούμε μόνο με ραντεβού', staffNote: k === 'confirmed' ? 'Θα σας περιμένει η Στέλλα με δείγματα τραβερτίνη.' : null, calendarUrl: 'https://calendar.google.com/calendar/render?action=TEMPLATE' }),
  })),
  {
    id: 'invite-created', group: 'appointments', title: 'Ραντεβού από το προσωπικό (προς πελάτη)', audience: 'customer', trigger: 'Ημερολόγιο → νέο ραντεβού με «Email στον πελάτη».', attachments: ['.ics ημερολογίου'],
    render: (b) => T.appointmentInviteEmail(b, 'created', 'invitee', { code: 'ΡΝΤ-000043', when, whenShort: formatSlotEl(S), topic: 'Τεχνική συνάντηση', party: 'DORIC ΙΚΕ (Κώστας)', where: 'Σαρωνίδα, εργοτάξιο', staffNote: 'Θα φέρουμε δείγματα 2 cm.', organizer: 'Στέλλα' }),
  },
  {
    id: 'invite-user', group: 'appointments', title: 'Ραντεβού (αντίγραφο στον χρήστη)', audience: 'staff', trigger: 'Κάθε νέο/αλλαγή/ακύρωση ραντεβού που κλείνει το προσωπικό.', attachments: ['.ics ημερολογίου'],
    render: (b) => T.appointmentInviteEmail(b, 'rescheduled', 'user', { code: 'ΡΝΤ-000043', when, whenShort: formatSlotEl(S), topic: 'Τεχνική συνάντηση', party: 'DORIC ΙΚΕ (Κώστας)', where: 'Σαρωνίδα, εργοτάξιο', message: 'Φέρνει σχέδια κάτοψης.' }),
  },
  {
    id: 'appointment-staff', group: 'appointments', title: 'Νέο ραντεβού από το website', audience: 'staff', trigger: 'Κράτηση από το website.',
    render: (b) => T.staffNewAppointmentEmail(b, { code: 'ΡΝΤ-000042', autoConfirmed: false, when, name: 'Ελένη Γεωργίου', company: 'Studio Γεωργίου', email: 'eleni@example.com', phone: '6900000001', topic: 'Επίσκεψη στο showroom', message: 'Ενδιαφέρομαι για μάρμαρα μπάνιου.', link: `${APP}/admin/appointments` }),
  },
  // Δυναμικές προσφορές
  { id: 'offer-publish', group: 'offers', title: 'Δυναμική προσφορά — δημοσίευση', audience: 'customer', trigger: 'Δυναμικές προσφορές → Δημοσίευση → Αποστολή.', render: (b) => { const d = offer('publish', b); const html = offerEmailHtml(d); return { subject: offerEmailSubject(d), html, text: htmlToText(html) }; } },
  { id: 'offer-drop', group: 'offers', title: 'Δυναμική προσφορά — πτώση τιμής', audience: 'customer', trigger: 'Όταν το γέμισμα περάσει σε φθηνότερο κλιμάκιο.', render: (b) => { const d = offer('drop', b); const html = offerEmailHtml(d); return { subject: offerEmailSubject(d), html, text: htmlToText(html) }; } },
  {
    id: 'reservation-requested', group: 'offers', title: 'Αίτημα κράτησης', audience: 'staff', trigger: 'Ο πελάτης ζητά παλέτες από το portal.',
    render: (b) => T.reservationRequestedEmail(b, { who: 'DORIC ΙΚΕ', qty: '2 παλέτες (64 τ.μ.)', product: 'Τραβερτίνης Classico 60×40', offer: 'Κοινό container — Τραβερτίνης Ιταλίας', notes: 'Παράδοση στη Σαρωνίδα.', link: `${APP}/admin/dynamic-offers` }),
  },
  {
    id: 'reservation-approved', group: 'offers', title: 'Κράτηση — εγκρίθηκε', audience: 'customer', trigger: 'Έγκριση κράτησης.',
    render: (b) => T.reservationDecisionEmail(b, { approved: true, qty: '2 παλέτες (64 τ.μ.)', product: 'Τραβερτίνης Classico 60×40', offer: 'Κοινό container — Τραβερτίνης Ιταλίας', link: `${APP}/dashboard/offers/demo` }),
  },
  {
    id: 'reservation-rejected', group: 'offers', title: 'Κράτηση — δεν εγκρίθηκε', audience: 'customer', trigger: 'Απόρριψη κράτησης.',
    render: (b) => T.reservationDecisionEmail(b, { approved: false, qty: '2 παλέτες (64 τ.μ.)', product: 'Τραβερτίνης Classico 60×40', note: 'Το container έκλεισε· σας κρατάμε προτεραιότητα στο επόμενο.', link: `${APP}/dashboard/offers/demo` }),
  },
  {
    id: 'payment-request', group: 'offers', title: 'Αίτημα πληρωμής (Viva)', audience: 'customer', trigger: 'Κρατήσεις → ⋮ → Αίτημα πληρωμής.',
    render: (b) => T.paymentRequestEmail(b, { contactName: 'Κώστα', product: 'Τραβερτίνης Classico 60×40', offer: 'Κοινό container — Τραβερτίνης Ιταλίας', quantity: '2 παλέτες · 64 τ.μ.', unitPriceLabel: 'Τιμή κλιμακίου W02', unitPrice: '39,00 € / τ.μ.', net: '2.496,00 €', vatLabel: 'ΦΠΑ 24%', vat: '599,04 €', total: '3.095,04 €', link: `${APP}/pay/viva/demo` }),
  },
  // Παραγγελίες
  {
    id: 'order-request', group: 'orders', title: 'Νέο αίτημα παραγγελίας (B2B)', audience: 'staff', trigger: 'Ο πελάτης στέλνει αίτημα από την πύλη.',
    render: (b) => T.orderRequestStaffEmail(b, { code: 'ΑΙΤ-000018', who: 'DORIC ΙΚΕ', from: 'Κώστας (kostas@example.com)', customerRef: 'Σαρωνίδα Β΄ φάση', delivery: '2026-11-04', address: 'Σαρωνίδα, εργοτάξιο', lines: [{ code: 'TRV-6040', name: 'Τραβερτίνης Classico 60×40', qty: '64 τ.μ.' }, { code: 'GRT-SET', name: 'Αρμόστοκος λευκός', note: 'σακί 5 kg', qty: '12 τεμ.' }], notes: 'Χρειαζόμαστε κλαρκ στην εκφόρτωση.', link: `${APP}/admin/order-requests` }),
  },
  // Newsletter
  { id: 'newsletter-confirm', group: 'newsletter', title: 'Newsletter — επιβεβαίωση εγγραφής', audience: 'customer', trigger: 'Εγγραφή στο newsletter (double opt-in).', render: (b) => T.newsletterConfirmEmail(b, { link: `${APP}/newsletter/confirm?token=demo` }) },
  { id: 'newsletter-staff', group: 'newsletter', title: 'Newsletter — νέος συνδρομητής', audience: 'staff', trigger: 'Επιβεβαίωση εγγραφής.', render: (b) => T.newsletterStaffEmail(b, { email: 'eleni@example.com', name: 'Ελένη', source: 'Αρχική σελίδα', link: `${APP}/admin/leads` }) },
  // Έργα
  {
    id: 'task-invite', group: 'projects', title: 'Εργασία έργου (στον υπάλληλο)', audience: 'staff', trigger: 'Νέα/αλλαγή/αφαίρεση εργασίας με εμπλεκόμενο υπάλληλο.', attachments: ['.ics ημερολογίου'],
    render: (b) => T.taskInviteEmail(b, 'created', { name: 'Τοποθέτηση δαπέδου ισογείου', project: 'ΕΡΓ-031 · Κατοικία Βούλα', when, duration: '3 ημέρες', description: 'Έλεγχος υγρασίας πριν την έναρξη.' }),
  },
  {
    id: 'project-message', group: 'projects', title: 'Επικοινωνία έργου (μήνυμα του προσωπικού)', audience: 'customer',
    trigger: 'Έργο ή πελάτης → ⋮ → Επικοινωνία… → Αποστολή με email (και κοινοποίηση).', attachments: ['Ό,τι επισυνάψει ο αποστολέας'],
    render: (b) => T.staffMessageEmail(b, {
      subject: 'Παράδοση υλικών την Τρίτη', context: 'ΕΡΓ-031 · Κατοικία Βούλα', replyCode: 'K7F3Q9XA', attachments: 1, link: `${APP}/dashboard/customer/projects/31`,
      body: 'Καλησπέρα σας, τα υλικά για το μπάνιο φτάνουν την Τρίτη το πρωί.',
      html: '<p>Καλησπέρα σας,</p><p>τα υλικά για το μπάνιο φτάνουν <strong>την Τρίτη στις 09:00</strong>. Χρειαζόμαστε:</p><ul><li><p>ελεύθερη πρόσβαση στο ισόγειο</p></li><li><p>ρεύμα στον χώρο</p></li></ul><p>Επισυνάπτουμε το δελτίο αποστολής.</p>',
      sender: { name: 'Στέλλα Ιωάννου', email: 'stella@atelier-dm.gr' },
    }),
  },
];

export const catalogEntry = (id: string) => EMAIL_CATALOG.find((e) => e.id === id) ?? null;
