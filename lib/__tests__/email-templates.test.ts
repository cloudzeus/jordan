import { describe, expect, it } from 'vitest';
import { EMAIL_CATALOG, SAMPLE_BRAND } from '../email/catalog';
import { button, dataTable, facts, htmlToText, renderEmail } from '../email/layout';
import { otpEmail, welcomeEmail } from '../email/templates';

describe('κοινό layout', () => {
  it('escape παντού, preheader, υποσέλιδο με νομικά στοιχεία', () => {
    const m = renderEmail({ brand: SAMPLE_BRAND, subject: 'Θ', title: 'Τίτλος <b>', intro: 'Α & Β', preheader: 'προ', blocks: [facts([['Κ', '<x>'], ['Κενό', null]])] });
    expect(m.html).toContain('Τίτλος &lt;b&gt;');
    expect(m.html).toContain('Α &amp; Β');
    expect(m.html).toContain('&lt;x&gt;');
    expect(m.html).not.toContain('Κενό');
    expect(m.html).toContain('ATELIER ΜΙΚΕ · ΑΦΜ 801771250');
    expect(m.html).toMatch(/<html lang="el"/);
    expect(m.text).toContain('Κ: <x>');
    expect(m.text).toContain('ATELIER ΜΙΚΕ · ΑΦΜ 801771250');
  });

  it('εσωτερική ειδοποίηση: λιτό υποσέλιδο, χωρίς υπογραφή', () => {
    const m = renderEmail({ brand: SAMPLE_BRAND, subject: 'Θ', title: 'Τ', internal: true });
    expect(m.html).toContain('μόνο για το προσωπικό');
    expect(m.html).not.toContain('Με εκτίμηση');
  });

  it('κουμπί bulletproof (bgcolor) και πίνακας με σύνολα', () => {
    expect(button('https://x.gr/a?b=1&c=2', 'Πάμε').html).toContain('bgcolor="#1C1B19"');
    expect(button('https://x.gr/a?b=1&c=2', 'Πάμε').html).toContain('href="https://x.gr/a?b=1&amp;c=2"');
    const t = dataTable([{ label: 'Α' }, { label: 'Β', align: 'right' }], [['1', '2']], { foot: ['Σ', '3'] });
    expect(t.text).toBe('1 · Β: 2\nΣ · 3');
  });

  it('htmlToText: σύνδεσμοι, γραμμές, οντότητες', () => {
    expect(htmlToText('<p>Γεια &amp; χαρά</p><p><a href="https://a.gr">Σύνδεση</a></p>')).toBe('Γεια & χαρά\nΣύνδεση (https://a.gr)');
  });
});

describe('πρότυπα', () => {
  it('OTP: κωδικός, διάρκεια, θέμα ανά είδος', () => {
    const m = otpEmail(SAMPLE_BRAND, { kind: 'reset', code: '012345', minutes: 15 });
    expect(m.subject).toBe('Νέος κωδικός πρόσβασης · Atelier by Damask');
    expect(m.html).toContain('012345');
    expect(m.text).toContain('ΚΩΔΙΚΟΣ: 012345');
    expect(m.text).toContain('15 λεπτά');
  });

  it('καλωσόρισμα: ποτέ κωδικός πρόσβασης στο email', () => {
    const m = welcomeEmail(SAMPLE_BRAND, { name: 'Μαρία', email: 'm@x.gr', orgName: 'ΟΡΓ', loginUrl: 'https://a/s', lostUrl: 'https://a/l' });
    expect(m.html).toContain('href="https://a/s"');
    expect(m.html).not.toMatch(/password:|κωδικός σας είναι/i);
  });

  it('κατάλογος: μοναδικά id, κάθε πρότυπο αποδίδεται με θέμα, HTML και απλό κείμενο', () => {
    const ids = EMAIL_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of EMAIL_CATALOG) {
      const m = e.render(SAMPLE_BRAND);
      expect(m.subject.length, e.id).toBeGreaterThan(5);
      expect(m.html, e.id).toMatch(/^<!doctype html>/);
      expect(m.html, e.id).toContain('Atelier by Damask');
      expect(m.text.length, e.id).toBeGreaterThan(30);
      expect(m.text, e.id).not.toMatch(/<\/?(td|table|div|p)\b/);
      expect(m.html, e.id).not.toContain('undefined');
      expect(m.html, e.id).not.toContain('null');
    }
  });
});
