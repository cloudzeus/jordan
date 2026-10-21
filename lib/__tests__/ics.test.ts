import { describe, expect, it } from 'vitest';
import { buildIcs, foldLine, icsParam, icsText } from '../ics';

const base = { uid: 'appointment-a1@atelierdamask.gr', start: new Date('2026-10-20T07:00:00Z'), end: new Date('2026-10-20T08:00:00Z'), summary: 'Ραντεβού · Atelier', stamp: new Date('2026-10-18T10:00:00Z') };

describe('.ics', () => {
  it('ώρα Αθήνας με VTIMEZONE (θερινή και χειμερινή)', () => {
    const ics = buildIcs(base);
    expect(ics).toContain('DTSTART;TZID=Europe/Athens:20261020T100000');
    expect(ics).toContain('DTEND;TZID=Europe/Athens:20261020T110000');
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics).toContain('RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU');
    expect(buildIcs({ ...base, start: new Date('2026-11-03T08:00:00Z'), end: new Date('2026-11-03T09:00:00Z') })).toContain('DTSTART;TZID=Europe/Athens:20261103T100000');
    expect(ics).toContain('DTSTAMP:20261018T100000Z');
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
  it('δημοσίευση με υπενθύμιση· ακύρωση = METHOD:CANCEL, STATUS:CANCELLED, ίδιο UID, νέο SEQUENCE', () => {
    const ok = buildIcs({ ...base, sequence: 0 });
    expect(ok).toMatch(/METHOD:PUBLISH[\s\S]*STATUS:CONFIRMED[\s\S]*BEGIN:VALARM/);
    const c = buildIcs({ ...base, sequence: 2, cancelled: true });
    expect(c).toContain('METHOD:CANCEL');
    expect(c).toContain('STATUS:CANCELLED');
    expect(c).toContain('SEQUENCE:2');
    expect(c).toContain(`UID:${base.uid}`);
    expect(c).not.toContain('VALARM');
  });
  it('escape κειμένου και αναδίπλωση UTF-8 χωρίς κόψιμο χαρακτήρα', () => {
    expect(icsText('Α, Β; Γ\\Δ\nΕ')).toBe('Α\\, Β\\; Γ\\\\Δ\\nΕ');
    const long = `DESCRIPTION:${'Ελληνικό κείμενο '.repeat(12)}`;
    const folded = foldLine(long);
    expect(folded.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
  });
  it('διοργανωτής και συμμετέχοντες', () => {
    const ics = buildIcs({ ...base, organizer: { name: 'Γιάννης', email: 'g@x.gr' }, attendees: [{ name: 'DORIC', email: 'info@doric.gr' }] });
    expect(ics).toContain('ORGANIZER;CN=Γιάννης:mailto:g@x.gr');
    expect(ics).toContain('ATTENDEE;CN=DORIC;ROLE=REQ-PARTICIPANT:mailto:info@doric.gr');
  });
  it('όνομα με ; : , μπαίνει σε εισαγωγικά (όχι escape με \\)', () => {
    expect(icsParam('ΔΟΡΙΚ Α.Ε.')).toBe('ΔΟΡΙΚ Α.Ε.');
    expect(icsParam('Παπαδόπουλος, Γ.')).toBe('"Παπαδόπουλος, Γ."');
    expect(icsParam('A;B:C')).toBe('"A;B:C"');
    expect(icsParam('Ο "Μάστορας"\nΓιώργος')).toBe('Ο Μάστορας Γιώργος');
    const ics = buildIcs({ ...base, attendees: [{ name: 'Κ. Παπάς; Συνεργείο', email: 'k@x.gr' }] });
    expect(ics.replace(/\r\n /g, '')).toContain('ATTENDEE;CN="Κ. Παπάς; Συνεργείο";ROLE=REQ-PARTICIPANT:mailto:k@x.gr');
  });
});
