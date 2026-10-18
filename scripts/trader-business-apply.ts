import 'dotenv/config';
import { prisma } from '@/lib/db';
import { softoneCall, softoneGetTable, isHiddenTrader } from '@/lib/softone';
import { updateTrader } from '@/lib/softone-sync/trader-update';

// Εμπορικές κατηγορίες (TRDBUSINESS) στο SoftOne — με ΡΗΤΗ έγκριση του χρήστη (2026-10-18).
// Γράφει ΜΟΝΟ: (α) νέες εγγραφές στον πίνακα TRDBUSINESS, (β) το πεδίο TRDR.TRDBUSINESS των καρτελών.
// ΠΟΤΕ λογιστική κατηγορία (TRDCATEGORY), λογαριασμούς, myDATA ή οτιδήποτε άλλο.
//
//   --create [--limit N]          δημιουργία κατηγοριών (μία τη φορά, ανάγνωση μετά από κάθε μία)
//   --assign [--limit N] [--trdr X]  ανάθεση στις καρτέλες (σύγκριση ΟΛΗΣ της καρτέλας πριν/μετά)
//   χωρίς σημαία εγγραφής: dry run (μόνο εμφάνιση).
//
//   npx tsx --import ./scripts/templates/register.mjs scripts/trader-business-apply.ts --create --limit 1

const args = process.argv.slice(2);
const CREATE = args.includes('--create');
const ASSIGN = args.includes('--assign');
const limitArg = args.indexOf('--limit');
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;
const trdrArg = args.indexOf('--trdr');
const ONLY_TRDR = trdrArg >= 0 ? Number(args[trdrArg + 1]) : null;
const OBJECT_BY_SODTYPE: Record<number, string> = { 12: 'SUPPLIER', 13: 'CUSTOMER' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type S1 = { success?: boolean; error?: string; errorcode?: number; data?: Record<string, Record<string, unknown>[]> };

function fail(msg: string): never {
  console.error(`\n✖ ΣΤΟΠ: ${msg}`);
  process.exit(1);
}

async function readBusiness(sodtype: number, key: number) {
  const rows = await softoneGetTable('TRDBUSINESS', ['TRDBUSINESS', 'SODTYPE', 'CODE', 'NAME', 'SOHCODE', 'PAYMENT', 'PRCCATEGORY', 'ISACTIVE'],
    `SODTYPE=${sodtype} AND TRDBUSINESS=${key}`);
  return rows[0] ?? null;
}

async function createAll() {
  const nodes = await prisma.traderClass.findMany({ where: { isActive: true }, orderBy: [{ sodtype: 'desc' }, { level: 'asc' }, { order: 'asc' }] });
  const todo = nodes.filter((n) => n.softoneId == null);
  console.log(`κατηγορίες: ${nodes.length} · χωρίς κλειδί SoftOne: ${todo.length}${CREATE ? '' : ' (dry run)'}`);
  const before = await softoneGetTable('TRDBUSINESS', ['TRDBUSINESS', 'SODTYPE', 'CODE', 'SOHCODE'], '');
  const used = new Map<number, Set<number>>();
  for (const r of before) {
    const s = Number(r.SODTYPE);
    if (!used.has(s)) used.set(s, new Set());
    used.get(s)!.add(Number(r.TRDBUSINESS));
    // Ήδη υπάρχουσα (π.χ. από προηγούμενη εκτέλεση που κόπηκε): ταιριάζει με SOHCODE → μόνο σύνδεση.
    const n = todo.find((x) => x.sodtype === s && x.sohCode === r.SOHCODE && x.code === r.CODE);
    if (n && CREATE) {
      await prisma.traderClass.update({ where: { id: n.id }, data: { softoneId: Number(r.TRDBUSINESS) } });
      n.softoneId = Number(r.TRDBUSINESS);
      console.log(`  ↺ ${s} ${r.SOHCODE} ${r.CODE} υπάρχει ήδη (κλειδί ${r.TRDBUSINESS}) — συνδέθηκε`);
    }
  }
  let done = 0;
  for (const n of todo) {
    if (n.softoneId != null) continue;
    if (done >= LIMIT) break;
    const taken = used.get(n.sodtype) ?? new Set<number>();
    let key = 1;
    while (taken.has(key)) key++;
    const row = { TRDBUSINESS: key, SODTYPE: n.sodtype, CODE: n.code, NAME: n.name, SOHCODE: n.sohCode, ISACTIVE: 1 };
    console.log(`  ${CREATE ? '→' : '·'} ${n.sodtype} ${n.sohCode?.padEnd(8)} ${n.code.padEnd(9)} ${n.name} (κλειδί ${key})`);
    if (!CREATE) { taken.add(key); used.set(n.sodtype, taken); done++; continue; }

    const res = await softoneCall<S1>('setData', { OBJECT: 'TRDBUSINESS', KEY: '', data: { TRDBUSINESS: [row] } });
    if (res.success === false) fail(`setData TRDBUSINESS ${n.code}: ${res.error ?? res.errorcode}`);
    const saved = await readBusiness(n.sodtype, key);
    if (!saved) fail(`η κατηγορία ${n.code} δεν βρέθηκε μετά την εγγραφή (SODTYPE ${n.sodtype}, κλειδί ${key})`);
    const mism = [
      saved.CODE !== n.code && 'CODE', saved.NAME !== n.name && 'NAME', saved.SOHCODE !== (n.sohCode ?? '') && 'SOHCODE',
      Number(saved.SODTYPE) !== n.sodtype && 'SODTYPE', saved.PAYMENT && 'PAYMENT', saved.PRCCATEGORY && 'PRCCATEGORY',
    ].filter(Boolean);
    if (mism.length) fail(`η κατηγορία ${n.code} διαβάστηκε διαφορετική: ${mism.join(', ')} → ${JSON.stringify(saved)}`);
    await prisma.traderClass.update({ where: { id: n.id }, data: { softoneId: key } });
    taken.add(key); used.set(n.sodtype, taken); done++;
    console.log(`    ✓ επαληθεύτηκε`);
    await sleep(250);
  }
  const after = await softoneGetTable('TRDBUSINESS', ['TRDBUSINESS', 'SODTYPE', 'CODE', 'SOHCODE'], '');
  console.log(`TRDBUSINESS στο SoftOne: ${before.length} → ${after.length} γραμμές`);
}

/** Η καρτέλα όπως τη δίνει το getData — για σύγκριση όλων των πεδίων πριν/μετά. */
async function readCard(object: string, trdr: number): Promise<Record<string, Record<string, unknown>[]>> {
  const res = await softoneCall<S1>('getData', { OBJECT: object, KEY: String(trdr) });
  if (res.success === false || !res.data) fail(`getData ${object} ${trdr}: ${res.error ?? 'κενό'}`);
  return res.data;
}
const IGNORE = new Set(['UPDDATE', 'UPDUSER', 'INSDATE', 'INSUSER', 'TRDBUSINESS']);
function diffCards(a: Record<string, Record<string, unknown>[]>, b: Record<string, Record<string, unknown>[]>): string[] {
  const out: string[] = [];
  for (const table of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const ra = a[table] ?? [], rb = b[table] ?? [];
    if (ra.length !== rb.length) { out.push(`${table}: γραμμές ${ra.length} → ${rb.length}`); continue; }
    ra.forEach((row, i) => {
      for (const k of new Set([...Object.keys(row), ...Object.keys(rb[i] ?? {})])) {
        if (IGNORE.has(k)) continue;
        if (String(row[k] ?? '') !== String(rb[i]?.[k] ?? '')) out.push(`${table}.${k}: «${row[k] ?? ''}» → «${rb[i]?.[k] ?? ''}»`);
      }
    });
  }
  return out;
}

async function assignAll() {
  const list = await prisma.traderClassAssignment.findMany({
    where: { status: 'PROPOSED', needsReview: false, leafId: { not: null }, ...(ONLY_TRDR ? { trdr: ONLY_TRDR } : {}) },
    include: { leaf: { select: { softoneId: true, name: true, sohCode: true } } },
    orderBy: [{ sodtype: 'asc' }, { trdr: 'asc' }],
  });
  const ready = list.filter((a) => a.leaf?.softoneId != null && !isHiddenTrader(a.name));
  console.log(`προτάσεις χωρίς σήμανση ελέγχου: ${list.length} · έτοιμες (κατηγορία στο SoftOne): ${ready.length}${ASSIGN ? '' : ' (dry run)'}`);
  let done = 0, skipped = 0;
  for (const a of ready) {
    if (done >= LIMIT) break;
    const object = OBJECT_BY_SODTYPE[a.sodtype];
    const target = String(a.leaf!.softoneId);
    if (!ASSIGN) { console.log(`  · ${a.code} ${a.name} → ${a.leaf!.sohCode} ${a.leaf!.name}`); done++; continue; }
    const before = await readCard(object, a.trdr);
    const cur = String(before[object]?.[0]?.TRDBUSINESS ?? '');
    if (cur && cur !== target) { console.log(`  ⤳ ${a.code} έχει ήδη άλλη εμπορική κατηγορία (${cur}) — παραλείπεται`); skipped++; continue; }
    const res = await updateTrader(a.trdr, { trdBusiness: target });
    if (res.unapplied.length) fail(`${a.code}: το SoftOne δεν κράτησε την εμπορική κατηγορία`);
    const after = await readCard(object, a.trdr);
    const changed = diffCards(before, after);
    if (changed.length) fail(`${a.code} ${a.name}: άλλαξαν και άλλα πεδία → ${changed.join(' · ')}`);
    if (String(after[object]?.[0]?.TRDBUSINESS ?? '') !== target) fail(`${a.code}: η νέα ανάγνωση δεν δείχνει την κατηγορία ${target}`);
    await prisma.traderClassAssignment.update({ where: { trdr: a.trdr }, data: { status: 'APPLIED', appliedAt: new Date() } });
    done++;
    console.log(`  ✓ ${a.code} ${a.name} → ${a.leaf!.sohCode} ${a.leaf!.name}`);
    await sleep(200);
  }
  console.log(`ανατέθηκαν: ${done}${skipped ? ` · παραλείφθηκαν: ${skipped}` : ''}`);
}

(async () => {
  if (CREATE || (!ASSIGN && !CREATE)) await createAll();
  if (ASSIGN || (!ASSIGN && !CREATE)) await assignAll();
  process.exit(0);
})();
