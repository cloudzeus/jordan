import { describe, it, expect } from 'vitest';
import { ROLE_DEFAULTS } from '@/lib/permissions';
import {
  WIDGETS, allowedWidgetIds, defaultLayout, resolveLayout, sanitizeLayout, moveWidget, dropWidget, setHidden, setSize, sizeOf,
  type Access,
} from '../widgets';

const as = (roleKey: string, perms: string[] = ROLE_DEFAULTS[roleKey] ?? []): Access => ({ roleKey, permissions: new Set(perms) });

describe('δικαιώματα widgets', () => {
  it('ο SUPER_ADMIN βλέπει όλα τα widgets', () => {
    expect(allowedWidgetIds(as('SUPER_ADMIN', []))).toEqual(WIDGETS.map((w) => w.id));
  });

  it('ο EMPLOYEE (προεπιλεγμένα δικαιώματα) δεν βλέπει οικονομικά ούτε OCR ούτε Air Jordan', () => {
    const ids = allowedWidgetIds(as('EMPLOYEE'));
    expect(ids).toContain('appointments');
    expect(ids).toContain('leads');
    for (const id of ['finance-kpis', 'revenue-chart', 'projects-risk', 'ageing', 'ocr-activity', 'assistant', 'activity']) expect(ids).not.toContain(id);
  });

  it('τα οικονομικά θέλουν projects.financials — το projects.read δεν αρκεί', () => {
    const ids = allowedWidgetIds(as('EMPLOYEE', ['projects.read']));
    expect(ids).toContain('my-tasks');
    expect(ids).not.toContain('finance-kpis');
  });

  it('το Air Jordan μόνο σε ADMIN/SUPER_ADMIN, ακόμη κι αν άλλος ρόλος πάρει το δικαίωμα', () => {
    expect(allowedWidgetIds(as('EMPLOYEE', ['assistant.use']))).not.toContain('assistant');
    expect(allowedWidgetIds(as('ADMIN'))).toContain('assistant');
    expect(allowedWidgetIds(as('ADMIN', []))).not.toContain('assistant');
  });

  it('προσαρμοσμένος ρόλος (χωρίς key) παίρνει μόνο ό,τι επιτρέπουν τα δικαιώματά του', () => {
    expect(allowedWidgetIds({ roleKey: null, permissions: new Set(['order_requests.read']) })).toEqual(['order-requests']);
  });
});

describe('προεπιλεγμένη διάταξη', () => {
  it('διοίκηση: πρώτα τα οικονομικά· προσωπικό: πρώτα τα ραντεβού', () => {
    expect(defaultLayout(as('ADMIN')).order[0]).toBe('finance-kpis');
    expect(defaultLayout(as('EMPLOYEE')).order[0]).toBe('appointments');
  });

  it('η προεπιλογή περιέχει ΜΟΝΟ επιτρεπτά widgets', () => {
    const a = as('EMPLOYEE');
    const allowed = new Set(allowedWidgetIds(a));
    expect(defaultLayout(a).order.every((id) => allowed.has(id))).toBe(true);
  });

  it('δεν κρύβει το μοναδικό widget του χρήστη', () => {
    const l = defaultLayout({ roleKey: 'EMPLOYEE', permissions: new Set(['system.audit']) });
    expect(l.order).toEqual(['activity']);
    expect(l.hidden).toEqual([]);
  });
});

describe('αποθηκευμένη διάταξη', () => {
  it('χωρίς αποθήκευση → προεπιλογή', () => {
    expect(resolveLayout(null, as('ADMIN'))).toEqual(defaultLayout(as('ADMIN')));
  });

  it('κρατά τη σειρά του χρήστη και πετά ό,τι δεν επιτρέπεται πια', () => {
    const saved = { order: ['leads', 'finance-kpis', 'appointments'], hidden: ['finance-kpis'], sizes: { 'finance-kpis': 'sm' } };
    const l = resolveLayout(saved, as('EMPLOYEE'));
    expect(l.order.slice(0, 2)).toEqual(['leads', 'appointments']);
    expect(l.order).not.toContain('finance-kpis');
    expect(l.hidden).toEqual([]);
    expect(l.sizes).toEqual({});
  });

  it('νέο widget μπαίνει στη θέση της προεπιλογής του, όχι στο τέλος', () => {
    const a = as('ADMIN');
    const def = defaultLayout(a).order;
    const saved = { order: def.filter((id) => id !== 'appointments'), hidden: [], sizes: {} };
    const l = resolveLayout(saved, a);
    const prev = def[def.indexOf('appointments') - 1];
    expect(l.order.indexOf('appointments')).toBe(l.order.indexOf(prev) + 1);
    expect(l.order).toEqual(def);
  });

  it('το sanitize πετά άγνωστα ids, διπλά και άκυρα μεγέθη', () => {
    expect(sanitizeLayout({ order: ['leads', 'leads', 'hack', 3], hidden: 'x', sizes: { leads: 'xl', offers: 'lg', nope: 'sm' } }))
      .toEqual({ order: ['leads'], hidden: [], sizes: { offers: 'lg' } });
    expect(sanitizeLayout('σκουπίδια')).toBeNull();
  });
});

describe('μετακινήσεις', () => {
  const base = { order: ['a', 'b', 'c', 'd'], hidden: ['c'], sizes: {} };

  it('πάνω/κάτω προσπερνά τα κρυμμένα', () => {
    expect(moveWidget(base, 'd', 'up').order).toEqual(['a', 'd', 'b', 'c']);
    expect(moveWidget(base, 'b', 'down').order).toEqual(['a', 'c', 'd', 'b']);
  });

  it('πρώτο/τελευταίο και όρια', () => {
    expect(moveWidget(base, 'd', 'first').order[0]).toBe('d');
    expect(moveWidget(base, 'a', 'up')).toBe(base);
    expect(moveWidget(base, 'a', 'last').order.at(-1)).toBe('a');
  });

  it('drag & drop στη θέση του στόχου', () => {
    expect(dropWidget(base, 'a', 'c').order).toEqual(['b', 'c', 'a', 'd']);
    expect(dropWidget(base, 'd', 'a').order).toEqual(['d', 'a', 'b', 'c']);
  });

  it('απόκρυψη/εμφάνιση και μέγεθος', () => {
    expect(setHidden(base, 'c', false).hidden).toEqual([]);
    expect(setHidden(base, 'a', true).hidden).toEqual(['c', 'a']);
    const l = { order: ['leads'], hidden: [], sizes: {} };
    expect(sizeOf(setSize(l, 'leads', 'lg'), 'leads')).toBe('lg');
    // Πίσω στο προεπιλεγμένο μέγεθος ⇒ δεν αποθηκεύεται καθόλου.
    expect(setSize(setSize(l, 'leads', 'lg'), 'leads', 'md').sizes).toEqual({});
  });
});
