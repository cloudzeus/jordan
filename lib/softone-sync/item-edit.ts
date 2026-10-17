// lib/softone-sync/item-edit.ts — SERVER. Πλήρης επεξεργασία ΥΠΑΡΧΟΝΤΟΣ είδους/υπηρεσίας στο SoftOne.
//
// Κανόνες (ίδιοι με το item-maintenance):
//  • Object από τον ΖΩΝΤΑΝΟ τύπο: SODTYPE 51 → ITEM, 52 → SERVICE. Ο τύπος δεν αλλάζει με setData.
//  • Στέλνονται ΜΟΝΟ τα πεδία που άλλαξαν σε σχέση με τη ζωντανή καρτέλα — ποτέ ολόκληρη η εγγραφή.
//  • Μετά την εγγραφή ξαναδιαβάζεται η καρτέλα: το `success:true` του SoftOne ΔΕΝ σημαίνει ότι
//    αποθηκεύτηκε (πεδία που το object δεν δέχεται αγνοούνται σιωπηλά). Κάθε πεδίο που δεν
//    «έπιασε» αναφέρεται ονομαστικά.
//  • Οι τιμές λιστών (κατηγορία, ομάδα, μονάδα, ΦΠΑ…) ελέγχονται απέναντι στα τοπικά μητρώα πριν
//    φύγουν — ένα άγνωστο id στο SoftOne γράφεται ως 0/κενό χωρίς σφάλμα.
//  • Η αλλαγή ΚΩΔΙΚΟΥ περνά από το `changeSoftoneItem` (μάσκα εγκατάστασης + μοναδικότητα σε όλο το MTRL).
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { softoneCall, softoneGetTable } from '@/lib/softone';
import { changeSoftoneItem, ItemMaintenanceError } from './item-maintenance';
import { checkUnitSetup, UNIT_FIELDS, type UnitSetup } from '@/lib/item-unit-setup';

// `flag`: σημαία που το SoftOne αφήνει ΚΕΝΗ όταν δεν έχει οριστεί (π.χ. MU12MODE) — αληθής μόνο το «1».
type FieldKind = 'text' | 'lookup' | 'number' | 'bool' | 'flag' | 'vat';

/** Πεδίο φόρμας → στήλη MTRL. `itemOnly`: το object SERVICE δεν το έχει (μία μονάδα, χωρίς MU). */
export const ITEM_FIELDS = {
  name: { col: 'NAME', kind: 'text', max: 128, label: 'Περιγραφή' },
  name2: { col: 'NAME1', kind: 'text', max: 128, label: 'Περιγραφή 2' },
  code1: { col: 'CODE1', kind: 'text', max: 50, label: 'Barcode / EAN' },
  code2: { col: 'CODE2', kind: 'text', max: 50, label: 'Κωδ. εργοστασίου' },
  remarks: { col: 'REMARKS', kind: 'text', max: 2000, label: 'Παρατηρήσεις' },
  isActive: { col: 'ISACTIVE', kind: 'bool', label: 'Ενεργό' },
  vat: { col: 'VAT', kind: 'vat', label: 'Κατηγορία ΦΠΑ' },
  category: { col: 'MTRCATEGORY', kind: 'lookup', lookup: 'MTRCATEGORY', label: 'Εμπορική κατηγορία' },
  group: { col: 'MTRGROUP', kind: 'lookup', lookup: 'MTRGROUP', label: 'Ομάδα' },
  manufacturer: { col: 'MTRMANFCTR', kind: 'lookup', lookup: 'MTRMANFCTR', label: 'Κατασκευαστής' },
  brand: { col: 'MTRMARK', kind: 'lookup', lookup: 'MTRMARK', label: 'Μάρκα' },
  unit1: { col: 'MTRUNIT1', kind: 'lookup', lookup: 'MTRUNIT', label: 'Βασική μονάδα' },
  // Κάθε «σχέση» = πόσες ΒΑΣΙΚΕΣ σε 1 από αυτή τη μονάδα (βλ. lib/item-unit-setup.ts).
  unit2: { col: 'MTRUNIT2', kind: 'lookup', lookup: 'MTRUNIT', label: 'Μ.Μ.2', itemOnly: true },
  ratio2: { col: 'MU21', kind: 'number', label: 'Σχέση Μ.Μ.2 προς βασική', itemOnly: true },
  strict2: { col: 'MU12MODE', kind: 'flag', label: 'Αυστηρή σχέση Μ.Μ.2', itemOnly: true },
  unitBuy: { col: 'MTRUNIT3', kind: 'lookup', lookup: 'MTRUNIT', label: 'Μονάδα αγορών', itemOnly: true },
  buyRatio: { col: 'MU31', kind: 'number', label: 'Σχέση αγορών προς βασική', itemOnly: true },
  buyStrict: { col: 'MU13MODE', kind: 'flag', label: 'Αυστηρή σχέση αγορών', itemOnly: true },
  unitSell: { col: 'MTRUNIT4', kind: 'lookup', lookup: 'MTRUNIT', label: 'Μονάδα πώλησης', itemOnly: true },
  sellRatio: { col: 'MU41', kind: 'number', label: 'Σχέση πώλησης προς βασική', itemOnly: true },
  sellStrict: { col: 'MU14MODE', kind: 'flag', label: 'Αυστηρή σχέση πώλησης', itemOnly: true },
  priceRetail: { col: 'PRICER', kind: 'number', label: 'Τιμή λιανικής' },
  priceWholesale: { col: 'PRICEW', kind: 'number', label: 'Τιμή χονδρικής' },
  // Κλιμάκια χονδρικής (κοινό container: τιμή ανά γέμισμα σε παλέτες) — PRICEW01…05.
  priceW01: { col: 'PRICEW01', kind: 'number', label: 'Χονδρική 1' },
  priceW02: { col: 'PRICEW02', kind: 'number', label: 'Χονδρική 2' },
  priceW03: { col: 'PRICEW03', kind: 'number', label: 'Χονδρική 3' },
  priceW04: { col: 'PRICEW04', kind: 'number', label: 'Χονδρική 4' },
  priceW05: { col: 'PRICEW05', kind: 'number', label: 'Χονδρική 5' },
  weight: { col: 'WEIGHT', kind: 'number', label: 'Καθαρό βάρος', itemOnly: true },
  grossWeight: { col: 'GWEIGHT', kind: 'number', label: 'Μικτό βάρος', itemOnly: true },
  volume: { col: 'VOLUME', kind: 'number', label: 'Όγκος', itemOnly: true },
  dim1: { col: 'DIM1', kind: 'number', label: 'Μήκος (Διάσταση 1)', itemOnly: true },
  dim2: { col: 'DIM2', kind: 'number', label: 'Πλάτος (Διάσταση 2)', itemOnly: true },
  dim3: { col: 'DIM3', kind: 'number', label: 'Ύψος (Διάσταση 3)', itemOnly: true },
} as const satisfies Record<string, { col: string; kind: FieldKind; label: string; max?: number; lookup?: string; itemOnly?: boolean }>;

export type ItemFieldKey = keyof typeof ITEM_FIELDS;
const KEYS = Object.keys(ITEM_FIELDS) as ItemFieldKey[];
const COLS = ['MTRL', 'CODE', 'SODTYPE', ...KEYS.map((k) => ITEM_FIELDS[k].col)];

export type ItemRecord = {
  mtrl: number;
  code: string;
  isService: boolean;
  object: 'ITEM' | 'SERVICE';
} & { [K in ItemFieldKey]: (typeof ITEM_FIELDS)[K]['kind'] extends 'number' ? number : (typeof ITEM_FIELDS)[K]['kind'] extends 'bool' | 'flag' ? boolean : string | null };

export const itemEditInput = z.object({
  code: z.string().trim().min(1).max(50).optional(),
  name: z.string().trim().min(1, 'Η περιγραφή είναι υποχρεωτική').max(128).optional(),
  name2: z.string().trim().max(128).nullable().optional(),
  code1: z.string().trim().max(50).nullable().optional(),
  code2: z.string().trim().max(50).nullable().optional(),
  remarks: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  vat: z.string().trim().max(20).nullable().optional(),
  category: z.string().trim().max(20).nullable().optional(),
  group: z.string().trim().max(20).nullable().optional(),
  manufacturer: z.string().trim().max(20).nullable().optional(),
  brand: z.string().trim().max(20).nullable().optional(),
  unit1: z.string().trim().max(20).nullable().optional(),
  unit2: z.string().trim().max(20).nullable().optional(),
  ratio2: z.number().min(0).max(1e6).optional(),
  strict2: z.boolean().optional(),
  buyStrict: z.boolean().optional(),
  sellStrict: z.boolean().optional(),
  unitBuy: z.string().trim().max(20).nullable().optional(),
  buyRatio: z.number().positive('Η σχέση μονάδων πρέπει να είναι > 0').max(1e6).optional(),
  unitSell: z.string().trim().max(20).nullable().optional(),
  sellRatio: z.number().positive('Η σχέση μονάδων πρέπει να είναι > 0').max(1e6).optional(),
  priceRetail: z.number().min(0).max(1e9).optional(),
  priceWholesale: z.number().min(0).max(1e9).optional(),
  priceW01: z.number().min(0).max(1e9).optional(),
  priceW02: z.number().min(0).max(1e9).optional(),
  priceW03: z.number().min(0).max(1e9).optional(),
  priceW04: z.number().min(0).max(1e9).optional(),
  priceW05: z.number().min(0).max(1e9).optional(),
  weight: z.number().min(0).max(1e9).optional(),
  grossWeight: z.number().min(0).max(1e9).optional(),
  volume: z.number().min(0).max(1e9).optional(),
  dim1: z.number().min(0).max(1e9).optional(),
  dim2: z.number().min(0).max(1e9).optional(),
  dim3: z.number().min(0).max(1e9).optional(),
});
export type ItemEditInput = z.infer<typeof itemEditInput>;

const num = (v: string | undefined) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const idOrNull = (v: string | undefined) => { const s = String(v ?? '').trim(); return s && s !== '0' ? s : null; };
const textOrNull = (v: string | undefined) => { const s = String(v ?? '').trim(); return s || null; };

function toRecord(r: Record<string, string>): ItemRecord {
  const isService = r.SODTYPE === '52';
  const rec: Record<string, unknown> = { mtrl: Number(r.MTRL), code: r.CODE, isService, object: isService ? 'SERVICE' : 'ITEM' };
  for (const k of KEYS) {
    const f = ITEM_FIELDS[k];
    const raw = r[f.col];
    rec[k] = f.kind === 'number' ? num(raw) : f.kind === 'bool' ? raw !== '0' : f.kind === 'flag' ? raw === '1' : f.kind === 'text' ? textOrNull(raw) : idOrNull(raw);
  }
  return rec as ItemRecord;
}

/** Η ζωντανή καρτέλα του είδους από το SoftOne. */
export async function readSoftoneItem(mtrl: number): Promise<ItemRecord> {
  const [row] = await softoneGetTable('MTRL', COLS, `MTRL=${mtrl}`);
  if (!row) throw new ItemMaintenanceError('not_found', `Το είδος ${mtrl} δεν βρέθηκε στο SoftOne.`, 404);
  if (row.SODTYPE !== '51' && row.SODTYPE !== '52') {
    throw new ItemMaintenanceError('unsupported_type', `Η εγγραφή ${mtrl} δεν είναι είδος ή υπηρεσία (SODTYPE ${row.SODTYPE}).`);
  }
  return toRecord(row);
}

const same = (a: unknown, b: unknown) => {
  if (typeof a === 'number' || typeof b === 'number') return Math.abs(Number(a) - Number(b)) < 1e-9;
  return (a ?? null) === (b ?? null);
};

export type ItemEditResult = {
  mtrl: number;
  object: 'ITEM' | 'SERVICE';
  changed: { field: ItemFieldKey | 'code'; label: string; before: unknown; after: unknown }[];
  record: ItemRecord;
};

export async function editSoftoneItem(mtrl: number, input: ItemEditInput): Promise<ItemEditResult> {
  const before = await readSoftoneItem(mtrl);

  // Τιμές λιστών: πρέπει να υπάρχουν στα τοπικά μητρώα (αλλιώς το SoftOne γράφει σιωπηλά κενό).
  const lookups = await prisma.softoneLookup.findMany({ select: { kind: true, code: true } });
  const vats = await prisma.vatCategory.findMany({ select: { code: true } });
  const known = new Set(lookups.map((l) => `${l.kind}:${l.code}`));
  // Κατηγορία/ομάδα: αριθμούνται ΑΝΑ SODTYPE — δεκτές μόνο οι ενεργές του ίδιου μητρώου (είδη ή υπηρεσίες).
  const classes = await prisma.softoneClassification.findMany({
    where: { sodtype: before.isService ? 52 : 51, isActive: true }, select: { kind: true, code: true },
  });
  if (classes.length) {
    for (const k of [...known]) if (k.startsWith('MTRCATEGORY:') || k.startsWith('MTRGROUP:')) known.delete(k);
    for (const c of classes) known.add(`${c.kind === 'CATEGORY' ? 'MTRCATEGORY' : 'MTRGROUP'}:${c.code}`);
  }
  const knownVat = new Set([...vats.map((v) => v.code), ...lookups.filter((l) => l.kind === 'VAT').map((l) => l.code)]);

  const patch: Record<string, string | number> = {};
  const changed: ItemEditResult['changed'] = [];
  for (const k of KEYS) {
    if (!(k in input)) continue;
    const f = ITEM_FIELDS[k] as { col: string; kind: FieldKind; label: string; lookup?: string; itemOnly?: boolean };
    const next = (input as Record<string, unknown>)[k] ?? null;
    if (f.itemOnly && before.isService) continue; // το SERVICE δεν έχει αυτά τα πεδία
    if (same(before[k], next)) continue;
    if (f.kind === 'lookup' && next != null && !known.has(`${f.lookup}:${next}`)) {
      throw new ItemMaintenanceError('unknown_value', `Άγνωστη τιμή για «${f.label}». Κάνε συγχρονισμό βοηθητικών πινάκων και ξαναδοκίμασε.`);
    }
    if (f.kind === 'vat' && next != null && !knownVat.has(String(next))) {
      throw new ItemMaintenanceError('unknown_value', 'Άγνωστη κατηγορία ΦΠΑ. Κάνε συγχρονισμό ΦΠΑ και ξαναδοκίμασε.');
    }
    if (k === 'unit1' && next == null) throw new ItemMaintenanceError('unit_required', 'Η βασική μονάδα είναι υποχρεωτική.');
    if (k === 'vat' && next == null) throw new ItemMaintenanceError('vat_required', 'Η κατηγορία ΦΠΑ είναι υποχρεωτική.');
    patch[f.col] = f.kind === 'bool' || f.kind === 'flag' ? (next ? 1 : 0) : f.kind === 'number' ? Number(next) : (next == null ? '' : String(next));
    changed.push({ field: k, label: f.label, before: before[k], after: next });
  }

  // Μονάδες: ελέγχεται η ΤΕΛΙΚΗ ρύθμιση (ζωντανή + αλλαγές), μόνο όταν αλλάζει κάτι σε αυτές —
  // παλιές ρυθμίσεις που δεν αγγίζονται δεν μπλοκάρουν άλλες αλλαγές του είδους.
  const unitChanged = changed.some((c) => (UNIT_FIELDS as readonly string[]).includes(c.field));
  if (unitChanged && !before.isService) {
    const next = Object.fromEntries(UNIT_FIELDS.map((k) => [k, k in input ? (input as Record<string, unknown>)[k] ?? null : before[k]])) as UnitSetup;
    if (!next.unit2) {
      // Χωρίς Μ.Μ.2 δεν μένει «ορφανός» συντελεστής.
      if ('MU21' in patch || before.ratio2 !== 0) patch.MU21 = 0;
      if ('MU12MODE' in patch || before.strict2) patch.MU12MODE = 0;
      for (const c of changed) if (c.field === 'ratio2' || c.field === 'strict2') c.after = c.field === 'ratio2' ? 0 : false;
      next.ratio2 = 0; next.strict2 = false;
    }
    const errors = checkUnitSetup(next).filter((i) => i.level === 'error');
    if (errors.length) throw new ItemMaintenanceError('unit_setup', errors.map((e) => e.message).join(' '));
  }
  // Η βασική μονάδα δεν αλλάζει σε είδος με κινήσεις: η αποθήκη και το ιστορικό είναι ήδη σε αυτήν.
  if (changed.some((c) => c.field === 'unit1') && (await softoneGetTable('MTRLINES', ['MTRL'], `MTRL=${mtrl}`)).length > 0) {
    throw new ItemMaintenanceError(
      'base_unit_locked',
      'Η βασική μονάδα δεν αλλάζει: το είδος έχει ήδη κινήσεις και η αποθήκη του μετράει σε αυτήν. Άλλαξε τις μονάδες αγορών/πώλησης/Μ.Μ.2 ή φτιάξε νέο είδος.',
      409,
    );
  }

  const codeChange = input.code != null && input.code !== before.code;
  if (!codeChange && Object.keys(patch).length === 0) {
    return { mtrl, object: before.object, changed: [], record: before };
  }

  if (Object.keys(patch).length > 0) {
    const res = await softoneCall<{ success?: boolean; error?: string }>('setData', {
      OBJECT: before.object, KEY: String(mtrl), DATA: { [before.object]: [patch] },
    });
    if (res.success === false) throw new ItemMaintenanceError('softone_error', res.error ?? `setData ${before.object} ${mtrl} απέτυχε`, 502);
  }
  // Ο κωδικός ΜΕΤΑ τα υπόλοιπα: έχει δικό του έλεγχο μάσκας/μοναδικότητας και δική του επαλήθευση.
  if (codeChange) {
    await changeSoftoneItem(mtrl, { code: input.code! });
    changed.unshift({ field: 'code', label: 'Κωδικός', before: before.code, after: input.code });
  }

  const after = await readSoftoneItem(mtrl);
  if (after.isService !== before.isService) {
    throw new ItemMaintenanceError('unexpected_change', `ΠΡΟΣΟΧΗ: μετά την ενημέρωση άλλαξε ο τύπος της ${mtrl}. Έλεγξέ την στο SoftOne.`, 500);
  }
  const notSaved = changed.filter((c) => c.field !== 'code' && !same(after[c.field as ItemFieldKey], c.after));
  if (notSaved.length > 0) {
    throw new ItemMaintenanceError(
      'not_persisted',
      `Το SoftOne απάντησε επιτυχία αλλά ΔΕΝ αποθήκευσε: ${notSaved.map((c) => c.label).join(', ')}. Τα υπόλοιπα πεδία αποθηκεύτηκαν.`,
      502,
    );
  }

  // Καθρέφτης: ό,τι κρατά τοπικά το SoftoneItem.
  await prisma.softoneItem.updateMany({
    where: { mtrl },
    data: {
      code: after.code, name: after.name ?? '', name2: after.name2, code1: after.code1, code2: after.code2,
      price: after.priceRetail, isActive: after.isActive,
      unit1: after.unit1, unitBuy: after.isService ? undefined : after.unitBuy,
      buyRatio: after.isService ? undefined : after.buyRatio,
      unitSell: after.isService ? undefined : after.unitSell,
      sellRatio: after.isService ? undefined : after.sellRatio,
    },
  });

  return { mtrl, object: after.object, changed, record: after };
}
