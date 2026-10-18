import { describe, expect, it } from 'vitest';
import {
  ITEM_GROUPS, ITEM_GROUP_BY_KEY, ITEM_NAME_RULES, SERVICE_NAME_RULES, SUPPLIER_FALLBACK, isItemGroupLeaf, itemGroupParent, proposeItemGroup,
} from '@/lib/item-groups';

const g = (name: string) => proposeItemGroup({ name, kind: 'item' }).group;
const v = (name: string) => proposeItemGroup({ name, kind: 'service' }).group;

describe('δέντρο ομάδων', () => {
  it('όρια SoftOne και μοναδικότητα ανά τύπο (είδη / υπηρεσίες)', () => {
    for (const n of ITEM_GROUPS) {
      expect(n.code.length, n.key).toBeLessThanOrEqual(10);
      expect(n.name.length, n.key).toBeLessThanOrEqual(50);
    }
    for (const kind of ['item', 'service'] as const) {
      for (const f of ['code', 'soh', 'name'] as const) {
        const vals = ITEM_GROUPS.filter((n) => n.kind === kind).map((n) => n[f]);
        expect(new Set(vals).size, `${kind}.${f}`).toBe(vals.length);
      }
    }
  });
  it('κάθε υπο-ομάδα έχει γονέα· οι κανόνες δείχνουν μόνο σε φύλλα', () => {
    for (const n of ITEM_GROUPS) if (n.soh.includes('.')) expect(itemGroupParent(n), n.key).not.toBeNull();
    for (const [, key] of [...ITEM_NAME_RULES, ...SERVICE_NAME_RULES]) expect(isItemGroupLeaf(ITEM_GROUP_BY_KEY.get(key)!), key).toBe(true);
    for (const key of Object.values(SUPPLIER_FALLBACK)) expect(isItemGroupLeaf(ITEM_GROUP_BY_KEY.get(key)!), key).toBe(true);
  });
  it('ξαναχρησιμοποιεί τις υπάρχουσες «Πλακάκια» (2) και «Πέτρες» (3)', () => {
    expect(ITEM_GROUP_BY_KEY.get('G_TILES')?.reuse).toBe(2);
    expect(ITEM_GROUP_BY_KEY.get('G_STONE')?.reuse).toBe(3);
  });
});

describe('πρόταση από όνομα', () => {
  it('πλακάκια vs πέτρα — «ΠΛΑΚΑΚΙ ΣΑΝ ΠΕΤΡΑ» είναι πλακάκι', () => {
    expect(g('ZELLIGE DARK GREEN 10X10Χ1.2')).toBe('G_TILES');
    expect(g('ΠΛΑΚΑΚΙ ΣΑΝ ΠΕΤΡΑ-GRES PORCELLANATO-40Χ60')).toBe('G_TILES');
    expect(g('ΠΛΑΚΑΚΙ ΧΕΙΡΟΠ. COTTO 15x30x2cm')).toBe('G_TILES');
    expect(g('ΜΩΣΑΪΚΟ 60x60x2 εκ.')).toBe('G_TILES');
    expect(g('Roman Opus Beige πέτρινο δάπεδο')).toBe('G_STONE');
    expect(g('ΦΥΣΙΚΗ ΠΈΤΡΑ ROMAN OPUS BRIGHT')).toBe('G_STONE');
    expect(g('CIFRE CEPPO NUEVO WHITE')).toBe('G_TILES'); // Cifre = κεραμικά (όψη πέτρας)
    expect(g('Venice 40 x Free x 002 Tumbled')).toBe('G_STONE');
  });
  it('κόλλα πλακιδίων = χημικό· χρωστική ασβεστοχρώματος = ασβέστης', () => {
    expect(g('ΚΟΛΛΑ ΠΛΑΚΙΔΙΩΝ Η40')).toBe('G_CHEM');
    expect(g('GRANITIVA FLEX 25kg C2TE ΛΕΥΚΗ ΚΟΛΛΑ ΠΛΑΚΙΔΙΩΝ')).toBe('G_CHEM');
    expect(g('ROSSO ERCOLANO ΧΡΩΣΤΙΚΗ ΑΣΒΕΣΤΟΧΡΩΜΑΤΟΣ 1kg')).toBe('G_LIME');
    expect(g('Ασβεστόχρωμα Ιταλικής προέλευσης')).toBe('G_LIME');
  });
  it('τσιμεντοκονίες, χρώματα, αδρανή', () => {
    expect(g('Microdur Medium SLOW (20kgr) τσιμεντοκονία φινιρίσματος')).toBe('G_CEMENT');
    expect(g('T-Nebulosa (0407) - Microduo/dur/level - 100 g')).toBe('G_CEMENT');
    expect(g('PRIMEX A 300 10L ΑΣΤΑΡΙ ΝΕΡΟΥ')).toBe('G_PAINT');
    expect(g('NEODUR VARNISH PR 3KG')).toBe('G_PAINT');
    expect(g('Χαλαζιακή άμμος 0.2 - 0.8 mm')).toBe('G_AGGR');
  });
  it('νιπτήρες/έπιπλα πριν από πέτρα· μπαταρία νιπτήρα = υδραυλικό', () => {
    expect(g('ΝΙΠΤΗΡΑΣ TRAVERTINO ΙΡΙΔΑ')).toBe('G_SINKS');
    expect(g('ΠΑΓΚΟΣ ΜΕ ΝΙΠΤΗΡΑ ΑΠΟ ΣΚΥΡΟΔΕΜΑ')).toBe('G_SINKS');
    expect(g('ΜΠΑΤΑΡΙΑ ΝΙΠΤΗΡΟΣ ΤΟΙΧΟΥ TECH LA TORRE')).toBe('G_PLUMB');
    expect(g('SOFA ONLY FRAME')).toBe('G_FURN');
  });
  it('δομικά, εργαλεία, αναλώσιμα, χρεώσεις', () => {
    expect(g('ΣΙΔΕΡΑ ΜΠΕΤΟΥ')).toBe('G_BUILDMAT');
    expect(g('ΚΕΡΑΜΙΔΙΑ βυζαντινά')).toBe('G_BUILDMAT');
    expect(g('ΠΙΝΕΛΛΟ SERIES 100 1" ΜΠΛΕ')).toBe('G_TOOLS');
    expect(g('ΓΑΝΤΙΑ ΕΡΓΑΣΙΑΣ FERRELI LATEX')).toBe('G_CONSUM');
    expect(g('ΤΟΝΕΡ ΣΥΜΒΑΤΟ LEXMARK')).toBe('G_OFFICE');
    expect(g('Κόστος μεταφορικών')).toBe('G_CHARGE');
    expect(g('ΡΟΛΛΟ ΜΟΧΑΙΡ (Φ48) 18cm')).toBe('G_TOOLS'); // \b δεν δουλεύει με ελληνικά
    expect(g('ΞΥΛΙΝΟ ΔΑΠΕΔΟ LANUVIO')).toBe('G_WOODFLOOR');
    expect(g('ΣΠΙΡΑΛ ΜΠΑΤ.ΛΟΥΤΡΟΥ LATOR.CHROME')).toBe('G_PLUMB');
    expect(g('ΕΠΙΧΡΙΣΜΑ ΑΡΓΙΛΟΥ 20 kg')).toBe('G_LIME');
    expect(g('FILA FOB EXTREME 5lt')).toBe('G_CHEM');
    expect(g('ΒΥΖΑΝΤΙΝΟ ΤΡΑΒΕΡΤΙΝΟ ΓΑΙΑ ΑΝΤΙΚ 1.2cm')).toBe('G_STONE');
  });
  it('εργασίες σε κωδικό είδους — αλλά «προμήθεια και εφαρμογή» υλικού μένει υλικό', () => {
    expect(g('WORKS FOR CEILING')).toBe('G_CHARGE');
    expect(g('ΕΠΙΒΛΕΨΗ ΕΦΑΡΜΟΓΗΣ')).toBe('G_CHARGE');
    expect(g('Προμήθεια και εφαρμογή Τσιμεντοκονίας Medium')).toBe('G_CEMENT');
  });
  it('υπηρεσίες', () => {
    expect(v('Επίβλεψη εφαρμογής ασβεστοχρώματος')).toBe('V_APPLY');
    expect(v('Τοποθέτηση υλικών')).toBe('V_APPLY');
    expect(v('Μεταφορικά')).toBe('V_TRANSPORT');
    expect(v('ΣΥΝΘΕΣΗ ΔΕΙΓΜΑΤΟΣ ΣΤΟ ΧΩΡΟ ΜΑΣ')).toBe('V_SAMPLE');
    expect(v('Υπηρεσία')).toBe('V_OTHER');
  });
});

describe('εφεδρεία από προμηθευτή και ενδείξεις', () => {
  it('άγνωστο όνομα ⇒ ομάδα από τον προμηθευτή (σταθμισμένα), για έλεγχο', () => {
    expect(proposeItemGroup({ name: 'GRACIA VERDE 31', kind: 'item', suppliers: [{ leaf: 'S_TILES', value: 900 }, { leaf: 'S_PAINT', value: 100 }] }))
      .toMatchObject({ group: 'G_TILES', basis: 'supplier', review: true });
  });
  it('τίποτα ⇒ Λοιπά, για έλεγχο', () => {
    expect(proposeItemGroup({ name: 'INT 160 crema', kind: 'item' })).toMatchObject({ group: 'G_OTHER', basis: 'none', review: true });
  });
  it('είδος με όνομα υπηρεσίας: ένδειξη', () => {
    expect(proposeItemGroup({ name: 'ΕΠΙΒΛΕΨΗ ΕΦΑΡΜΟΓΗΣ', kind: 'item' }).looksLikeService).toBe(true);
    expect(proposeItemGroup({ name: 'Προμήθεια και εφαρμογή Τσιμεντοκονίας Fine', kind: 'item' }))
      .toMatchObject({ group: 'G_CEMENT', looksLikeService: true });
  });
});
