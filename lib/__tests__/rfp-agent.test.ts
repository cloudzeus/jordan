import { describe, expect, it } from 'vitest';
import { buildAgentPrompt, DEFAULT_CAPABILITIES, emptyDraft, mergeDraft, parseAgentTurn, rfpText, AgentParseError } from '../rfp-agent-core';

describe('rfp-agent-core', () => {
  it('το prompt περιέχει τι αναλαμβάνουμε, το draft και τη συνομιλία', () => {
    const { system, user } = buildAgentPrompt({ capabilities: DEFAULT_CAPABILITIES, catalog: ['Τσιμεντοκονία μπάνιου'], company: 'Atelier', history: [{ role: 'user', text: 'Θέλω πέτρα στη βεράντα' }], draft: emptyDraft(), photos: 1, customerName: 'Γιάννης' });
    expect(system).toContain('ΔΕΝ αναλαμβάνουμε: ηλεκτρολογικά');
    expect(system).toContain('ΠΟΤΕ τιμές');
    expect(system).toContain('Τσιμεντοκονία μπάνιου');
    expect(user).toContain('ΠΕΛΑΤΗΣ: Θέλω πέτρα στη βεράντα');
    expect(user).toContain('Φωτογραφίες/κατόψεις που ανέβασε: 1');
  });

  it('διαβάζει την απάντηση και συγχωνεύει χωρίς να σβήνει ό,τι υπήρχε', () => {
    const prev = { ...emptyDraft(), title: 'Βεράντα', site: 'Κηφισιά', areas: [{ name: 'Βεράντα', m2: 25, surfaces: 'δάπεδο' }] };
    const t = parseAgentTurn(JSON.stringify({
      reply: 'Τι υλικό σας αρέσει;', quickReplies: ['Ανοιχτόχρωμη πέτρα', 'Δεν ξέρω'],
      draft: { title: '', kind: 'PRODUCT_INSTALL', areas: [], material: 'αντιολισθητική πέτρα', site: '' },
      scope: { verdict: 'YES', can: ['Πέτρα βεράντας'], cannot: [] }, ready: false, missing: ['υλικό'],
    }), prev);
    expect(t.draft).toMatchObject({ title: 'Βεράντα', site: 'Κηφισιά', kind: 'PRODUCT_INSTALL', material: 'αντιολισθητική πέτρα' });
    expect(t.draft.areas).toHaveLength(1);
    expect(t.scope.verdict).toBe('YES');
    expect(t.quickReplies).toHaveLength(2);
  });

  it('άκυρο draft κρατά το προηγούμενο· άκυρο JSON ρίχνει', () => {
    const prev = { ...emptyDraft(), title: 'Χ' };
    expect(parseAgentTurn(JSON.stringify({ reply: 'ok', draft: { areas: 'λάθος' } }), prev).draft.title).toBe('Χ');
    expect(() => parseAgentTurn('όχι json', prev)).toThrow(AgentParseError);
  });

  it('mergeDraft: το UNKNOWN δεν αντικαθιστά γνωστό τύπο', () => {
    expect(mergeDraft({ ...emptyDraft(), kind: 'PRODUCT' }, emptyDraft()).kind).toBe('PRODUCT');
  });

  it('rfpText: ευανάγνωστο κείμενο με εκτίμηση αντικειμένου', () => {
    const txt = rfpText({ ...emptyDraft(), title: 'Βεράντα', kind: 'PRODUCT_INSTALL', areas: [{ name: 'Βεράντα', m2: 25.5, surfaces: 'δάπεδο' }], site: 'Κηφισιά' }, { verdict: 'PARTIAL', can: [], cannot: ['ηλεκτρολογικά'] });
    expect(txt).toContain('• Βεράντα — 25,5 m² (δάπεδο)');
    expect(txt).toContain('Εκτίμηση βοηθού: Το αναλαμβάνουμε εν μέρει — εκτός: ηλεκτρολογικά');
  });
});
