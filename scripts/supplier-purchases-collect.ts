import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { softoneGetTable, loadSoftoneConfig } from '@/lib/softone';

// Τι αγοράζουμε από κάθε προμηθευτή — ΜΟΝΟ ΑΝΑΓΝΩΣΗ. Βοηθά την κατηγοριοποίηση όσων ΔΕΝ έχουν
// ΚΑΔ ΑΑΔΕ (ξένοι προμηθευτές) και επιβεβαιώνει τους υπόλοιπους.
//   FINDOC (SOSOURCE 1251, όχι ακυρωμένα) → MTRLINES → MTRL (περιγραφή, MTRCATEGORY, MTRGROUP).
// Τα αναλυτικά εξόδων (EXPANAL) δεν διαβάζονται: εδώ μετρούν τα είδη/υπηρεσίες των γραμμών.
//
//   npx tsx --import ./scripts/templates/register.mjs scripts/supplier-purchases-collect.ts [out.json]

const OUT = process.argv[2] ?? path.join(process.cwd(), '.next', 'cache', 'supplier-purchases.json');
const CHUNK = 200;

async function inChunks<T>(ids: (string | number)[], fn: (chunk: string) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...await fn(ids.slice(i, i + CHUNK).join(',')));
  return out;
}

const num = (v: string) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const cleanLabel = (s: string) => (String(s ?? '').match(/el=([^|}]+)/)?.[1] ?? String(s ?? '')).trim();

(async () => {
  const cfg = await loadSoftoneConfig();
  const company = Number(cfg.company);
  const suppliers = await softoneGetTable('TRDR', ['TRDR'], `SODTYPE=12 AND COMPANY=${company}`);
  const trdrs = suppliers.map((s) => s.TRDR);

  const heads = await inChunks(trdrs, (c) => softoneGetTable(
    'FINDOC', ['FINDOC', 'TRDR', 'TRNDATE', 'ISCANCEL'], `SOSOURCE=1251 AND COMPANY=${company} AND TRDR IN (${c})`,
  ));
  const live = heads.filter((h) => h.ISCANCEL !== '1');
  const trdrOf = new Map(live.map((h) => [h.FINDOC, h.TRDR]));
  console.log(`παραστατικά αγορών: ${live.length}`);

  const lines = await inChunks([...trdrOf.keys()], (c) => softoneGetTable('MTRLINES', ['FINDOC', 'MTRL', 'LINEVAL'], `FINDOC IN (${c})`));
  const mtrls = [...new Set(lines.map((l) => l.MTRL).filter(Boolean))];
  const items = await inChunks(mtrls, (c) => softoneGetTable('MTRL', ['MTRL', 'NAME', 'SODTYPE', 'MTRCATEGORY', 'MTRGROUP'], `MTRL IN (${c})`));
  const itemBy = new Map(items.map((i) => [i.MTRL, i]));

  const [cats, groups] = await Promise.all([
    softoneGetTable('MTRCATEGORY', ['MTRCATEGORY', 'SODTYPE', 'NAME'], `COMPANY=${company}`).catch(() => []),
    softoneGetTable('MTRGROUP', ['MTRGROUP', 'SODTYPE', 'NAME'], `COMPANY=${company}`).catch(() => []),
  ]);
  const catName = new Map(cats.map((c) => [`${c.SODTYPE}:${c.MTRCATEGORY}`, cleanLabel(c.NAME)]));
  const grpName = new Map(groups.map((g) => [`${g.SODTYPE}:${g.MTRGROUP}`, cleanLabel(g.NAME)]));

  type Agg = { docs: Set<string>; value: number; byCategory: Record<string, number>; byGroup: Record<string, number>; items: Record<string, number> };
  const agg = new Map<string, Agg>();
  for (const l of lines) {
    const trdr = trdrOf.get(l.FINDOC);
    if (!trdr) continue;
    const a = agg.get(trdr) ?? { docs: new Set(), value: 0, byCategory: {}, byGroup: {}, items: {} };
    agg.set(trdr, a);
    const v = Math.abs(num(l.LINEVAL)) || 0.01;
    const it = itemBy.get(l.MTRL);
    a.docs.add(l.FINDOC);
    a.value += v;
    const cat = it?.MTRCATEGORY ? catName.get(`${it.SODTYPE}:${it.MTRCATEGORY}`) ?? `κατηγορία ${it.MTRCATEGORY}` : '(χωρίς κατηγορία)';
    const grp = it?.MTRGROUP ? grpName.get(`${it.SODTYPE}:${it.MTRGROUP}`) ?? `ομάδα ${it.MTRGROUP}` : '(χωρίς ομάδα)';
    a.byCategory[cat] = (a.byCategory[cat] ?? 0) + v;
    a.byGroup[grp] = (a.byGroup[grp] ?? 0) + v;
    const name = it?.NAME ?? `MTRL ${l.MTRL}`;
    a.items[name] = (a.items[name] ?? 0) + v;
  }

  const top = (o: Record<string, number>, n: number) => Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, n)
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
  const out = Object.fromEntries([...agg].map(([trdr, a]) => [trdr, {
    docs: a.docs.size, value: Math.round(a.value * 100) / 100,
    categories: top(a.byCategory, 5), groups: top(a.byGroup, 5), items: top(a.items, 8),
  }]));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), company, suppliers: out }, null, 2));
  console.log(`προμηθευτές με αγορές: ${agg.size}/${trdrs.length} → ${OUT}`);
  process.exit(0);
})();
