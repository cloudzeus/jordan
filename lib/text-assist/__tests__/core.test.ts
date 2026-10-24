import { describe, expect, it } from 'vitest';
import { buildFormatPrompt, cleanFormatted, describeField, formatRequest, textAssistAllowed } from '../core';

describe('textAssistAllowed', () => {
  it('μόνο ADMIN και SUPER_ADMIN', () => {
    expect(textAssistAllowed('SUPER_ADMIN')).toBe(true);
    expect(textAssistAllowed('ADMIN')).toBe(true);
    for (const r of ['EMPLOYEE', 'COLLABORATOR', 'SUPPLIER', 'CUSTOMER', null, undefined, '']) expect(textAssistAllowed(r)).toBe(false);
  });
});

describe('formatRequest', () => {
  it('κενά πεδία πλαισίου → undefined, field προαιρετικό', () => {
    const r = formatRequest.parse({ text: 'γεια', field: { label: '  ', page: 'Έργα' } });
    expect(r.field.label).toBeUndefined();
    expect(r.field.page).toBe('Έργα');
    expect(formatRequest.parse({ text: 'x' }).field).toEqual({});
  });
  it('απορρίπτει πολύ μεγάλο κείμενο', () => {
    expect(() => formatRequest.parse({ text: 'α'.repeat(12_001) })).toThrow();
  });
});

describe('buildFormatPrompt', () => {
  it('περιέχει το πλαίσιο του πεδίου και το κείμενο', () => {
    const req = formatRequest.parse({
      text: 'να μπει πλακακι 30 επι 60 στο μπανιο τελεια',
      field: { label: 'Σημειώσεις', section: 'Νέα εργασία', page: 'Εργασίες έργου', path: '/admin/projects/12/tasks', siblings: [{ label: 'Τίτλος', value: 'Ανακαίνιση μπάνιου' }] },
    });
    const { system, user } = buildFormatPrompt(req);
    expect(system).toMatch(/ΠΟΤΕ μην προσθέτεις στοιχεία/);
    expect(user).toContain('Πεδίο: Σημειώσεις');
    expect(user).toContain('Ενότητα/παράθυρο: Νέα εργασία');
    expect(user).toContain('Σελίδα: Εργασίες έργου (/admin/projects/12/tasks)');
    expect(user).toContain('Τίτλος: Ανακαίνιση μπάνιου');
    expect(user).toContain('Κείμενο προς μορφοποίηση:');
    expect(user).toContain('να μπει πλακακι 30 επι 60');
  });
  it('μερική μορφοποίηση: δίνει το υπόλοιπο ως πλαίσιο', () => {
    const { user } = buildFormatPrompt(formatRequest.parse({ text: 'τμημα', surrounding: 'αρχη … τελος' }));
    expect(user).toContain('Τμήμα προς μορφοποίηση:');
    expect(user).toContain('αρχη … τελος');
  });
  it('χωρίς πληροφορίες πεδίου', () => {
    expect(describeField({})).toMatch(/Δεν υπάρχουν πληροφορίες/);
  });
});

describe('cleanFormatted', () => {
  it('αφαιρεί fences, οριοθέτες, εισαγωγικά και Markdown', () => {
    expect(cleanFormatted('```\nΚείμενο.\n```')).toBe('Κείμενο.');
    expect(cleanFormatted('<<<\nΚείμενο.\n>>>')).toBe('Κείμενο.');
    expect(cleanFormatted('«Τοποθέτηση πλακιδίων.»')).toBe('Τοποθέτηση πλακιδίων.');
    expect(cleanFormatted('## Τίτλος\n**Έντονο** κείμενο')).toBe('Τίτλος\nΈντονο κείμενο');
    expect(cleanFormatted('α\n\n\n\nβ')).toBe('α\n\nβ');
  });
  it('κρατά εισαγωγικά μέσα στο κείμενο', () => {
    expect(cleanFormatted('Είπε «ναι» και «όχι»')).toBe('Είπε «ναι» και «όχι»');
    expect(cleanFormatted('- πρώτο\n- δεύτερο')).toBe('- πρώτο\n- δεύτερο');
  });
});
