import 'server-only';
import { softoneCall, softoneGetTable, SoftoneError } from '@/lib/softone';
import { ATELIER_TZ, zonedParts } from '@/lib/appointments-core';

/**
 * Ραντεβού → SoftOne CRM «Ραντεβού» (object SOMEETING, SOSOURCE 2052· πίνακας SOACTION), μόνο με
 * GetTable / setData.
 *
 * Σειρές του atelier: 1001 «ΡΑΝΤΕΒΟΥ ΣΤΗΝ ΕΤΑΙΡΙΑ» (ΡΑΝΕ) και 1002 «ΡΑΝΤΕΒΟΥ ΣΤΟΝ ΠΕΛΑΤΗ» (ΡΑΝΠ)·
 * η σειρά ορίζει μόνη της ενότητα/τύπο. ACTOR/ORDEREDBY = ο χρήστης SoftOne του υπευθύνου, TRDR = ο
 * πελάτης, TRDPRSN = η επαφή (PRSNOUT) όταν την ξέρουμε, FROMDATE/FINALDATE σε ώρα Αθήνας. Κάθε
 * εγγραφή επιβεβαιώνεται με ανάγνωση — το `success:true` μόνο του δεν αποδεικνύει τίποτα. Δεν
 * διαγράφουμε ποτέ.
 */

export const MEETING_OBJECT = 'SOMEETING';
export const MEETING_SERIES = { atelier: 1001, customer: 1002 } as const;
export type MeetingPlace = keyof typeof MEETING_SERIES;
export const PLACE_LABEL: Record<MeetingPlace, string> = { atelier: 'Στο atelier', customer: 'Στον πελάτη' };
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/** Instant → «2026-10-20 10:00:00» σε ώρα Αθήνας. */
export function s1DateTime(d: Date) {
  const p = zonedParts(d, ATELIER_TZ);
  return `${p.date} ${p.time}:00`;
}

export type SoftoneUser = { id: number; code: string; name: string; email: string | null };

let usersCache: { at: number; rows: SoftoneUser[] } | null = null;
/** Ενεργοί χρήστες SoftOne (USERS) — cache 5 λεπτών. */
export async function softoneUsers(force = false): Promise<SoftoneUser[]> {
  if (!force && usersCache && Date.now() - usersCache.at < 5 * 60_000) return usersCache.rows;
  const rows = await softoneGetTable('USERS', ['USERS', 'CODE', 'NAME', 'EMAIL', 'ISACTIVE'], 'ISACTIVE=1');
  const out = rows.map((r) => ({ id: Number(r.USERS), code: r.CODE, name: r.NAME || r.CODE, email: r.EMAIL || null })).sort((a, b) => a.name.localeCompare(b.name, 'el'));
  usersCache = { at: Date.now(), rows: out };
  return out;
}

export type ActionInput = { actor: number; trdr?: number | null; contactPrsn?: number | null; place?: MeetingPlace; start: Date; end: Date; subject: string; remarks?: string | null };

export function buildActionPayload(a: ActionInput, key: number | '' = '') {
  const row: Record<string, unknown> = {
    TRNDATE: zonedParts(a.start).date,
    FROMDATE: s1DateTime(a.start),
    FINALDATE: s1DateTime(a.end),
    ACTOR: a.actor,
    ORDEREDBY: a.actor,
    COMMENTS: clip(a.subject, 250),
  };
  if (key === '') row.SERIES = MEETING_SERIES[a.place ?? 'atelier'];
  if (a.trdr) row.TRDR = a.trdr;
  if (a.trdr && a.contactPrsn) row.TRDPRSN = a.contactPrsn;
  if (a.remarks) row.REMARKS = clip(a.remarks, 2000);
  return { OBJECT: MEETING_OBJECT, KEY: key === '' ? '' : String(key), DATA: { SOACTION: [row] } };
}

async function readBack(id: number) {
  const rows = await softoneGetTable('SOACTION', ['SOACTION', 'SOACTIONCODE', 'ACTOR', 'TRDR', 'FROMDATE', 'FINALDATE', 'COMMENTS'], `SOACTION=${id}`);
  return rows.find((r) => Number(r.SOACTION) === id) ?? null;
}

/** Νέο ραντεβού CRM. Επιστρέφει id + κωδικό (π.χ. «ΡΑΝΕ0000001»). ΓΡΑΦΕΙ στο SoftOne. */
export async function softoneCreateAction(a: ActionInput): Promise<{ id: number; code: string }> {
  const res = await softoneCall<{ success?: boolean; error?: string; errorcode?: number; id?: string | number }>('setData', buildActionPayload(a));
  if (res.success === false || res.id == null) throw new SoftoneError(res.error ?? `setData ${MEETING_OBJECT} απέτυχε (code ${res.errorcode ?? '?'})`);
  const id = Number(res.id);
  const row = await readBack(id);
  if (!row || Number(row.ACTOR) !== a.actor || !row.FROMDATE.startsWith(s1DateTime(a.start).slice(0, 16))) {
    throw new SoftoneError(`Το ραντεβού δεν επιβεβαιώθηκε στο SoftOne (SOACTION ${id}, ACTOR ${row?.ACTOR ?? '—'}, ${row?.FROMDATE ?? '—'})`);
  }
  return { id, code: row.SOACTIONCODE };
}

/** Αλλαγή ώρας/υπευθύνου/θέματος σε υπάρχουσα ενέργεια. ΓΡΑΦΕΙ στο SoftOne. */
export async function softoneUpdateAction(id: number, a: ActionInput): Promise<void> {
  const res = await softoneCall<{ success?: boolean; error?: string; errorcode?: number }>('setData', buildActionPayload(a, id));
  if (res.success === false) throw new SoftoneError(res.error ?? `setData ${MEETING_OBJECT} ${id} απέτυχε (code ${res.errorcode ?? '?'})`);
  const row = await readBack(id);
  if (!row || !row.FROMDATE.startsWith(s1DateTime(a.start).slice(0, 16)) || Number(row.ACTOR) !== a.actor) {
    throw new SoftoneError(`Η αλλαγή δεν επιβεβαιώθηκε στο SoftOne (SOACTION ${id}: ${row?.FROMDATE ?? '—'})`);
  }
}

export const CANCELLED_PREFIX = 'ΑΚΥΡΩΘΗΚΕ — ';
