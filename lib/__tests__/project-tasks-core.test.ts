import { describe, expect, it } from 'vitest';
import {
  addWorkdays, applyTemplateItems, buildTemplateItems, calendarSegments, calendarWindow, filterAllTasks, groupByProject, isOverdue, durationDays, moveOnBoard, phaseOf, progressForPhase,
  projectProgress, schedule, snapProgress, toWorkday, waitingOn, workdaysBetween, wouldCreateCycle, type TemplateSource,
} from '@/lib/project-tasks-core';

// 2026-10-19 = Δευτέρα
describe('φάσεις & ποσοστά', () => {
  it('snap σε βήματα 25%', () => {
    expect(snapProgress(-5)).toBe(0);
    expect(snapProgress(12)).toBe(0);
    expect(snapProgress(13)).toBe(25);
    expect(snapProgress(60)).toBe(50);
    expect(snapProgress(140)).toBe(100);
    expect(snapProgress(Number.NaN)).toBe(0);
  });
  it('στήλη από ποσοστό', () => {
    expect([0, 25, 50, 75, 100].map(phaseOf)).toEqual(['TODO', 'IN_PROGRESS', 'IN_PROGRESS', 'REVIEW', 'DONE']);
  });
  it('μεταφορά σε στήλη κρατά το ποσοστό αν ταιριάζει', () => {
    expect(progressForPhase('IN_PROGRESS', 50)).toBe(50);
    expect(progressForPhase('IN_PROGRESS', 0)).toBe(25);
    expect(progressForPhase('IN_PROGRESS', 100)).toBe(25);
    expect(progressForPhase('DONE', 25)).toBe(100);
    expect(progressForPhase('TODO', 75)).toBe(0);
  });
  it('ποσοστό έργου σταθμισμένο με τη διάρκεια', () => {
    expect(projectProgress([])).toBe(0);
    expect(projectProgress([{ progress: 100, durationValue: 3, durationUnit: 'DAYS' }, { progress: 0, durationValue: 1, durationUnit: 'DAYS' }])).toBe(75);
    // 4 ώρες = 1 ημέρα
    expect(projectProgress([{ progress: 50, durationValue: 4, durationUnit: 'HOURS' }, { progress: 100, durationValue: 1, durationUnit: 'DAYS' }])).toBe(75);
  });
});

describe('εργάσιμες ημέρες', () => {
  it('διάρκεια σε ημέρες', () => {
    expect(durationDays(3, 'DAYS')).toBe(3);
    expect(durationDays(0.5, 'DAYS')).toBe(1);
    expect(durationDays(4, 'HOURS')).toBe(1);
    expect(durationDays(9, 'HOURS')).toBe(2);
    expect(durationDays(0, 'DAYS')).toBe(1);
  });
  it('παρακάμπτει Σαββατοκύριακο', () => {
    expect(toWorkday('2026-10-24')).toBe('2026-10-26'); // Σάββατο → Δευτέρα
    expect(addWorkdays('2026-10-22', 2)).toBe('2026-10-26'); // Πέμ + 2 → Δευ
    expect(workdaysBetween('2026-10-19', '2026-10-26')).toBe(5);
    expect(workdaysBetween('2026-10-26', '2026-10-19')).toBe(-5);
  });
});

describe('εξαρτήσεις & χρονοπρογραμματισμός', () => {
  it('ανιχνεύει κύκλο', () => {
    const edges = [{ taskId: 'b', dependsOnId: 'a' }, { taskId: 'c', dependsOnId: 'b' }];
    expect(wouldCreateCycle(edges, 'a', ['c'])).toBe(true);
    expect(wouldCreateCycle(edges, 'a', ['a'])).toBe(true);
    expect(wouldCreateCycle(edges, 'c', ['a'])).toBe(false);
    // αντικατάσταση των εξαρτήσεων του b: δεν μετράνε οι παλιές του
    expect(wouldCreateCycle([...edges, { taskId: 'a', dependsOnId: 'x' }], 'b', ['x'])).toBe(false);
  });

  it('finish-to-start σε εργάσιμες', () => {
    const s = schedule([
      { id: 'a', startDate: null, durationValue: 3, durationUnit: 'DAYS', dependsOn: [] },
      { id: 'b', startDate: null, durationValue: 2, durationUnit: 'DAYS', dependsOn: ['a'] },
      { id: 'c', startDate: null, durationValue: 4, durationUnit: 'HOURS', dependsOn: ['a', 'b'] },
    ], '2026-10-19');
    expect(s.rows.get('a')).toMatchObject({ start: '2026-10-19', end: '2026-10-21', auto: true, conflict: false });
    expect(s.rows.get('b')).toMatchObject({ start: '2026-10-22', end: '2026-10-23' });
    expect(s.rows.get('c')).toMatchObject({ start: '2026-10-26', end: '2026-10-26', days: 1 });
    expect(s.cycle).toEqual([]);
  });

  it('ορισμένη έναρξη: κρατιέται, με σύγκρουση αν είναι νωρίτερα από τα προαπαιτούμενα', () => {
    const s = schedule([
      { id: 'a', startDate: '2026-10-19', durationValue: 5, durationUnit: 'DAYS', dependsOn: [] },
      { id: 'b', startDate: '2026-10-21', durationValue: 1, durationUnit: 'DAYS', dependsOn: ['a'] },
      { id: 'c', startDate: '2026-11-02', durationValue: 1, durationUnit: 'DAYS', dependsOn: ['a'] },
    ], '2026-10-01');
    expect(s.rows.get('b')).toMatchObject({ start: '2026-10-21', earliest: '2026-10-26', conflict: true });
    expect(s.rows.get('c')).toMatchObject({ start: '2026-11-02', conflict: false });
  });

  it('κύκλος δεν κολλάει τον υπολογισμό', () => {
    const s = schedule([
      { id: 'a', startDate: null, durationValue: 1, durationUnit: 'DAYS', dependsOn: ['b'] },
      { id: 'b', startDate: null, durationValue: 1, durationUnit: 'DAYS', dependsOn: ['a'] },
    ], '2026-10-19');
    expect(s.cycle.sort()).toEqual(['a', 'b']);
    expect(s.rows.get('a')!.start).toBe('2026-10-19');
  });

  it('περιμένει ανολοκλήρωτα προαπαιτούμενα', () => {
    expect(waitingOn({ dependsOn: ['a', 'b', 'zz'] }, [{ id: 'a', progress: 100 }, { id: 'b', progress: 75 }])).toEqual(['b']);
  });
});

describe('Kanban', () => {
  const tasks = [
    { id: 'a', progress: 0, sortOrder: 0 },
    { id: 'b', progress: 0, sortOrder: 1 },
    { id: 'c', progress: 50, sortOrder: 0 },
  ];
  it('μεταφορά σε άλλη στήλη πριν από κάρτα', () => {
    expect(moveOnBoard(tasks, 'a', 'IN_PROGRESS', 'c')).toEqual([
      { id: 'a', progress: 25, sortOrder: 0 },
      { id: 'c', progress: 50, sortOrder: 1 },
    ]);
  });
  it('αναδιάταξη στην ίδια στήλη, στο τέλος', () => {
    expect(moveOnBoard(tasks, 'a', 'TODO', null)).toEqual([
      { id: 'b', progress: 0, sortOrder: 0 },
      { id: 'a', progress: 0, sortOrder: 1 },
    ]);
  });
  it('άγνωστο id → καμία αλλαγή', () => {
    expect(moveOnBoard(tasks, 'x', 'DONE', null)).toEqual([]);
  });
});

describe('templates', () => {
  const src: TemplateSource[] = [
    { id: 'a', name: 'Αποτύπωση', description: null, startDate: '2026-10-19', durationValue: 2, durationUnit: 'DAYS', dependsOn: [], customerVisible: true, inCalendar: true },
    { id: 'b', name: 'Μελέτη', description: 'σχέδια', startDate: null, durationValue: 3, durationUnit: 'DAYS', dependsOn: ['a'], customerVisible: false, inCalendar: false },
    { id: 'c', name: 'Παραγγελία', description: null, startDate: null, durationValue: 4, durationUnit: 'HOURS', dependsOn: ['b'], customerVisible: true, inCalendar: false },
  ];

  it('αποθήκευση μέρους: σχετικές ενάρξεις, εξαρτήσεις μόνο εντός επιλογής', () => {
    const items = buildTemplateItems(src, ['b', 'c'], '2026-10-19');
    expect(items.map((i) => [i.key, i.name, i.offsetDays, i.dependsOn])).toEqual([
      ['t1', 'Μελέτη', 0, []],
      ['t2', 'Παραγγελία', 3, ['t1']],
    ]);
  });

  it('εφαρμογή σε νέο έργο από ημερομηνία', () => {
    const items = buildTemplateItems(src, ['a', 'b', 'c'], '2026-10-19');
    const out = applyTemplateItems(items, '2026-11-06'); // Παρασκευή
    expect(out.map((t) => [t.name, t.startDate, t.dependsOnKeys])).toEqual([
      ['Αποτύπωση', '2026-11-06', []],
      ['Μελέτη', '2026-11-10', ['t1']],
      ['Παραγγελία', '2026-11-13', ['t2']],
    ]);
    expect(out[0]).toMatchObject({ customerVisible: true, inCalendar: true, followsDeps: false });
    expect(out[1].followsDeps).toBe(true);
  });

  it('εφαρμογή σέβεται εξαρτήσεις ακόμη κι αν το offset είναι μικρό', () => {
    const out = applyTemplateItems([
      { key: 'x', name: 'X', description: null, durationValue: 5, durationUnit: 'DAYS', offsetDays: 0, customerVisible: false, inCalendar: false, dependsOn: [] },
      { key: 'y', name: 'Y', description: null, durationValue: 1, durationUnit: 'DAYS', offsetDays: 1, customerVisible: false, inCalendar: false, dependsOn: ['x'] },
    ], '2026-10-19');
    expect(out[1].startDate).toBe('2026-10-26');
    expect(out[1].followsDeps).toBe(true);
  });
});

describe('ημερολόγιο', () => {
  it('ώρες ≤ 8 την ίδια μέρα από 09:00 (Αθήνα)', () => {
    const w = calendarWindow('2026-10-20', 3, 'HOURS');
    expect(w.start.toISOString()).toBe('2026-10-20T06:00:00.000Z'); // EEST +3
    expect(w.end.toISOString()).toBe('2026-10-20T09:00:00.000Z');
  });
  it('ημέρες έως 17:00 της τελευταίας εργάσιμης', () => {
    const w = calendarWindow('2026-10-30', 2, 'DAYS'); // Παρ → Δευ, μετά την αλλαγή ώρας (EET +2)
    expect(w.start.toISOString()).toBe('2026-10-30T07:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-11-02T15:00:00.000Z');
  });
});

describe('templates — κενά διαστήματα', () => {
  it('σκόπιμο κενό μετά την εξάρτηση κρατά σταθερή ημερομηνία', () => {
    const out = applyTemplateItems([
      { key: 'x', name: 'X', description: null, durationValue: 1, durationUnit: 'DAYS', offsetDays: 0, customerVisible: false, inCalendar: false, dependsOn: [] },
      { key: 'y', name: 'Y', description: null, durationValue: 1, durationUnit: 'DAYS', offsetDays: 4, customerVisible: false, inCalendar: false, dependsOn: ['x'] },
    ], '2026-10-19');
    expect(out[1]).toMatchObject({ startDate: '2026-10-23', followsDeps: false });
  });
});

describe('τμήματα ημερολογίου', () => {
  it('ένα ανά εργάσιμη, 09:00–17:00', () => {
    const s = calendarSegments('2026-10-23', 2, 'DAYS'); // Παρ + Δευ
    expect(s.map((x) => x.date)).toEqual(['2026-10-23', '2026-10-26']);
    expect(s[0].start.toISOString()).toBe('2026-10-23T06:00:00.000Z');
    expect(s[0].end.toISOString()).toBe('2026-10-23T14:00:00.000Z');
  });
  it('ώρες: 8 ανά ημέρα, υπόλοιπο την τελευταία', () => {
    const s = calendarSegments('2026-10-20', 10, 'HOURS');
    expect(s.map((x) => (x.end.getTime() - x.start.getTime()) / 3_600_000)).toEqual([8, 2]);
  });
});

describe('όλες οι εργασίες: φίλτρα & ομάδες', () => {
  const row = (o: Partial<import('@/lib/project-tasks-core').AllTaskRow>) => ({
    id: 'x', prjc: 1, projectCode: 'P1', projectName: 'Έργο Α', name: 'Εργασία', progress: 0, durationValue: 1, durationUnit: 'DAYS',
    start: '2026-10-19', end: '2026-10-19', conflict: false, dependsOn: [], parties: [], ...o,
  });
  const rows = [
    row({ id: 'a', name: 'Αποτύπωση', progress: 100, start: '2026-10-12', end: '2026-10-13' }),
    row({ id: 'b', name: 'Μελέτη', progress: 50, start: '2026-10-14', end: '2026-10-16', parties: [{ kind: 'EMPLOYEE', ref: 'u1', label: 'Γιάννης' }] }),
    row({ id: 'c', prjc: 2, projectCode: 'P2', projectName: 'Έργο Β', name: 'Παραγγελία', progress: 25, start: '2026-10-20', end: '2026-10-28', conflict: true }),
  ];
  const today = '2026-10-19'; // Δευτέρα
  const ids = (f: import('@/lib/project-tasks-core').TaskFilter) => filterAllTasks(rows, f, today).map((r) => r.id);

  it('κατάσταση', () => {
    expect(ids({ status: 'open' })).toEqual(['b', 'c']);
    expect(ids({ status: 'done' })).toEqual(['a']);
    expect(ids({ status: 'overdue' })).toEqual(['b']);
    expect(ids({ status: 'conflict' })).toEqual(['c']);
    expect(ids({ status: 'week' })).toEqual(['c']);
    expect(isOverdue({ end: '2026-10-19', progress: 0 }, today)).toBe(false);
  });
  it('έργο, φάση, εμπλεκόμενος, διάστημα, αναζήτηση', () => {
    expect(ids({ prjc: 2 })).toEqual(['c']);
    expect(ids({ phases: ['IN_PROGRESS'] })).toEqual(['b', 'c']);
    expect(ids({ party: 'EMPLOYEE:u1' })).toEqual(['b']);
    expect(ids({ from: '2026-10-16', to: '2026-10-20' })).toEqual(['b', 'c']);
    expect(ids({ q: 'έργο β' })).toEqual(['c']);
    expect(ids({ q: 'ΓΙΆΝΝΗΣ' })).toEqual(['b']);
  });
  it('ομάδες ανά έργο με εύρος και σταθμισμένη πρόοδο', () => {
    const g = groupByProject(rows);
    expect(g.map((x) => [x.prjc, x.start, x.end, x.progress, x.tasks.map((t) => t.id)])).toEqual([
      [1, '2026-10-12', '2026-10-16', 75, ['a', 'b']],
      [2, '2026-10-20', '2026-10-28', 25, ['c']],
    ]);
  });
});
