import { describe, expect, it } from 'vitest';
import {
  CLASS_BY_KEY, CLASS_TREE, classPath, classifyTrader, kadDigits, kadRules, leafForKad, leafFromPurchases, treeFor,
  type Side,
} from '@/lib/trader-classes';

const c = (code: string, descr?: string) => leafForKad('customer', code, descr)?.key;
const s = (code: string, descr?: string) => leafForKad('supplier', code, descr)?.key;

describe('δέντρο', () => {
  it('κάθε κόμβος έχει, ανά πλευρά, γονέα στο αμέσως ανώτερο επίπεδο της ίδιας πλευράς', () => {
    for (const n of CLASS_TREE) {
      if (n.level === 1) { expect(n.softoneId).toBeTypeOf('number'); continue; }
      for (const side of n.sides) {
        const p = CLASS_BY_KEY.get(n.parent[side]!);
        expect(p, `${n.key}/${side}`).toBeDefined();
        expect(p!.level).toBe(n.level - 1);
        expect(p!.sides).toContain(side);
      }
    }
  });

  it('κάθε κλάδος (επ. 2) έχει τουλάχιστον μία ομάδα (επ. 3)', () => {
    for (const side of ['customer', 'supplier'] as Side[]) {
      for (const l2 of treeFor(side).filter((n) => n.level === 2)) {
        expect(treeFor(side).some((n) => n.level === 3 && n.parent[side] === l2.key), l2.key).toBe(true);
      }
    }
  });

  it('κωδικοί: TRDGROUP (επ. 3) μοναδικοί σε όλο το δέντρο· επ. 1–2 μοναδικοί ανά πλευρά', () => {
    expect(new Set(CLASS_TREE.map((n) => n.key)).size).toBe(CLASS_TREE.length);
    const l3 = CLASS_TREE.filter((n) => n.level === 3).map((n) => n.code);
    expect(new Set(l3).size).toBe(l3.length);
    for (const side of ['customer', 'supplier'] as Side[]) {
      for (const lvl of [1, 2]) {
        const codes = treeFor(side).filter((n) => n.level === lvl).map((n) => n.code);
        expect(new Set(codes).size, `${side} επ.${lvl}`).toBe(codes.length);
      }
      const prefixes = kadRules(side).map(([p]) => p);
      expect(new Set(prefixes).size, side).toBe(prefixes.length);
    }
  });

  it('κοινά φύλλα: ίδια ομάδα TRDGROUP, διαφορετικός κλάδος ανά πλευρά', () => {
    expect(classPath('customer', 'SH_MEP').map((n) => n.key)).toEqual(['C1_DOMESTIC', 'C2_CONSTRUCTION', 'SH_MEP']);
    expect(classPath('supplier', 'SH_MEP').map((n) => n.key)).toEqual(['S1_DOMESTIC', 'S2_SUBCONTRACTORS', 'SH_MEP']);
    expect(() => classPath('supplier', 'C3_HOTELS')).toThrow();
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

describe('leafForKad — πελάτες', () => {
  it('κατασκευές, μελετητές, τουρισμός, ακίνητα', () => {
    expect(c('41.00.10.01')).toBe('SH_BUILDING');
    expect(c('43.21.10.01')).toBe('SH_MEP');
    expect(c('43.33')).toBe('SH_FINISHING');
    expect(c('71.11.10.00')).toBe('SH_ARCHITECTS');
    expect(c('71.12')).toBe('SH_ENGINEERS');
    expect(c('74.13')).toBe('SH_INTERIOR');
    expect(c('55.10.10.01')).toBe('C3_HOTELS');
    expect(c('55.20.19.00')).toBe('C3_SHORTSTAY');
    expect(c('56.30.10.01')).toBe('C3_BARS');
    expect(c('59.14.00.01')).toBe('C3_VENUES');
    expect(c('68.12')).toBe('C3_DEVELOPERS');
    expect(c('68.20.11.00')).toBe('C3_PROPERTY');
  });

  it('κανόνας περιγραφής πριν από το πρόθεμα', () => {
    expect(c('70.20.30.01', 'ΥΠΗΡΕΣΙΕΣ ΔΙΑΚΟΣΜΗΤΗ ΚΑΤΑΣΤΗΜΑΤΩΝ')).toBe('SH_INTERIOR');
    expect(c('70.20.10.00', 'ΥΠΗΡΕΣΙΕΣ ΠΑΡΟΧΗΣ ΣΥΜΒΟΥΛΩΝ')).toBe('SH_PROFESSIONAL');
    expect(c('93.29.11.03', 'ΥΠΗΡΕΣΙΕΣ ΕΚΜΕΤΑΛΛΕΥΣΗΣ ΚΤΗΜΑΤΟΣ, ΓΙΑ ΔΙΕΝΕΡΓΕΙΑ ΕΚΔΗΛΩΣΕΩΝ')).toBe('C3_VENUES');
  });

  it('εμπόριο υλικών ξεχωρίζει· NACE 2.1 46.73 = μοτοσυκλέτες', () => {
    expect(c('46830000')).toBe('C3_MAT_WHOLESALE');
    expect(c('47.52.10.01')).toBe('C3_MAT_RETAIL');
    expect(c('46.73')).toBe('SH_TRADE');
  });

  it('κενό/άκυρο ⇒ null', () => {
    expect(leafForKad('customer', '')).toBeNull();
    expect(leafForKad('customer', '4')).toBeNull();
  });
});

describe('leafForKad — προμηθευτές', () => {
  it('υλικά κατά ΚΑΔ παραγωγής/εμπορίου', () => {
    expect(s('23.70.11.01')).toBe('S3_STONE');
    expect(s('08.11')).toBe('S3_STONE');
    expect(s('23.31')).toBe('S3_TILES');
    expect(s('16.22')).toBe('S3_WOOD');
    expect(s('20.30')).toBe('S3_MORTARS');
    expect(s('46.83.11.01')).toBe('S3_BUILDMAT');
    expect(s('31.09')).toBe('S3_FURNITURE');
    expect(s('27.40')).toBe('S3_LIGHTING');
  });

  it('περιγραφή μπροστά: χονδρικό μαρμάρων στο 46.83 → πέτρα', () => {
    expect(s('46.83.12.07', 'ΧΟΝΔΡΙΚΟ ΕΜΠΟΡΙΟ ΜΑΡΜΑΡΩΝ')).toBe('S3_STONE');
    expect(s('46.83.12.08', 'ΧΟΝΔΡΙΚΟ ΕΜΠΟΡΙΟ ΠΛΑΚΑΚΙΩΝ')).toBe('S3_TILES');
  });

  it('υπεργολάβοι, μεταφορές, λειτουργικά', () => {
    expect(s('43.32')).toBe('SH_FINISHING');
    expect(s('25.11')).toBe('S3_METAL');
    expect(s('49.41')).toBe('S3_TRANSPORT');
    expect(s('35.14')).toBe('S3_UTILITIES');
    expect(s('61.10')).toBe('S3_UTILITIES');
    expect(s('69.20')).toBe('SH_PROFESSIONAL');
    expect(s('77.32')).toBe('S3_RENTALS');
    expect(s('62.01')).toBe('SH_CREATIVE');
    expect(s('82.99')).toBe('S3_OTHER_SERVICES');
  });
});

describe('leafFromPurchases', () => {
  it('σταθμισμένη ψηφοφορία· τα γενικά είδη δεν ψηφίζουν', () => {
    expect(leafFromPurchases([
      { name: 'ZELLIGE 10X10X1.2 NATURAL', value: 600 },
      { name: 'Roman Opus Beige πέτρινο δάπεδο', value: 300 },
      { name: 'ΥΠΗΡΕΣΙΕΣ', value: 100 },
    ])).toEqual({ key: 'S3_TILES', share: 0.6 });
    expect(leafFromPurchases([{ name: 'ΥΠΗΡΕΣΙΕΣ', value: 10 }])).toBeNull();
    expect(leafFromPurchases([])).toBeNull();
  });
});

describe('kadDigits', () => {
  it('ψηφία χωρίς ουρά μηδενικών', () => expect(kadDigits('46.83.00.00')).toBe('4683'));
});

describe('classifyTrader', () => {
  it('πελάτης με ΚΑΔ ⇒ πλήρης διαδρομή', () => {
    expect(classifyTrader({ side: 'customer', afmKind: 'greek', aadeFound: true, primaryKad: '55.10.10.01' })).toEqual({
      leaf: 'C3_HOTELS', path: ['C1_DOMESTIC', 'C2_HOSPITALITY', 'C3_HOTELS'], basis: 'kad', rule: '551', review: false,
    });
  });

  it('ΝΠΔΔ ⇒ Δημόσιο πριν από τον ΚΑΔ, και στις δύο πλευρές', () => {
    expect(classifyTrader({ side: 'customer', afmKind: 'greek', legalForm: 'Ν.Π.Δ.Δ.', primaryKad: '85.31' }).leaf).toBe('SH_PUBLIC');
    expect(classifyTrader({ side: 'supplier', afmKind: 'greek', legalForm: 'ΝΠΔΔ' }).path).toEqual(['S1_DOMESTIC', 'S2_PUBLIC', 'SH_PUBLIC']);
  });

  it('ξένος πελάτης ⇒ ΕΕ/τρίτες κατά χώρα', () => {
    expect(classifyTrader({ side: 'customer', afmKind: 'foreign', countryIso: 'CY' }).path).toEqual(['C1_EU', 'C2_FOREIGN', 'C3_FOREIGN']);
    expect(classifyTrader({ side: 'customer', afmKind: 'foreign', countryIso: 'US' }).path[0]).toBe('C1_THIRD');
  });

  it('ξένος προμηθευτής ⇒ κλάδος από τις αγορές, επίπεδο 1 από τη χώρα', () => {
    const r = classifyTrader({
      side: 'supplier', afmKind: 'foreign', countryIso: 'IT',
      purchases: [{ name: 'DOLCI ARGILLA FINE BIANCO (25kg)', value: 23100 }, { name: 'SAHARA DECOR 15kg', value: 1000 }],
    });
    expect(r).toMatchObject({ leaf: 'S3_MORTARS', path: ['S1_EU', 'S2_MATERIALS', 'S3_MORTARS'], basis: 'purchases', review: false });
    expect(classifyTrader({ side: 'supplier', afmKind: 'foreign', countryIso: 'CN', purchases: [{ name: 'LAMP X', value: 1 }] }).path[0]).toBe('S1_THIRD');
  });

  it('προμηθευτής: ΚΑΔ πρώτα, μετά αγορές· χωρίς τίποτα ⇒ για έλεγχο', () => {
    expect(classifyTrader({ side: 'supplier', afmKind: 'greek', aadeFound: true, primaryKad: '43.33', purchases: [{ name: 'ZELLIGE', value: 9 }] }).leaf).toBe('SH_FINISHING');
    expect(classifyTrader({ side: 'supplier', afmKind: 'greek', aadeFound: true })).toMatchObject({ leaf: 'SH_REVIEW', review: true });
    expect(classifyTrader({ side: 'supplier', afmKind: 'none' })).toMatchObject({ leaf: 'SH_REVIEW', basis: 'no_afm' });
  });

  it('γενικός ΚΑΔ + ξεκάθαρες αγορές ⇒ οι αγορές· ειδικός ΚΑΔ ⇒ ο ΚΑΔ', () => {
    const stone = [{ name: 'OLD WORLD Πέτρινο Δάπεδο', value: 900 }, { name: 'ΑΝΑΛΩΣΙΜΑ', value: 100 }];
    expect(classifyTrader({ side: 'supplier', afmKind: 'greek', aadeFound: true, primaryKad: '46.83.06.00', purchases: stone }))
      .toMatchObject({ leaf: 'S3_STONE', basis: 'purchases', review: false });
    expect(classifyTrader({ side: 'supplier', afmKind: 'greek', aadeFound: true, primaryKad: '47.52.02.00', primaryKadDescr: 'ΛΙΑΝΙΚΗ ΠΩΛΗΣΗ ΧΡΩΜΑΤΩΝ', purchases: stone }))
      .toMatchObject({ leaf: 'S3_MORTARS', basis: 'kad' });
  });

  it('εργαλεία/μηχανήματα και καλώδια', () => {
    expect(s('46.62')).toBe('S3_TOOLS');
    expect(s('46.64.06.53', 'ΧΟΝΔΡΙΚΟ ΕΜΠΟΡΙΟ ΜΟΝΩΜΕΝΩΝ ΣΥΡΜΑΤΩΝ ΚΑΙ ΚΑΛΩΔΙΩΝ')).toBe('S3_LIGHTING');
  });

  it('χαμηλό μερίδιο αγορών ⇒ για έλεγχο', () => {
    const r = classifyTrader({ side: 'supplier', afmKind: 'foreign', countryIso: 'ES', purchases: [{ name: 'ZELLIGE', value: 30 }, { name: 'ΥΠΗΡΕΣΙΕΣ', value: 70 }] });
    expect(r).toMatchObject({ leaf: 'S3_TILES', review: true });
  });

  it('ιδιώτες πελάτες: χωρίς ΑΦΜ, μη/πρώην επιτηδευματίες, άγνωστο ΑΦΜ (για έλεγχο)', () => {
    expect(classifyTrader({ side: 'customer', afmKind: 'none' })).toMatchObject({ leaf: 'C3_PRIVATE', basis: 'no_afm', review: false });
    expect(classifyTrader({ side: 'customer', afmKind: 'none' }).path[0]).toBe('C1_RETAIL');
    expect(classifyTrader({ side: 'customer', afmKind: 'greek', aadeFound: true, firmFlag: 'ΠΡΩΗΝ ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ' }))
      .toMatchObject({ leaf: 'C3_PRIVATE', basis: 'former_business' });
    expect(classifyTrader({ side: 'customer', afmKind: 'greek', aadeFound: false })).toMatchObject({ leaf: 'C3_PRIVATE', review: true });
    expect(classifyTrader({ side: 'customer', afmKind: 'greek', aadeFound: true, firmFlag: 'ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ' }))
      .toMatchObject({ leaf: 'SH_REVIEW', review: true });
    expect(classifyTrader({ side: 'customer', afmKind: 'greek' })).toMatchObject({ leaf: 'SH_REVIEW', basis: 'unverified' });
  });
});
