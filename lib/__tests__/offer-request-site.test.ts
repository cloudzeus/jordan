import { describe, expect, it } from 'vitest';
import { offerRequestInput, SITE_REQUIRED } from '../portal-requests-core';

const base = { title: 'Πέτρινο δάπεδο', description: 'Σαλόνι περίπου 40 m², τραβερτίνης.' };

describe('αίτημα προσφοράς: τοποθεσία υποχρεωτική', () => {
  it('χωρίς τοποθεσία → σφάλμα με εξήγηση', () => {
    const r = offerRequestInput.safeParse(base);
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0].message).toBe(SITE_REQUIRED);
    expect(offerRequestInput.safeParse({ ...base, site: ' ' }).success).toBe(false);
  });
  it('αρκεί πόλη/περιοχή ή αποθηκευμένη τοποθεσία', () => {
    expect(offerRequestInput.safeParse({ ...base, site: 'Θάσος' }).success).toBe(true);
    expect(offerRequestInput.safeParse({ ...base, siteId: 'cs_1' }).success).toBe(true);
  });
});
