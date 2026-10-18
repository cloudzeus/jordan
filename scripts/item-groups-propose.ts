import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { softoneGetTable, loadSoftoneConfig } from '@/lib/softone';
import { ITEM_GROUPS, ITEM_GROUP_BY_KEY, itemGroupParent, proposeItemGroup } from '@/lib/item-groups';

// ΠΡΟΤΑΣΗ ομάδων (MTRGROUP) για είδη & υπηρεσίες — ΜΟΝΟ ΑΝΑΓΝΩΣΗ στο SoftOne. Με `--write-db` αποθηκεύει
// δέντρο (ItemGroup) και προτάσεις (ItemGroupAssignment) στη βάση της εφαρμογής· στο SoftOne ΠΟΤΕ.
//   npx tsx --import ./scripts/templates/register.mjs scripts/item-groups-propose.ts [--write-db] [out.json]

const WRITE_DB = process.argv.includes('--write-db');
const OUT = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? path.join(process.cwd(), '.next', 'cache', 'item-groups-proposal.json');
const SODTYPE = { item: 51, service: 52 } as const;

/** Δέντρο → βάση. Το `softoneId` μπαίνει μόνο για υπάρχουσες ομάδες του SoftOne (π.χ. Πλακάκια 2, Πέτρες 3). */
async function seedGroups(existing: Array<Record<string, string>>): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  const nodes = [...ITEM_GROUPS].sort((a, b) => a.soh.split('.').length - b.soh.split('.').length);
  for (const [i, n] of nodes.entries()) {
    const sodtype = SODTYPE[n.kind];
    const parent = itemGroupParent(n);
    const reuse = n.reuse != null && existing.some((g) => Number(g.SODTYPE) === sodtype && Number(g.MTRGROUP) === n.reuse) ? n.reuse : null;
    const data = {
      level: n.soh.split('.').length, sohCode: n.soh, code: n.code, name: n.name, description: n.description ?? null,
      parentId: parent ? ids.get(`${parent.key}|${sodtype}`) ?? null : null, order: i, isActive: true,
      ...(reuse != null ? { softoneId: reuse } : {}),
    };
    const row = await prisma.itemGroup.upsert({ where: { key_sodtype: { key: n.key, sodtype } }, update: data, create: { key: n.key, sodtype, ...data } });
    ids.set(`${n.key}|${sodtype}`, row.id);
  }
  return ids;
}
const clean = (s: string) => (String(s ?? '').match(/el=([^|}]+)/)?.[1] ?? String(s ?? '')).trim();

(async () => {
  const company = Number((await loadSoftoneConfig()).company);
  const [mtrl, cats, groups] = await Promise.all([
    softoneGetTable('MTRL', ['MTRL', 'CODE', 'NAME', 'SODTYPE', 'MTRCATEGORY', 'MTRGROUP', 'ISACTIVE'], `SODTYPE IN (51,52) AND COMPANY=${company}`),
    softoneGetTable('MTRCATEGORY', ['MTRCATEGORY', 'SODTYPE', 'NAME'], `COMPANY=${company}`),
    softoneGetTable('MTRGROUP', ['MTRGROUP', 'SODTYPE', 'CODE', 'NAME'], `COMPANY=${company}`),
  ]);
  const catName = new Map(cats.map((c) => [`${c.SODTYPE}:${c.MTRCATEGORY}`, clean(c.NAME)]));
  const grpName = new Map(groups.map((g) => [`${g.SODTYPE}:${g.MTRGROUP}`, clean(g.NAME)]));

  // Προμηθευτές ανά είδος (αξία αγορών) με την εμπορική τους κατηγορία.
  const sp = await prisma.supplierProduct.findMany({ select: { mtrl: true, trdr: true, invoiceValue: true, docs: true } });
  const assign = await prisma.traderClassAssignment.findMany({
    where: { trdr: { in: [...new Set(sp.map((s) => s.trdr))] } }, select: { trdr: true, name: true, leaf: { select: { key: true, name: true } } },
  });
  const supBy = new Map(assign.map((a) => [a.trdr, a]));
  const bySupp = new Map<number, { leaf: string; value: number; name: string; leafName: string }[]>();
  for (const s of sp) {
    const a = supBy.get(s.trdr);
    const list = bySupp.get(s.mtrl) ?? [];
    list.push({ leaf: a?.leaf?.key ?? '', value: s.invoiceValue || (s.docs ? 0.01 : 0), name: a?.name ?? String(s.trdr), leafName: a?.leaf?.name ?? '' });
    bySupp.set(s.mtrl, list);
  }

  const rows = mtrl.filter((m) => m.ISACTIVE !== '0').map((m) => {
    const kind = m.SODTYPE === '52' ? 'service' as const : 'item' as const;
    const suppliers = bySupp.get(Number(m.MTRL)) ?? [];
    const p = proposeItemGroup({ name: m.NAME, kind, suppliers: suppliers.filter((s) => s.leaf) });
    const node = ITEM_GROUP_BY_KEY.get(p.group)!;
    return {
      mtrl: Number(m.MTRL), code: m.CODE, name: m.NAME, kind,
      category: m.MTRCATEGORY ? catName.get(`${m.SODTYPE}:${m.MTRCATEGORY}`) ?? m.MTRCATEGORY : null,
      currentGroup: m.MTRGROUP ? grpName.get(`${m.SODTYPE}:${m.MTRGROUP}`) ?? `#${m.MTRGROUP}` : null,
      suppliers: suppliers.sort((a, b) => b.value - a.value).slice(0, 2).map((s) => s.name),
      value: Math.round(suppliers.reduce((n, s) => n + s.value, 0)),
      group: p.group, soh: node.soh, basis: p.basis, rule: p.rule, review: p.review, looksLikeService: p.looksLikeService,
    };
  });

  if (WRITE_DB) {
    const ids = await seedGroups(groups);
    let written = 0;
    for (const r of rows) {
      const sodtype = SODTYPE[r.kind];
      const existing = await prisma.itemGroupAssignment.findUnique({ where: { mtrl: r.mtrl }, select: { status: true } });
      if (existing && existing.status !== 'PROPOSED') continue; // εγκεκριμένη/εφαρμοσμένη δεν ξαναγράφεται
      const data = {
        sodtype, code: r.code, name: r.name, groupId: ids.get(`${r.group}|${sodtype}`) ?? null,
        basis: r.basis, rule: r.rule, needsReview: r.review, looksLikeService: r.looksLikeService,
      };
      await prisma.itemGroupAssignment.upsert({ where: { mtrl: r.mtrl }, update: data, create: { mtrl: r.mtrl, ...data } });
      written++;
    }
    console.log(`βάση: ${ids.size} ομάδες · ${written} προτάσεις`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    tree: ITEM_GROUPS,
    existing: {
      categories: cats.map((c) => ({ id: c.MTRCATEGORY, sodtype: c.SODTYPE, name: clean(c.NAME) })),
      groups: groups.map((g) => ({ id: g.MTRGROUP, sodtype: g.SODTYPE, code: g.CODE, name: clean(g.NAME) })),
    },
    rows,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report));
  const m: Record<string, number> = {};
  for (const r of rows) { const k = `${r.kind === 'service' ? 'Υ' : 'Ε'} ${r.soh} ${ITEM_GROUP_BY_KEY.get(r.group)!.name}`; m[k] = (m[k] ?? 0) + 1; }
  console.table(Object.entries(m).sort().map(([k, n]) => ({ ομάδα: k, πλήθος: n })));
  console.log(`είδη/υπηρεσίες: ${rows.length} · από όνομα ${rows.filter((r) => r.basis === 'name').length} · από προμηθευτή ${rows.filter((r) => r.basis === 'supplier').length} · χωρίς ${rows.filter((r) => r.basis === 'none').length} · «μοιάζει υπηρεσία» ${rows.filter((r) => r.looksLikeService).length}`);
  console.log(`→ ${OUT}`);
  process.exit(0);
})();
