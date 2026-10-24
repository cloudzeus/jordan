import { describe, expect, it } from 'vitest';
import { effectiveChannels, findReplyCode, messageEntries, messageInput, newReplyCode, subjectWithCode, type MessageRow } from '../messages-core';
import { staffMessageEmail } from '../email/templates';
import { SAMPLE_BRAND } from '../email/catalog';

const row = (p: Partial<MessageRow>): MessageRow => ({
  id: 'm1', contractId: null, audience: 'CUSTOMER', kind: 'SEND', toName: 'Γιάννης', viaEmail: true, viaPortal: true, emailStatus: 'SENT',
  subject: 'Παράδοση', body: 'Τα υλικά έρχονται Τρίτη.', attachments: 0, authorName: 'Μαρία', createdAt: '2026-10-24T10:00:00.000Z', ...p,
});

describe('επικοινωνία', () => {
  it('είσοδος: χρειάζεται έργο ή πελάτη, θέμα και κείμενο', () => {
    expect(messageInput.safeParse({ recipientKey: 'c', subject: 'Θέμα', body: 'Κείμενο' }).success).toBe(false);
    expect(messageInput.safeParse({ prjc: 5, recipientKey: 'c', subject: 'Θέμα', body: 'Κείμενο' }).success).toBe(true);
    expect(messageInput.safeParse({ trdr: 5, recipientKey: 'c', subject: '', body: 'Κείμενο' }).success).toBe(false);
  });

  it('κανάλια: χωρίς email δεν στέλνεται email· η πύλη μόνο για πελάτη· η καταγραφή δεν στέλνει τίποτα', () => {
    expect(effectiveChannels({ kind: 'SEND', viaEmail: true, viaPortal: true }, { audience: 'CUSTOMER', email: null })).toEqual({ viaEmail: false, viaPortal: true });
    expect(effectiveChannels({ kind: 'SEND', viaEmail: true, viaPortal: true }, { audience: 'SUPPLIER', email: 'a@b.gr' })).toEqual({ viaEmail: true, viaPortal: false });
    expect(effectiveChannels({ kind: 'LOG', viaEmail: true, viaPortal: true }, { audience: 'CUSTOMER', email: 'a@b.gr' })).toEqual({ viaEmail: false, viaPortal: false });
  });

  it('ιστορικό: ο πελάτης βλέπει μόνο ό,τι του στάλθηκε στην πύλη, χωρίς εσωτερικές λεπτομέρειες', () => {
    const rows = [row({}), row({ id: 'm2', viaPortal: false }), row({ id: 'm3', audience: 'INTERNAL', viaEmail: false, viaPortal: false }), row({ id: 'm4', kind: 'LOG' }), row({ id: 'm5', audience: 'SUPPLIER', toName: 'Συνεργείο Α' })];
    const cust = messageEntries(rows, 'CUSTOMER', { companyName: 'Atelier' });
    expect(cust.map((e) => e.id)).toEqual(['m1']);
    expect(cust[0]).toMatchObject({ title: 'Μήνυμα', who: 'Atelier', target: null, body: 'Παράδοση\nΤα υλικά έρχονται Τρίτη.' });
    const staff = messageEntries([...rows, row({ id: 'm6', emailStatus: 'BLOCKED' })], 'STAFF');
    expect(staff.map((e) => e.title)).toEqual(['Μήνυμα · email + πύλη', 'Email', 'Εσωτερική σημείωση', 'Επικοινωνία (καταγραφή)', 'Μήνυμα · email + πύλη', 'Μήνυμα · email + πύλη']);
    expect(staff[4].target).toBe('προς Συνεργείο Α (Συνεργείο)');
    expect(staff[5].target).toContain('δεν στάλθηκε');
  });

  it('κοινοποίηση: έγκυρα email, πεζά· άκυρο → σφάλμα', () => {
    const ok = messageInput.safeParse({ prjc: 5, recipientKey: 'c', subject: 'Θέμα', body: 'Κείμενο', cc: [' Maria@Example.com '] });
    expect(ok.success && ok.data.cc).toEqual(['maria@example.com']);
    expect(messageInput.safeParse({ prjc: 5, recipientKey: 'c', subject: 'Θέμα', body: 'Κείμενο', cc: ['όχι-email'] }).success).toBe(false);
  });

  it('κωδικός απάντησης: 8 χαρακτήρες, βρίσκεται σε θέμα, Reply-To και header', () => {
    const code = newReplyCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(newReplyCode()).not.toBe(code);
    expect(findReplyCode(`RE: ${subjectWithCode('Παράδοση', code)}`)).toBe(code);
    expect(findReplyCode(null, `reply+${code.toLowerCase()}@in.atelier-dm.gr`)).toBe(code);
    expect(findReplyCode('Χωρίς κωδικό', code)).toBe(code);
    expect(findReplyCode('Χωρίς κωδικό')).toBeNull();
  });

  it('email: ταυτότητα εταιρείας, έργο, μορφοποίηση, υπογραφή και κωδικός', () => {
    const m = staffMessageEmail(SAMPLE_BRAND, {
      subject: 'Παράδοση', body: 'Τρίτη', html: '<p>Έρχονται <strong>Τρίτη</strong></p><ul><li><p>ρεύμα</p></li></ul>',
      context: 'ΕΡΓ-031 · Βούλα', replyCode: 'K7F3Q9XA', sender: { name: 'Στέλλα', email: 's@x.gr' },
    });
    expect(m.subject).toBe('Παράδοση [#K7F3Q9XA]');
    expect(m.html).toContain('<strong>Τρίτη</strong>');
    expect(m.html).toContain('<li style="margin:0 0 4px;">ρεύμα</li>');
    expect(m.html).toContain('ΕΡΓ-031');
    expect(m.html).toContain(SAMPLE_BRAND.vat!);
    expect(m.text).toContain('#K7F3Q9XA');
    expect(m.text).toContain('Στέλλα');
  });
});
