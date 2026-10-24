/**
 * Όλα τα transactional email της εφαρμογής ως ΚΑΘΑΡΕΣ συναρτήσεις: (εταιρεία, δεδομένα) → θέμα, HTML,
 * απλό κείμενο. Οι αποστολείς (lib/otp.ts, lib/appointments.ts, …) φέρνουν τα δεδομένα και καλούν
 * αυτές· η σελίδα «Πρότυπα email» τις καλεί με δείγματα (lib/email/catalog.ts).
 * Η δυναμική προσφορά container ζει στο lib/dynamic-offer-email.ts (ίδια ταυτότητα) και η
 * κατάσταση λογαριασμού στο lib/statement/email.ts.
 */
import {
  bullets, button, none, callout, codeBox, dataTable, facts, paragraph, renderEmail, rich, rawHtml, esc, EMAIL_COLORS, SANS,
  type EmailBrand, type RenderedEmail,
} from '@/lib/email/layout';

const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
const firstPhone = (b: EmailBrand) => b.phones?.[0] ?? null;

// ── Λογαριασμός & κωδικοί ─────────────────────────────────────────────────────────────────────

export type OtpKind = 'register' | 'reset' | 'login';
const OTP: Record<OtpKind, { title: string; intro: string; label: string }> = {
  register: { title: 'Επιβεβαίωση email', intro: 'Για να ολοκληρωθεί η εγγραφή σας, πληκτρολογήστε τον παρακάτω κωδικό στη σελίδα που έχετε ανοιχτή.', label: 'Εγγραφή' },
  reset: { title: 'Νέος κωδικός πρόσβασης', intro: 'Ζητήθηκε αλλαγή του κωδικού πρόσβασης. Χρησιμοποιήστε τον παρακάτω κωδικό για να ορίσετε νέο.', label: 'Ασφάλεια' },
  login: { title: 'Κωδικός σύνδεσης', intro: 'Χρησιμοποιήστε τον παρακάτω κωδικό για να συνδεθείτε.', label: 'Σύνδεση' },
};

export function otpEmail(brand: EmailBrand, d: { kind: OtpKind; code: string; minutes: number }): RenderedEmail {
  const c = OTP[d.kind];
  return renderEmail({
    brand, subject: `${c.title} · ${brand.name}`, preheader: `Ο κωδικός σας: ${d.code} — ισχύει ${d.minutes} λεπτά`,
    label: c.label, title: c.title, intro: c.intro,
    blocks: [
      codeBox(d.code, `Ισχύει για ${d.minutes} λεπτά · μία χρήση`),
      callout('neutral', 'Δεν θα σας ζητήσουμε ποτέ αυτόν τον κωδικό τηλεφωνικά ή με email. Μην τον μοιράζεστε.', 'Για την ασφάλειά σας'),
    ],
    note: 'Αν δεν το ζητήσατε εσείς, αγνοήστε αυτό το μήνυμα — ο λογαριασμός σας παραμένει ασφαλής.',
  });
}

export function welcomeEmail(brand: EmailBrand, d: { name: string; email: string; orgName: string; loginUrl: string; lostUrl: string }): RenderedEmail {
  return renderEmail({
    brand, subject: `Η πρόσβασή σας στο ${brand.name}`, preheader: 'Ο λογαριασμός σας στην πλατφόρμα B2B είναι έτοιμος.',
    label: 'Νέος λογαριασμός', eyebrow: 'Καλώς ήρθατε', title: d.name ? `Καλώς ήρθατε, ${d.name}` : 'Καλώς ήρθατε',
    intro: `Σας δημιουργήσαμε πρόσβαση στην πλατφόρμα μας${d.orgName ? ` για λογαριασμό της ${d.orgName}` : ''}.`,
    blocks: [
      facts([['Όνομα χρήστη', d.email], ['Κωδικός', 'Σας τον δίνει ο συνεργάτης μας — ή ορίστε δικό σας από το «Ξέχασα τον κωδικό».']], { title: 'Στοιχεία σύνδεσης' }),
      bullets(['Παραστατικά, παραγγελίες και έργα σας σε ένα σημείο', 'Κοινά container με τιμή που πέφτει όσο γεμίζουν', 'Αιτήματα παραγγελίας και ραντεβού στο atelier'], 'Τι βρίσκετε στην πλατφόρμα'),
      button(d.loginUrl, 'Σύνδεση στην πλατφόρμα'),
      rich(`Ξεχάσατε τον κωδικό; <a href="${esc(d.lostUrl)}" style="color:#8A5A12;">Ορίστε νέο</a>.`),
    ],
    signoff: true,
    note: 'Αν δεν περιμένατε αυτό το μήνυμα, απλώς αγνοήστε το.',
  });
}

export function accessRequestEmail(brand: EmailBrand, d: { kind: string; name: string; company: string; profession?: string; vat: string; email: string; phone?: string; message?: string }): RenderedEmail {
  return renderEmail({
    brand, internal: true, subject: `Αίτημα πρόσβασης — ${d.company}`, label: 'Website', eyebrow: 'Νέο αίτημα πρόσβασης',
    title: d.company, intro: `Από τη φόρμα του website (${d.kind.toLowerCase()}). Αποδέχτηκε τους όρους χρήσης της B2B πύλης.`,
    blocks: [
      facts([['Ως', d.kind], ['Ονοματεπώνυμο', d.name], ['Εταιρεία', d.company], ['Δραστηριότητα', d.profession], ['ΑΦΜ', d.vat], ['Email', d.email], ['Τηλέφωνο', d.phone]]),
      d.message ? callout('neutral', d.message, 'Μήνυμα') : none,
      paragraph('Για να δώσετε πρόσβαση: καρτέλα πελάτη ή συνεργάτη → ⋮ → «Πρόσβαση στο portal».'),
    ],
    note: 'Απαντήστε σε αυτό το email για να επικοινωνήσετε απευθείας με τον αιτούντα.',
  });
}

// ── Ραντεβού ─────────────────────────────────────────────────────────────────────────────────

export type VisitorMailKind = 'received' | 'confirmed' | 'cancelled' | 'rescheduled';
const VISITOR: Record<VisitorMailKind, { subject: string; title: string; intro: string; band?: { tone: 'good' | 'warn' | 'danger' | 'accent'; text: string } }> = {
  received: { subject: 'Λάβαμε το αίτημα ραντεβού', title: 'Λάβαμε το αίτημά σας', intro: 'Ευχαριστούμε. Θα επιβεβαιώσουμε το ραντεβού σας σύντομα — συνήθως την ίδια εργάσιμη.', band: { tone: 'accent', text: 'Σε αναμονή επιβεβαίωσης' } },
  confirmed: { subject: 'Το ραντεβού σας επιβεβαιώθηκε', title: 'Σας περιμένουμε στο atelier', intro: 'Το ραντεβού σας επιβεβαιώθηκε.', band: { tone: 'good', text: 'Επιβεβαιώθηκε' } },
  cancelled: { subject: 'Το ραντεβού σας ακυρώθηκε', title: 'Το ραντεβού ακυρώθηκε', intro: 'Δυστυχώς το ραντεβού σας ακυρώθηκε. Μπορείτε να κλείσετε νέα ώρα από το website ή να μας τηλεφωνήσετε.', band: { tone: 'danger', text: 'Ακυρώθηκε' } },
  rescheduled: { subject: 'Νέα ώρα για το ραντεβού σας', title: 'Το ραντεβού σας μεταφέρθηκε', intro: 'Η ώρα του ραντεβού σας άλλαξε. Δείτε παρακάτω τη νέα ώρα.', band: { tone: 'warn', text: 'Νέα ώρα' } },
};

export function visitorAppointmentEmail(brand: EmailBrand, kind: VisitorMailKind, d: { code: string; when: string; topic?: string | null; where: string; hours?: string | null; staffNote?: string | null; calendarUrl?: string | null }): RenderedEmail {
  const c = VISITOR[kind];
  return renderEmail({
    brand, subject: `${c.subject} · ${d.code}`, preheader: `${d.when} · ${d.where}`, label: 'Ραντεβού', band: c.band,
    title: c.title, intro: c.intro,
    blocks: [
      facts([['Ραντεβού', d.code], ['Πότε', d.when], ['Θέμα', d.topic], ['Πού', d.where]]),
      d.staffNote ? callout('accent', d.staffNote, 'Σημείωση από την ομάδα μας') : none,
      kind !== 'cancelled' && d.calendarUrl ? button(d.calendarUrl, 'Προσθήκη στο ημερολόγιο', { tone: 'accent' }) : none,
      paragraph(`Για αλλαγή ή ακύρωση απαντήστε σε αυτό το email${firstPhone(brand) ? ` ή καλέστε στο ${firstPhone(brand)}` : ''}.${d.hours ? ` ${d.hours}.` : ''}`),
    ],
    signoff: true,
  });
}

export type InviteMailKind = 'created' | 'rescheduled' | 'cancelled';
const INVITE: Record<InviteMailKind, { subject: string; title: string; intro: string; band?: { tone: 'warn' | 'danger'; text: string } }> = {
  created: { subject: 'Ραντεβού', title: 'Νέο ραντεβού', intro: 'Κλείσαμε το παρακάτω ραντεβού. Το συνημμένο αρχείο (.ics) το προσθέτει στο ημερολόγιό σας.' },
  rescheduled: { subject: 'Νέα ώρα για το ραντεβού', title: 'Το ραντεβού μεταφέρθηκε', intro: 'Η ώρα του ραντεβού άλλαξε. Το συνημμένο αρχείο ενημερώνει το ημερολόγιό σας.', band: { tone: 'warn', text: 'Νέα ώρα' } },
  cancelled: { subject: 'Ακύρωση ραντεβού', title: 'Το ραντεβού ακυρώθηκε', intro: 'Το παρακάτω ραντεβού ακυρώθηκε. Το συνημμένο αρχείο το αφαιρεί από το ημερολόγιό σας.', band: { tone: 'danger', text: 'Ακυρώθηκε' } },
};

/** Ραντεβού που έκλεισε το προσωπικό: προς τον προσκεκλημένο ή προς τον χρήστη της εφαρμογής. */
export function appointmentInviteEmail(brand: EmailBrand, kind: InviteMailKind, audience: 'invitee' | 'user', d: {
  code: string; when: string; whenShort: string; topic?: string | null; party: string; where: string; staffNote?: string | null; message?: string | null; organizer?: string | null;
}): RenderedEmail {
  const c = INVITE[kind];
  const user = audience === 'user';
  return renderEmail({
    brand, internal: user, subject: `${c.subject} ${d.code} · ${d.whenShort}`, preheader: `${d.when} · ${user ? d.party : d.where}`,
    label: 'Ραντεβού', band: c.band, title: c.title, intro: c.intro,
    blocks: [
      facts([['Ραντεβού', d.code], ['Πότε', d.when], ['Θέμα', d.topic], ...(user ? [['Με', d.party] as [string, string]] : []), ['Πού', d.where], ...(!user ? [['Από', d.organizer] as [string, string | null | undefined]] : [])]),
      !user && d.staffNote ? callout('accent', d.staffNote, 'Σημείωση') : none,
      user && d.message ? callout('neutral', d.message, 'Μήνυμα πελάτη') : none,
    ],
    signoff: !user,
  });
}

export function staffNewAppointmentEmail(brand: EmailBrand, d: { code: string; autoConfirmed: boolean; when: string; name: string; company?: string | null; email?: string | null; phone?: string | null; topic?: string | null; message?: string | null; link: string }): RenderedEmail {
  return renderEmail({
    brand, internal: true, subject: `Νέο ραντεβού ${d.code} — ${d.company ?? d.name}`, label: 'Website',
    band: d.autoConfirmed ? { tone: 'good', text: 'Επιβεβαιώθηκε αυτόματα' } : { tone: 'accent', text: 'Χρειάζεται επιβεβαίωση' },
    eyebrow: d.code, title: d.autoConfirmed ? 'Νέο ραντεβού' : 'Νέο αίτημα ραντεβού', intro: 'Από τη φόρμα του website.',
    blocks: [
      facts([['Πότε', d.when], ['Ονοματεπώνυμο', d.name], ['Εταιρεία', d.company], ['Email', d.email], ['Τηλέφωνο', d.phone], ['Θέμα', d.topic]]),
      d.message ? callout('neutral', d.message, 'Μήνυμα') : none,
      button(d.link, 'Άνοιγμα στο ημερολόγιο'),
    ],
    note: 'Απαντήστε σε αυτό το email για να επικοινωνήσετε απευθείας με τον επισκέπτη.',
  });
}

// ── Δυναμικές προσφορές: κρατήσεις & πληρωμές ────────────────────────────────────────────────

export function reservationRequestedEmail(brand: EmailBrand, d: { who: string; qty: string; product: string; offer?: string | null; notes?: string | null; link?: string | null }): RenderedEmail {
  return renderEmail({
    brand, internal: true, subject: `Αίτημα κράτησης — ${d.who}`, label: 'Δυναμική προσφορά', band: { tone: 'accent', text: 'Χρειάζεται έγκριση' },
    title: 'Νέο αίτημα κράτησης', intro: `${d.who} ζητά ${d.qty} στο «${d.product}»${d.offer ? ` (${d.offer})` : ''}.`,
    blocks: [
      facts([['Πελάτης', d.who], ['Προϊόν', d.product], ['Προσφορά', d.offer], ['Ποσότητα', d.qty]]),
      d.notes ? callout('neutral', d.notes, 'Σημείωση πελάτη') : none,
      paragraph('Έγκριση: Δυναμικές προσφορές → η προσφορά → Κρατήσεις → ⋮ → Έγκριση.'),
      d.link ? button(d.link, 'Άνοιγμα προσφοράς') : none,
    ],
    note: 'Το αίτημα δεν μετράει στο γέμισμα μέχρι να εγκριθεί.',
  });
}

export function reservationDecisionEmail(brand: EmailBrand, d: { approved: boolean; qty: string; product: string; offer?: string | null; note?: string | null; link?: string | null }): RenderedEmail {
  const ok = d.approved;
  return renderEmail({
    brand, subject: `${ok ? 'Εγκρίθηκε' : 'Δεν εγκρίθηκε'} η κράτησή σας — ${d.product}`, label: 'Κοινό container',
    band: ok ? { tone: 'good', text: 'Εγκρίθηκε' } : { tone: 'danger', text: 'Δεν εγκρίθηκε' },
    title: ok ? 'Η κράτησή σας εγκρίθηκε' : 'Το αίτημα δεν εγκρίθηκε',
    intro: ok
      ? `Η κράτησή σας για ${d.qty} στο «${d.product}»${d.offer ? ` (${d.offer})` : ''} εγκρίθηκε και μετράει πλέον στο γέμισμα του container.`
      : `Το αίτημά σας για ${d.qty} στο «${d.product}»${d.offer ? ` (${d.offer})` : ''} δεν εγκρίθηκε.`,
    blocks: [
      facts([['Προϊόν', d.product], ['Προσφορά', d.offer], ['Ποσότητα', d.qty]]),
      d.note ? callout(ok ? 'neutral' : 'warn', d.note, 'Σημείωση') : none,
      ok ? paragraph('Όσο γεμίζει το container η τιμή πέφτει για όλους — θα σας ενημερώνουμε σε κάθε πτώση.') : none,
      d.link ? button(d.link, 'Δείτε την προσφορά') : none,
    ],
    signoff: true,
    note: 'Για οποιαδήποτε απορία απαντήστε σε αυτό το email.',
  });
}

export function paymentRequestEmail(brand: EmailBrand, d: {
  contactName: string; product: string; offer?: string | null; quantity: string; unitPriceLabel: string; unitPrice: string;
  net: string; vatLabel: string; vat: string; total: string; link: string;
}): RenderedEmail {
  return renderEmail({
    brand, subject: `Πληρωμή κράτησης — ${d.product}`, preheader: `Σύνολο ${d.total} — πληρωμή με κάρτα, Apple Pay, Google Pay ή IRIS`,
    label: 'Πληρωμή', eyebrow: 'Η κράτησή σας εγκρίθηκε', title: 'Πληρωμή της κράτησής σας', greeting: `${d.contactName},`,
    intro: `Η κράτησή σας στο «${d.product}»${d.offer && !d.offer.startsWith(d.product) ? ` (${d.offer})` : ''} εγκρίθηκε. Για να ολοκληρωθεί, πληρώστε με τον προσωπικό σας σύνδεσμο.`,
    blocks: [
      dataTable([{ label: 'Ανάλυση' }, { label: 'Ποσό', align: 'right' }], [
        ['Ποσότητα', d.quantity], [d.unitPriceLabel, d.unitPrice], ['Καθαρό', d.net], [d.vatLabel, d.vat],
      ], { foot: ['Σύνολο', d.total] }),
      button(d.link, `Πληρωμή ${d.total}`, { tone: 'accent', note: 'Κάρτα, Apple Pay, Google Pay, IRIS και άλλοι τρόποι, με ασφάλεια μέσω Viva.' }),
      callout('good', 'Αν μέχρι το κλείσιμο ισχύσει χαμηλότερο κλιμάκιο, η διαφορά σας επιστρέφεται στο ίδιο μέσο πληρωμής. Αν πληρώσετε αφού έχει ήδη πέσει, χρεώνεστε απευθείας τη χαμηλότερη τιμή.', 'Η τιμή πέφτει όσο γεμίζει το container'),
    ],
    signoff: true,
    note: 'Ο σύνδεσμος είναι προσωπικός — μην τον προωθείτε. Για απορίες απαντήστε σε αυτό το email.',
  });
}

// ── Αιτήματα παραγγελίας (B2B πύλη) ──────────────────────────────────────────────────────────

export function orderRequestStaffEmail(brand: EmailBrand, d: {
  code: string; who: string; from?: string | null; customerRef?: string | null; delivery?: string | null; address?: string | null;
  lines: { code?: string | null; name: string; note?: string | null; qty: string }[]; notes?: string | null; link?: string | null;
}): RenderedEmail {
  return renderEmail({
    brand, internal: true, subject: `Αίτημα παραγγελίας ${d.code} — ${d.who}`, label: 'B2B πύλη', band: { tone: 'accent', text: 'Νέο αίτημα — δεν έχει καταχωριστεί στο SoftOne' },
    eyebrow: d.code, title: d.who, intro: `${d.lines.length} ${d.lines.length === 1 ? 'γραμμή' : 'γραμμές'} από την πύλη πελατών.`,
    blocks: [
      facts([['Από', d.from], ['Αναφορά πελάτη', d.customerRef], ['Παράδοση', d.delivery], ['Διεύθυνση', d.address]]),
      dataTable([{ label: 'Κωδικός', nowrap: true }, { label: 'Είδος' }, { label: 'Ποσότητα', align: 'right' }],
        d.lines.map((l) => [l.code ?? '', l.note ? `${l.name} — ${l.note}` : l.name, l.qty])),
      d.notes ? callout('neutral', d.notes, 'Σημειώσεις') : none,
      d.link ? button(d.link, 'Άνοιγμα στα αιτήματα παραγγελίας') : none,
    ],
    note: 'Επιβεβαιώστε το αίτημα από τη διαχείριση για να καταχωριστεί.',
  });
}

export function contractAcceptedStaffEmail(brand: EmailBrand, d: {
  ref: string; title: string; who: string; by?: string | null; total: string; when: string; link?: string | null;
}): RenderedEmail {
  return renderEmail({
    brand, internal: true, subject: `Αποδοχή προσφοράς ${d.ref} — ${d.who}`, label: 'B2B πύλη', band: { tone: 'accent', text: 'Ο πελάτης αποδέχτηκε την προσφορά από την πύλη' },
    eyebrow: d.ref, title: d.title, intro: `Η προσφορά έγινε σύμβαση (Αποδεκτή). Επόμενο βήμα: σύνδεση με έργο και ενεργοποίηση.`,
    blocks: [
      facts([['Πελάτης', d.who], ['Αποδοχή από', d.by], ['Σύνολο με ΦΠΑ', d.total], ['Πότε', d.when]]),
      d.link ? button(d.link, 'Άνοιγμα της σύμβασης') : none,
    ],
    note: 'Η αποδοχή καταγράφηκε στο audit log με τον χρήστη της πύλης.',
  });
}

// ── Αίτημα προσφοράς από την πύλη ─────────────────────────────────────────────────────────────

export function offerRequestStaffEmail(brand: EmailBrand, d: {
  ref: string; title: string; who: string; by: string; description: string; site?: string | null; wanted?: string | null; photos: number; link?: string | null;
}): RenderedEmail {
  return renderEmail({
    brand, internal: true, subject: `Νέο αίτημα προσφοράς ${d.ref} — ${d.who}`, label: 'B2B πύλη', band: { tone: 'accent', text: 'Ο πελάτης ζήτησε προσφορά από την πύλη' },
    eyebrow: d.ref, title: d.title, intro: 'Δημιουργήθηκε πρόχειρη προσφορά με την περιγραφή του πελάτη. Συμπληρώστε τη και στείλτε την.',
    blocks: [
      facts([['Πελάτης', d.who], ['Από', d.by], ['Χώρος', d.site], ['Επιθυμητή έναρξη', d.wanted], ['Φωτογραφίες', d.photos ? String(d.photos) : null]]),
      rich(esc(d.description).replace(/\n/g, '<br/>')),
      d.link ? button(d.link, 'Άνοιγμα της προσφοράς') : none,
    ],
  });
}

export function offerRequestCustomerEmail(brand: EmailBrand, d: { ref: string; title: string; link?: string | null }): RenderedEmail {
  return renderEmail({
    brand, subject: `Λάβαμε το αίτημά σας για προσφορά · ${d.ref}`, preheader: 'Θα σας στείλουμε την προσφορά στην πύλη σας.',
    label: 'Αίτημα προσφοράς', eyebrow: d.ref, title: d.title,
    intro: 'Σας ευχαριστούμε. Λάβαμε το αίτημά σας και ετοιμάζουμε την προσφορά. Θα σας ειδοποιήσουμε μόλις είναι έτοιμη — θα τη δείτε και στην πύλη σας, όπου μπορείτε να μας κάνετε ερωτήσεις ή να ζητήσετε αλλαγές.',
    blocks: [d.link ? button(d.link, 'Τα αιτήματά μου') : none],
    signoff: true,
  });
}

// ── Newsletter ───────────────────────────────────────────────────────────────────────────────

export function newsletterConfirmEmail(brand: EmailBrand, d: { link: string }): RenderedEmail {
  return renderEmail({
    brand, subject: `Επιβεβαιώστε την εγγραφή σας · ${brand.name}`, preheader: 'Ένα κλικ για να ολοκληρωθεί η εγγραφή σας.',
    label: 'Newsletter', title: 'Ένα βήμα ακόμη',
    intro: 'Πατήστε το κουμπί για να επιβεβαιώσετε ότι θέλετε να λαμβάνετε τα νέα του atelier.',
    blocks: [
      bullets(['Νέα υλικά και συλλογές', 'Δυναμικές προσφορές container', 'Εκδηλώσεις και παρουσιάσεις στο atelier']),
      button(d.link, 'Επιβεβαίωση εγγραφής'),
      rich(`Ή αντιγράψτε τον σύνδεσμο: <span style="word-break:break-all;color:#6B655E;">${esc(d.link)}</span>`),
    ],
    signoff: true,
    note: 'Αν δεν κάνατε εσείς την εγγραφή, αγνοήστε αυτό το μήνυμα — δεν θα σας στείλουμε τίποτα.',
  });
}

export function newsletterStaffEmail(brand: EmailBrand, d: { email: string; name?: string | null; source?: string | null; link: string }): RenderedEmail {
  return renderEmail({
    brand, internal: true, subject: `Νέος συνδρομητής newsletter — ${d.email}`, label: 'Website', title: 'Νέα εγγραφή στο newsletter',
    intro: `${d.name ? `${d.name} · ` : ''}${d.email} επιβεβαίωσε την εγγραφή${d.source ? ` (από: ${d.source})` : ''}.`,
    blocks: [button(d.link, 'Leads & newsletter')],
  });
}

// ── Εργασίες έργων (προσωπικό) ───────────────────────────────────────────────────────────────

export type TaskMailKind = 'created' | 'updated' | 'cancelled';
const TASK: Record<TaskMailKind, { subject: string; intro: string; band?: { tone: 'warn' | 'danger'; text: string } }> = {
  created: { subject: 'Νέα εργασία', intro: 'Σας ορίστηκε η παρακάτω εργασία έργου. Το συνημμένο αρχείο την προσθέτει στο ημερολόγιό σας.' },
  updated: { subject: 'Αλλαγή εργασίας', intro: 'Η εργασία άλλαξε. Το συνημμένο αρχείο ενημερώνει το ημερολόγιό σας.', band: { tone: 'warn', text: 'Άλλαξε' } },
  cancelled: { subject: 'Αφαίρεση εργασίας', intro: 'Η εργασία αφαιρέθηκε από το ημερολόγιο. Το συνημμένο αρχείο τη σβήνει από το δικό σας.', band: { tone: 'danger', text: 'Αφαιρέθηκε' } },
};

export function taskInviteEmail(brand: EmailBrand, kind: TaskMailKind, d: { name: string; project: string; when: string; duration: string; description?: string | null }): RenderedEmail {
  const c = TASK[kind];
  return renderEmail({
    brand, internal: true, subject: `${c.subject}: ${d.name} · ${d.project}`, label: 'Έργα', band: c.band, eyebrow: d.project, title: d.name, intro: c.intro,
    blocks: [
      facts([['Εργασία', d.name], ['Έργο', d.project], ['Πότε', d.when], ['Χρόνος', d.duration]]),
      d.description ? callout('neutral', d.description, 'Περιγραφή') : none,
    ],
  });
}

export { eur as formatEurEl };

/** Μήνυμα από τη διαχείριση (επικοινωνία έργου/πελάτη) — ελεύθερο κείμενο με προαιρετικό σύνδεσμο προς την πύλη. */
/** Inline στυλ για το (ήδη καθαρισμένο) HTML του editor — τα mail clients αγνοούν τα <style>. */
function emailizeHtml(html: string): string {
  const C = EMAIL_COLORS;
  return html
    .replace(/<p>/g, '<p style="margin:0 0 12px;">')
    .replace(/<(ul|ol)>/g, '<$1 style="margin:0 0 12px;padding-left:22px;">')
    .replace(/<li>/g, '<li style="margin:0 0 4px;">')
    .replace(/<li style="margin:0 0 4px;"><p style="margin:0 0 12px;">([\s\S]*?)<\/p><\/li>/g, '<li style="margin:0 0 4px;">$1</li>')
    .replace(/<blockquote>/g, `<blockquote style="margin:0 0 12px;padding:2px 0 2px 14px;border-left:3px solid ${C.line};color:${C.muted};">`)
    .replace(/<h3>/g, `<h3 style="margin:18px 0 8px;font:600 17px/1.35 ${SANS};color:${C.ink};">`)
    .replace(/<a href=/g, `<a style="color:${C.accent};" href=`);
}

/**
 * «Επικοινωνία» από το προσωπικό προς πελάτη/συνεργείο/συνεργάτη — με την ταυτότητα της εταιρείας,
 * το έργο στην κορυφή, υπογραφή του αποστολέα και τον κωδικό αναφοράς που συνδέει την απάντηση.
 */
export function staffMessageEmail(brand: EmailBrand, d: {
  subject: string; body: string; html?: string | null; context?: string | null; link?: string | null; attachments?: number;
  greeting?: string | null; sender?: { name: string; email?: string | null } | null; replyCode?: string | null;
}): RenderedEmail {
  const C = EMAIL_COLORS;
  const phone = firstPhone(brand);
  const sig = d.sender ? rich(`<span style="color:${C.ink};font-weight:600;">${esc(d.sender.name)}</span><br/>${esc(brand.name)}${phone ? ` · ${esc(phone)}` : ''}${d.sender.email ? `<br/><a href="mailto:${esc(d.sender.email)}" style="color:${C.accent};text-decoration:none;">${esc(d.sender.email)}</a>` : ''}`) : none;
  return renderEmail({
    brand, subject: d.replyCode ? `${d.subject} [#${d.replyCode}]` : d.subject, preheader: d.body.slice(0, 120),
    label: 'Μήνυμα', eyebrow: d.context ?? undefined, title: d.subject, greeting: d.greeting ?? null,
    blocks: [
      d.html ? rawHtml(emailizeHtml(d.html)) : rich(esc(d.body).replace(/\n/g, '<br/>')),
      d.attachments ? callout('neutral', `${d.attachments === 1 ? 'Ένα συνημμένο αρχείο' : `${d.attachments} συνημμένα αρχεία`} σε αυτό το μήνυμα.`) : none,
      d.link ? button(d.link, 'Άνοιγμα στην πύλη', { note: 'Το μήνυμα και όλο το ιστορικό του έργου είναι και στην πύλη πελατών.' }) : none,
      sig,
    ],
    signoff: !d.sender,
    note: d.replyCode ? `Κωδικός αναφοράς #${d.replyCode} — απαντήστε απευθείας σε αυτό το email, ώστε η απάντησή σας να μπει στο ιστορικό του έργου.` : undefined,
  });
}
