/**
 * iCalendar (.ics, RFC 5545) για τα ραντεβού — καθαρή συνάρτηση, χωρίς βιβλιοθήκη.
 *
 * Ώρες σε `TZID=Europe/Athens` με πλήρες VTIMEZONE (EET/EEST, κανόνες ΕΕ: τελευταία Κυριακή Μαρτίου /
 * Οκτωβρίου), ώστε Outlook/Gmail/Apple να δείχνουν σωστή ώρα και μετά την αλλαγή ώρας. Ίδιο UID σε
 * κάθε αλλαγή + αυξανόμενο SEQUENCE → το ημερολόγιο του παραλήπτη ΕΝΗΜΕΡΩΝΕΙ το ίδιο γεγονός
 * (μεταφορά) ή το ακυρώνει (METHOD:CANCEL, STATUS:CANCELLED).
 */
import { ATELIER_TZ, zonedParts } from '@/lib/appointments-core';

export type IcsEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string | null;
  location?: string | null;
  organizer?: { name: string; email: string } | null;
  attendees?: { name?: string | null; email: string }[];
  sequence?: number;
  cancelled?: boolean;
  /** Χρονοσφραγίδα δημιουργίας του αρχείου (για ντετερμινιστικά tests). */
  stamp?: Date;
};

const VTIMEZONE = [
  'BEGIN:VTIMEZONE', `TZID:${ATELIER_TZ}`,
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0300', 'TZNAME:EEST', 'DTSTART:19700329T030000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0300', 'TZOFFSETTO:+0200', 'TZNAME:EET', 'DTSTART:19701025T040000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];

/** Κείμενο RFC 5545: escape \ ; , και αλλαγές γραμμής. */
export const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Γραμμές ≤ 75 octets (UTF-8), συνέχεια με κενό — χωρίς να κόβεται χαρακτήρας στη μέση. */
export function foldLine(line: string) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    const limit = out.length ? 74 : 75; // οι συνέχειες ξεκινούν με κενό
    if (enc.encode(cur + ch).length > limit) { out.push(cur); cur = ch; } else cur += ch;
  }
  out.push(cur);
  return out.map((l, i) => (i ? ` ${l}` : l)).join('\r\n');
}

const local = (d: Date) => { const p = zonedParts(d, ATELIER_TZ); return `${p.date.replace(/-/g, '')}T${p.time.replace(':', '')}00`; };
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function buildIcs(e: IcsEvent): string {
  const method = e.cancelled ? 'CANCEL' : 'PUBLISH';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Atelier by Damask//Ραντεβού//EL', 'CALSCALE:GREGORIAN', `METHOD:${method}`,
    ...VTIMEZONE,
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${utc(e.stamp ?? new Date())}`,
    `DTSTART;TZID=${ATELIER_TZ}:${local(e.start)}`,
    `DTEND;TZID=${ATELIER_TZ}:${local(e.end)}`,
    `SEQUENCE:${e.sequence ?? 0}`,
    `STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    `SUMMARY:${icsText(e.summary)}`,
    ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    ...(e.organizer ? [`ORGANIZER;CN=${icsText(e.organizer.name)}:mailto:${e.organizer.email}`] : []),
    ...(e.attendees ?? []).map((a) => `ATTENDEE;CN=${icsText(a.name || a.email)};ROLE=REQ-PARTICIPANT:mailto:${a.email}`),
    ...(e.cancelled ? [] : ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Υπενθύμιση ραντεβού', 'TRIGGER:-PT1H', 'END:VALARM']),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
