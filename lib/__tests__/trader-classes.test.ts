import { describe, expect, it } from 'vitest';
import {
  CLASS_BY_KEY, CLASS_TREE, childrenOf, classPath, classifyTrader, craftSpecialty, isLeaf, kadDigits, kadRules, leafForKad,
  leafFromPurchases, parentOf, treeFor, type Side,
} from '@/lib/trader-classes';

const c = (code: string, descr?: string) => leafForKad('customer', code, descr)?.key;
const s = (code: string, descr?: string) => leafForKad('supplier', code, descr)?.key;
const SIDES: Side[] = ['customer', 'supplier'];

describe('δέντρο TRDBUSINESS', () => {
  it('μία ρίζα ανά πλευρά (10 πελάτες, 20 προμηθευτές)· κάθε άλλος κόμβος έχει γονέα στην ίδια πλευρά', () => {
    for (const side of SIDES) {
      const roots = treeFor(side).filter((n) => !parentOf(n));
      expect(roots.map((r) => r.soh)).toEqual([side === 'customer' ? '10' : '20']);
    }
    for (const n of CLASS_TREE) {
      if (!n.soh.includes('.')) continue;
      expect(parentOf(n)?.side, n.key).toBe(n.side);
    }
  });

  it('όρια SoftOne: CODE ≤ 10, NAME ≤ 50, SOHCODE ≤ 64 — και μοναδικά ανά πλευρά', () => {
    for (const n of CLASS_TREE) {
      expect(n.code.length, n.key).toBeLessThanOrEqual(10);
      expect(n.name.length, n.key).toBeLessThanOrEqual(50);
      expect(n.soh.length).toBeLessThanOrEqual(64);
    }
    for (const side of SIDES) {
      for (const f of ['code', 'soh', 'name'] as const) {
        const v = treeFor(side).map((n) => n[f]);
        expect(new Set(v).size, `${side}.${f}`).toBe(v.length);
      }
    }
    expect(new Set(CLASS_TREE.map((n) => n.key)).size).toBe(CLASS_TREE.length);
  });

  it('ονόματα σύντομα (όχι τίτλοι ΚΑΔ): έως 4 λέξεις', () => {
    for (const n of CLASS_TREE) expect(n.name.split(/\s+/).filter((w) => w !== '&').length, n.name).toBeLessThanOrEqual(4);
  });

  it('κανόνες ΚΑΔ μόνο σε φύλλα· κάθε πρόθεμα μία φορά ανά πλευρά', () => {
    for (const n of CLASS_TREE) if (n.kad?.length) expect(isLeaf(n), n.key).toBe(true);
    for (const side of SIDES) {
      const p = kadRules(side).map(([x]) => x);
      expect(new Set(p).size, side).toBe(p.length);
    }
  });

  it('η εγκεκριμένη δομή: 3 βασικές κατηγορίες προμηθευτών, επαγγελματίες/ιδιώτες/δημόσιο στους πελάτες', () => {
    expect(childrenOf(CLASS_BY_KEY.get('S_ROOT')!).map((n) => `${n.soh} ${n.code} ${n.name}`)).toEqual([
      '20.1 ΟΙΚ-ΥΛ Οικοδομικών Υλικών', '20.2 ΥΠΗΡ Παροχή Υπηρεσιών', '20.3 ΟΙΚ-ΕΡΓ Οικοδομικών Εργασιών',
    ]);
    expect(childrenOf(CLASS_BY_KEY.get('C_ROOT')!).map((n) => n.code)).toEqual(['ΠΕΛ-ΕΠΑΓ', 'ΙΔΙΩΤ', 'ΔΗΜ', 'ΕΞΩ']);
  });

  it('classPath από τη ρίζα', () => {
    expect(classPath('S_CRAFT').map((n) => n.soh)).toEqual(['20', '20.3', '20.3.02']);
    expect(() => classPath('X')).toThrow();
  });

  it('κάθε τμήμα ΚΑΔ 01–99 έχει φύλλο και στις δύο πλευρές', () => {
    for (let d = 1; d <= 99; d++) {
      if (d === 40 || d === 44 || d === 48) continue; // κενά τμήματα του NACE
      const div = String(d).padStart(2, '0');
      expect(c(`${div}00`), `πελάτης ${div}`).toBeDefined();
      expect(s(`${div}00`), `προμηθευτής ${div}`).toBeDefined();
    }
  });
});

describe('leafForKad', () => {
  it('πελάτες', () => {
    expect(c('41.00.10.01')).toBe('C_BUILD');
    expect(c('71.11')).toBe('C_DESIGN');
    expect(c('74.13')).toBe('C_DESIGN');
    expect(c('74.12')).toBe('C_SERVICES');
    expect(c('55.20.19.00')).toBe('C_HOTEL');
    expect(c('59.14.00.01')).toBe('C_FOOD');
    expect(c('68.12')).toBe('C_ESTATE');
    expect(c('46.83')).toBe('C_MATTRADE');
    expect(c('46.73')).toBe('C_TRADE'); // NACE 2.1: μοτοσυκλέτες
    expect(c('84.11')).toBe('C_PUBLIC');
    expect(c('70.20.30.01', 'ΥΠΗΡΕΣΙΕΣ ΔΙΑΚΟΣΜΗΤΗ ΚΑΤΑΣΤΗΜΑΤΩΝ')).toBe('C_DESIGN');
    expect(c('93.29.11.03', 'ΥΠΗΡΕΣΙΕΣ ΕΚΜΕΤΑΛΛΕΥΣΗΣ ΚΤΗΜΑΤΟΣ, ΓΙΑ ΔΙΕΝΕΡΓΕΙΑ ΕΚΔΗΛΩΣΕΩΝ')).toBe('C_FOOD');
  });

  it('προμηθευτές — υλικά', () => {
    expect(s('23.70.11.01')).toBe('S_TILES');
    expect(s('23.31')).toBe('S_TILES');
    expect(s('20.30')).toBe('S_PAINT');
    expect(s('16.22')).toBe('S_WOOD');
    expect(s('46.83.11.01')).toBe('S_BUILDMAT');
    expect(s('46.84')).toBe('S_MEPMAT');
    expect(s('31.09')).toBe('S_FURN');
    expect(s('46.62')).toBe('S_TOOLS');
    expect(s('46.83.12.07', 'ΧΟΝΔΡΙΚΟ ΕΜΠΟΡΙΟ ΜΑΡΜΑΡΩΝ')).toBe('S_TILES');
    expect(s('46.64.06.53', 'ΧΟΝΔΡΙΚΟ ΕΜΠΟΡΙΟ ΜΟΝΩΜΕΝΩΝ ΣΥΡΜΑΤΩΝ ΚΑΙ ΚΑΛΩΔΙΩΝ')).toBe('S_MEPMAT');
    expect(s('47.52.02.00', 'ΛΙΑΝΙΚΗ ΠΩΛΗΣΗ ΧΡΩΜΑΤΩΝ')).toBe('S_PAINT');
  });

  it('προμηθευτές — υπηρεσίες & εργασίες', () => {
    expect(s('49.41')).toBe('S_TRANSPORT');
    expect(s('71.12')).toBe('S_DESIGN');
    expect(s('69.20')).toBe('S_PROF');
    expect(s('61.10')).toBe('S_UTIL');
    expect(s('77.32')).toBe('S_RENT');
    expect(s('62.01')).toBe('S_MEDIA');
    expect(s('82.99')).toBe('S_OTHERSERV');
    expect(s('43.33')).toBe('S_CREW');
    expect(s('25.11')).toBe('S_CREW');
    expect(s('25.99')).toBe('S_GOODS');
  });

  it('κενό/άκυρο ⇒ null', () => {
    expect(leafForKad('customer', '')).toBeNull();
    expect(leafForKad('supplier', '4')).toBeNull();
  });
});

describe('ειδικότητα τεχνίτη', () => {
  it('μακρύτερο πρόθεμα', () => {
    expect(craftSpecialty('43.21.10.01')).toBe('Ηλεκτρολόγος');
    expect(craftSpecialty('43.33')).toBe('Πλακάς');
    expect(craftSpecialty('43.99')).toBe('Οικοδομικές εργασίες');
    expect(craftSpecialty('25.11')).toBe('Σιδεράς');
    expect(craftSpecialty('62.01')).toBeNull();
  });
});

describe('leafFromPurchases', () => {
  it('σταθμισμένη ψηφοφορία· τα γενικά είδη δεν ψηφίζουν', () => {
    expect(leafFromPurchases([
      { name: 'ZELLIGE 10X10X1.2 NATURAL', value: 600 }, { name: 'ISOMAT AK20', value: 300 }, { name: 'ΥΠΗΡΕΣΙΕΣ', value: 100 },
    ])).toEqual({ key: 'S_TILES', share: 0.6 });
    expect(leafFromPurchases([{ name: 'ΥΠΗΡΕΣΙΕΣ', value: 10 }])).toBeNull();
  });
});

describe('kadDigits', () => {
  it('ψηφία χωρίς ουρά μηδενικών', () => expect(kadDigits('46.83.00.00')).toBe('4683'));
});

describe('classifyTrader', () => {
  it('πελάτης με ΚΑΔ ⇒ φύλλο και διαδρομή από τη ρίζα', () => {
    expect(classifyTrader({ side: 'customer', afmKind: 'greek', aadeFound: true, primaryKad: '55.10.10.01' })).toEqual({
      leaf: 'C_HOTEL', path: ['C_ROOT', 'C_PRO', 'C_HOTEL'], basis: 'kad', rule: '55', review: false,
    });
  });

  it('ΝΠΔΔ ⇒ Δημόσιο πριν από τον ΚΑΔ', () => {
    expect(classifyTrader({ side: 'customer', afmKind: 'greek', legalForm: 'Ν.Π.Δ.Δ.', primaryKad: '85.31' }).leaf).toBe('C_PUBLIC');
    expect(classifyTrader({ side: 'supplier', afmKind: 'greek', legalForm: 'ΝΠΔΔ' }).leaf).toBe('S_PUBLIC');
  });

  it('κατασκευαστικός ΚΑΔ: φυσικό πρόσωπο ⇒ Τεχνίτης, εταιρία ⇒ Συνεργείο — με ειδικότητα', () => {
    expect(classifyTrader({ side: 'supplier', afmKind: 'greek', aadeFound: true, naturalPerson: true, primaryKad: '43.34' }))
      .toMatchObject({ leaf: 'S_CRAFT', path: ['S_ROOT', 'S_WORKS', 'S_CRAFT'], specialty: 'Ελαιοχρωματιστής' });
    expect(classifyTrader({ side: 'supplier', afmKind: 'greek', aadeFound: true, naturalPerson: false, primaryKad: '43.21' }))
      .toMatchObject({ leaf: 'S_CREW', specialty: 'Ηλεκτρολόγος' });
  });

  it('γενικός ΚΑΔ + ξεκάθαρες αγορές ⇒ οι αγορές· ειδικός ΚΑΔ ⇒ ο ΚΑΔ', () => {
    const stone = [{ name: 'OLD WORLD Πέτρινο Δάπεδο', value: 900 }, { name: 'ΑΝΑΛΩΣΙΜΑ', value: 100 }];
    expect(classifyTrader({ side: 'supplier', afmKind: 'greek', aadeFound: true, primaryKad: '46.83.06.00', purchases: stone }))
      .toMatchObject({ leaf: 'S_TILES', basis: 'purchases', review: false });
    expect(classifyTrader({ side: 'supplier', afmKind: 'greek', aadeFound: true, primaryKad: '20.30', purchases: stone }))
      .toMatchObject({ leaf: 'S_PAINT', basis: 'kad' });
  });

  it('ξένος προμηθευτής ⇒ από τις αγορές· χαμηλό μερίδιο ⇒ για έλεγχο', () => {
    expect(classifyTrader({ side: 'supplier', afmKind: 'foreign', purchases: [{ name: 'DOLCI ARGILLA FINE', value: 9 }] }).leaf).toBe('S_PAINT');
    expect(classifyTrader({ side: 'supplier', afmKind: 'foreign', purchases: [{ name: 'ZELLIGE', value: 3 }, { name: 'ΥΠΗΡΕΣΙΕΣ', value: 7 }] }))
      .toMatchObject({ leaf: 'S_TILES', review: true });
    expect(classifyTrader({ side: 'supplier', afmKind: 'foreign' })).toMatchObject({ leaf: null, review: true });
  });

  it('προμηθευτής χωρίς τίποτα ⇒ καμία πρόταση (για έλεγχο)', () => {
    expect(classifyTrader({ side: 'supplier', afmKind: 'none' })).toMatchObject({ leaf: null, path: [], basis: 'no_afm', review: true });
  });

  it('πελάτες: ιδιώτες, εξωτερικού, επιτηδευματίας χωρίς ΚΑΔ', () => {
    expect(classifyTrader({ side: 'customer', afmKind: 'none' })).toMatchObject({ leaf: 'C_PRIVATE', path: ['C_ROOT', 'C_PRIVATE'] });
    expect(classifyTrader({ side: 'customer', afmKind: 'foreign' }).leaf).toBe('C_FOREIGN');
    expect(classifyTrader({ side: 'customer', afmKind: 'greek', aadeFound: true, firmFlag: 'ΠΡΩΗΝ ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ' }).basis).toBe('former_business');
    expect(classifyTrader({ side: 'customer', afmKind: 'greek', aadeFound: false })).toMatchObject({ leaf: 'C_PRIVATE', review: true });
    expect(classifyTrader({ side: 'customer', afmKind: 'greek', aadeFound: true, firmFlag: 'ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ' })).toMatchObject({ leaf: null, review: true });
  });
});
