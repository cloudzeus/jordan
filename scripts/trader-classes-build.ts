import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { softoneGetTable } from '@/lib/softone';
import { textOf } from '@/lib/aade-parse';
import { CLASS_TREE, SODTYPE, classifyTrader, treeFor, type Side } from '@/lib/trader-classes';
import type { CollectedCustomer } from './customer-kad-collect';

// Κατηγορίες συναλλασσομένων: ιεραρχία → βάση, αυτόματη ανάθεση (πελάτες + προμηθευτές) → βάση,
// και JSON αναφοράς. ΔΕΝ γράφει στο SoftOne (μόνο ανάγνωση χωρών).
//
// Είσοδος (από τα scripts συλλογής, στο .next/cache):
//   customer-kad.json, supplier-kad.json (customer-kad-collect.ts [--suppliers])
//   supplier-purchases.json (supplier-purchases-collect.ts), aade-afm2info.json (cache ΑΑΔΕ)
//
//   npx tsx --import ./scripts/templates/register.mjs scripts/trader-classes-build.ts [--write-db]

const WRITE_DB = process.argv.includes('--write-db');
const dir = path.join(process.cwd(), '.next', 'cache');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const FIELD = { 1: 'TRDCATEGORY', 2: 'TRDBUSINESS', 3: 'TRDGROUP' } as const;

const dotted = (digits: string) => {
  const d = digits.padEnd(8, '0');
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
};

// Τίτλοι ιεραρχίας ΚΑΔ (NACE 2.1) για την αναφορά.
const kadTitles = new Map<string, string>();
const walk = (n: any) => {
  if (n.code && n.title) kadTitles.set(String(n.code), n.title);
  for (const k of ['branches', 'groups', 'classes', 'categories', 'subcategories', 'national_activities']) for (const c of n[k] ?? []) walk(c);
};
JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'kad2025.json'), 'utf8')).sectors.forEach(walk);
const kadLevels = (digits: string) => {
  const d = digits.padEnd(8, '0');
  const div = d.slice(0, 2), grp = `${div}.${d[2]}`, cls = `${div}.${d.slice(2, 4)}`;
  return { division: div, divisionTitle: kadTitles.get(div) ?? '', group: grp, groupTitle: kadTitles.get(grp) ?? '', class: cls, classTitle: kadTitles.get(cls) ?? '' };
};

async function seedTree() {
  const ids = new Map<string, number>(); // `${key}|${sodtype}` → id
  for (const side of ['customer', 'supplier'] as Side[]) {
    const sodtype = SODTYPE[side];
    const nodes = treeFor(side).sort((a, b) => a.level - b.level);
    for (const [i, n] of nodes.entries()) {
      const parentKey = n.parent[side];
      const parentId = parentKey ? ids.get(`${parentKey}|${sodtype}`) ?? null : null;
      const data = {
        level: n.level, code: n.code, name: n.name, description: n.description ?? null, parentId,
        softoneField: FIELD[n.level], kadPrefixes: n.kad?.[side] ?? [], order: i, isActive: true,
      };
      const row = await prisma.traderClass.upsert({
        where: { key_sodtype: { key: n.key, sodtype } },
        // Το softoneId των επιπέδων 2–3 το γράφει ΜΟΝΟ η δημιουργία στο SoftOne — εδώ δεν το αγγίζουμε.
        update: { ...data, ...(n.level === 1 ? { softoneId: n.softoneId } : {}) },
        create: { key: n.key, sodtype, ...data, softoneId: n.level === 1 ? n.softoneId : null },
      });
      ids.set(`${n.key}|${sodtype}`, row.id);
    }
  }
  const keep = CLASS_TREE.flatMap((n) => n.sides.map((s) => `${n.key}|${SODTYPE[s]}`));
  const all = await prisma.traderClass.findMany({ select: { id: true, key: true, sodtype: true } });
  const gone = all.filter((r) => !keep.includes(`${r.key}|${r.sodtype}`)).map((r) => r.id);
  if (gone.length) await prisma.traderClass.updateMany({ where: { id: { in: gone } }, data: { isActive: false } });
  return ids;
}

(async () => {
  const aade = read('aade-afm2info.json') as Record<string, { at: string; raw?: any }>;
  const purchases = read('supplier-purchases.json').suppliers as Record<string, { docs: number; value: number; items: { name: string; value: number }[]; categories: unknown }>;
  const countries = new Map((await softoneGetTable('COUNTRY', ['COUNTRY', 'NAME', 'INTERCODE'], '')).map((c) => [c.COUNTRY, c]));

  const ids = WRITE_DB ? await seedTree() : null;
  const out: Record<Side, any[]> = { customer: [], supplier: [] };

  for (const side of ['customer', 'supplier'] as Side[]) {
    const file = side === 'customer' ? 'customer-kad.json' : 'supplier-kad.json';
    const list = read(file).customers as CollectedCustomer[];
    for (const t of list) {
      const digits = t.afm?.replace(/\D/g, '') ?? '';
      const b = aade[digits]?.raw?.basic_rec;
      const primary = t.aade?.activities.find((a) => a.kind === '1') ?? null;
      const country = t.country ? countries.get(t.country) : undefined;
      const p = side === 'supplier' ? purchases[String(t.trdr)] : undefined;
      const firmFlag = b ? textOf(b.firm_flag_descr) : null;
      const r = classifyTrader({
        side,
        afmKind: t.afmKind,
        countryIso: t.afmKind === 'foreign' ? country?.INTERCODE ?? null : null,
        aadeFound: t.afmKind === 'greek' ? (t.aade ? true : t.aadeError === 'not_found' ? false : undefined) : undefined,
        legalForm: t.aade?.legalForm,
        firmFlag,
        primaryKad: primary?.code ?? null,
        primaryKadDescr: primary?.descr ?? null,
        purchases: p?.items,
      });
      const row = {
        trdr: t.trdr, code: t.code, name: t.name, afm: t.afm, afmKind: t.afmKind,
        country: country?.NAME ?? null, countryIso: country?.INTERCODE ?? null, isActive: t.isActive,
        aadeName: t.aade?.name ?? null, aadeError: t.aadeError, legalForm: t.aade?.legalForm ?? null, firmFlag,
        city: t.aade?.city ?? null,
        primaryKad: primary ? { code: dotted(primary.code), descr: primary.descr, ...kadLevels(primary.code) } : null,
        activities: t.aade?.activities.length ?? 0,
        trdCategory: t.trdCategory,
        purchases: p ? { docs: p.docs, value: p.value, items: p.items.slice(0, 5) } : null,
        ...r,
      };
      out[side].push(row);

      if (WRITE_DB) {
        const existing = await prisma.traderClassAssignment.findUnique({ where: { trdr: t.trdr }, select: { status: true } });
        const data = {
          sodtype: SODTYPE[side], code: t.code, name: t.name, afm: t.afm, afmKind: t.afmKind, countryIso: row.countryIso,
          aadeName: row.aadeName, aadeCheckedAt: aade[digits]?.at ? new Date(aade[digits].at) : null,
          primaryKad: row.primaryKad?.code ?? null, primaryKadDescr: row.primaryKad?.descr ?? null,
          activities: t.aade?.activities ?? undefined, purchasesHint: row.purchases ?? undefined,
          leafId: ids!.get(`${r.leaf}|${SODTYPE[side]}`) ?? null, pathKeys: r.path,
          basis: r.basis, rule: r.rule, needsReview: r.review,
        };
        if (!existing) await prisma.traderClassAssignment.create({ data: { trdr: t.trdr, ...data } });
        // Εγκεκριμένη/εφαρμοσμένη ανάθεση δεν ξαναγράφεται — ανανεώνονται μόνο τα στοιχεία ΑΑΔΕ.
        else if (existing.status === 'PROPOSED') await prisma.traderClassAssignment.update({ where: { trdr: t.trdr }, data });
        else await prisma.traderClassAssignment.update({
          where: { trdr: t.trdr },
          data: { aadeName: data.aadeName, aadeCheckedAt: data.aadeCheckedAt, primaryKad: data.primaryKad, primaryKadDescr: data.primaryKadDescr, activities: data.activities },
        });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    tree: CLASS_TREE,
    customers: out.customer,
    suppliers: out.supplier,
  };
  const OUT = path.join(dir, 'trader-classes-report.json');
  fs.writeFileSync(OUT, JSON.stringify(report));
  for (const side of ['customer', 'supplier'] as Side[]) {
    const m: Record<string, number> = {};
    for (const r of out[side]) m[r.path.join(' › ')] = (m[r.path.join(' › ')] ?? 0) + 1;
    console.log(`\n${side}: ${out[side].length} · για έλεγχο ${out[side].filter((r) => r.review).length}`);
    console.table(Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ path: k, n: v })));
  }
  console.log(`→ ${OUT}${WRITE_DB ? ' · βάση ενημερώθηκε' : ' · (χωρίς --write-db: η βάση δεν άλλαξε)'}`);
  process.exit(0);
})();
