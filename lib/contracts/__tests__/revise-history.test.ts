import { describe, expect, it } from 'vitest';
import { applyRevision, buildRevisePrompt, describeChange, parseRevision, ReviseParseError, type ApplyLine } from '../revise-core';
import { buildHistory, historyCsv, isOpenRequest, type HistoryEvent, type HistoryNote } from '../history-core';

const line = (p: Partial<ApplyLine>): ApplyLine => ({ kind: 'MATERIAL', mtrl: 1, code: 'A', name: 'Πλακάκι', unit: 'm²', qty: 10, unitPrice: 20, discount: 0, notes: null, partyKey: null, crewFee: null, roomId: 'r1', ...p });
const lines = [line({}), line({ name: 'Κόλλα', unit: 'kg', qty: 50, unitPrice: 0.5 }), line({ kind: 'SERVICE', name: 'Τοποθέτηση', qty: 10, unitPrice: 22 })];

describe('revise-core', () => {
  it('το prompt έχει κλειδιά γραμμών και αιτήματα με id', () => {
    const { user } = buildRevisePrompt({
      title: 'Μπάνιο', kindLabel: 'Προϊόν', customerName: 'Π', summary: '', customerText: null, rooms: [], milestones: [],
      lines: lines.map((l, i) => ({ key: `L${i + 1}`, kind: l.kind, name: l.name, code: l.code, unit: l.unit, qty: l.qty, unitPrice: l.unitPrice, discount: l.discount, room: 'Μπάνιο' })),
      requests: [{ id: 'q1', kind: 'CHANGE', body: 'Μόνο δάπεδο', target: 'Χώρος: Μπάνιο', thread: [] }],
    });
    expect(user).toContain('L2 | Υλικό | Κόλλα');
    expect(user).toContain('[q1] ΑΙΤΗΜΑ ΑΛΛΑΓΗΣ (για: Χώρος: Μπάνιο): Μόνο δάπεδο');
  });

  it('κρατά μόνο αλλαγές σε υπαρκτές γραμμές και απαντήσεις σε υπαρκτά αιτήματα', () => {
    const r = parseRevision(JSON.stringify({
      summary: 'Μείωση', changes: [
        { op: 'update', line: 'L1', qty: 6, reason: 'μόνο δάπεδο', request: 'q1' },
        { op: 'update', line: 'L9', qty: 1 },
        { op: 'update', line: 'L1', qty: 2 },
        { op: 'remove', line: 'L2', request: 'zzz' },
        { op: 'update', line: 'L3', qty: null, unitPrice: null, discount: null },
        { op: 'add', kind: 'MATERIAL', name: 'Σοβατεπί', unit: 'm', qty: 8, unitPrice: 6, room: 'μπάνιο' },
      ],
      replies: [{ request: 'q1', text: 'Έγινε' }, { request: 'xx', text: 'όχι' }],
    }), new Set(['L1', 'L2', 'L3']), new Set(['q1']));
    expect(r.changes.map((c) => c.op)).toEqual(['update', 'remove', 'add']);
    expect(r.changes[1]).toMatchObject({ request: null });
    expect(r.replies).toEqual([{ request: 'q1', text: 'Έγινε' }]);
    expect(r.dropped).toBe(3);
    expect(() => parseRevision('όχι json', new Set(), new Set())).toThrow(ReviseParseError);
  });

  it('εφαρμογή και περιγραφή: πριν → μετά με διαφορά αξίας', () => {
    const changes = parseRevision(JSON.stringify({ changes: [
      { op: 'update', line: 'L1', qty: 6, discount: 10 }, { op: 'remove', line: 'L2' },
      { op: 'add', name: 'Σοβατεπί', unit: 'm', qty: 8, unitPrice: 6, room: 'ΜΠΆΝΙΟ ' },
    ] }), new Set(['L1', 'L2', 'L3']), new Set()).changes;
    const map = new Map(lines.map((l, i) => [`L${i + 1}`, l]));
    expect(describeChange(changes[0], map).delta).toBe(108 - 200);
    expect(describeChange(changes[1], map)).toMatchObject({ before: expect.stringContaining('50'), after: null, delta: -25 });
    const out = applyRevision(lines.map((l, i) => ({ ...l, uid: `u${i}` })), changes, [{ id: 'r9', name: 'Μπάνιο' }], (l) => ({ ...l, uid: 'new' }));
    expect(out.map((l) => l.name)).toEqual(['Πλακάκι', 'Τοποθέτηση', 'Σοβατεπί']);
    expect(out[0]).toMatchObject({ qty: 6, discount: 10, uid: 'u0' });
    expect(out[2]).toMatchObject({ mtrl: null, roomId: 'r9', uid: 'new' });
  });
});

describe('history-core', () => {
  const note = (p: Partial<HistoryNote>): HistoryNote => ({
    id: 'n', contractId: 'c1', kind: 'NOTE', body: 'κείμενο', targetLabel: null, replyToId: null, revision: 2, authorKind: 'STAFF', authorName: 'Γιάννης',
    shareWith: [], resolved: false, photoCount: 0, createdAt: '2026-10-24T10:00:00.000Z', ...p,
  });
  const notes = [
    note({ id: 'q', kind: 'QUESTION', authorKind: 'CUSTOMER', authorName: 'Μαρία', shareWith: ['CUSTOMER'], body: 'Πόσες μέρες;', createdAt: '2026-10-24T09:00:00.000Z' }),
    note({ id: 'a', replyToId: 'q', shareWith: ['CUSTOMER'], body: 'Τρεις', createdAt: '2026-10-24T11:00:00.000Z' }),
    note({ id: 'i', body: 'εσωτερικό', createdAt: '2026-10-24T12:00:00.000Z' }),
  ];
  const events: HistoryEvent[] = [
    { id: 'e1', contractId: 'c1', type: 'SENT', actorKind: 'STAFF', actorName: 'Γιάννης', summary: 'Στάλθηκε η έκδοση 2', customer: true, revision: 2, createdAt: '2026-10-24T08:00:00.000Z' },
    { id: 'e2', contractId: 'c1', type: 'RESTORED', actorKind: 'STAFF', actorName: 'Γιάννης', summary: 'Επαναφορά', customer: false, revision: 1, createdAt: '2026-10-24T13:00:00.000Z' },
  ];

  it('ο πελάτης βλέπει μόνο ό,τι μοιραζόμαστε, με «Εσείς» και την επωνυμία μας', () => {
    const h = buildHistory(notes, events, 'CUSTOMER', { companyName: 'Atelier', refs: { c1: 'ΣΥΜ-000001' } });
    expect(h.map((e) => e.id)).toEqual(['a', 'q', 'e1']);
    expect(h[0]).toMatchObject({ title: 'Απάντηση', who: 'Atelier' });
    expect(h[1]).toMatchObject({ title: 'Ερώτηση', who: 'Εσείς', open: true, contractRef: 'ΣΥΜ-000001' });
  });

  it('εμείς βλέπουμε όλα, νεότερα πρώτα· CSV με BOM', () => {
    const h = buildHistory(notes, events, 'STAFF');
    expect(h.map((e) => e.id)).toEqual(['e2', 'i', 'a', 'q', 'e1']);
    expect(h[3].who).toBe('Πελάτης · Μαρία');
    const csv = historyCsv(h);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Επαναφορά έκδοσης');
  });

  it('ανοιχτό αίτημα: μόνο ερώτηση/αλλαγή του πελάτη που δεν έκλεισε', () => {
    expect(isOpenRequest(notes[0])).toBe(true);
    expect(isOpenRequest({ ...notes[0], resolved: true })).toBe(false);
    expect(isOpenRequest(notes[1])).toBe(false);
  });
});
