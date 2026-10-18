import 'dotenv/config';
import { prisma } from '@/lib/db';
import { softoneCall, softoneGetTable, loadSoftoneConfig } from '@/lib/softone';

// Ομάδες ειδών/υπηρεσιών (MTRGROUP) — σύνδεση και ανάθεση. ΔΕΝ δημιουργεί ομάδες στο SoftOne: το setData σε
// λίστα ομάδων (ITEGROUP/SRVGROUP) έσβησε γραμμή στο atelier (2026-10-17). Οι ομάδες δημιουργούνται από το
// SoftOne με τη λίστα της πρότασης (lib/item-groups.ts) και εδώ:
//   --link             διαβάζει MTRGROUP και συνδέει κάθε ομάδα της εφαρμογής (ίδιο SODTYPE + ίδια σύντμηση
//                      ή κωδικός ιεραρχίας) → ItemGroup.softoneId
//   --assign [--limit N] [--mtrl X]   γράφει ΜΟΝΟ το πεδίο MTRGROUP στην καρτέλα ITEM / SERVICE (μερική
//                      ενημέρωση EditMaster), με σύγκριση ΟΛΗΣ της καρτέλας πριν/μετά — σταματά στην πρώτη
//                      απόκλιση. Εμπορική κατηγορία (MTRCATEGORY), ΦΠΑ, λογαριασμοί: ποτέ.
//   χωρίς σημαία: dry run.
//
//   npx tsx --import ./scripts/templates/register.mjs scripts/item-groups-apply.ts --link

const args = process.argv.slice(2);
const LINK = args.includes('--link');
const ASSIGN = args.includes('--assign');
const at = (f: string) => { const i = args.indexOf(f); return i >= 0 ? Number(args[i + 1]) : null; };
const LIMIT = at('--limit') ?? Infinity;
const ONLY = at('--mtrl');
const OBJECT: Record<number, 'ITEM' | 'SERVICE'> = { 51: 'ITEM', 52: 'SERVICE' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type S1 = { success?: boolean; error?: string; errorcode?: number; data?: Record<string, Record<string, unknown>[]> };
const fail = (m: string): never => { console.error(`\n✖ ΣΤΟΠ: ${m}`); process.exit(1); };
const keyOf = (v: unknown) => String(v ?? '').split('|')[0].trim();
const clean = (s: string) => (String(s ?? '').match(/el=([^|}]+)/)?.[1] ?? String(s ?? '')).trim();

async function link() {
  const company = Number((await loadSoftoneConfig()).company);
  const s1 = await softoneGetTable('MTRGROUP', ['MTRGROUP', 'SODTYPE', 'CODE', 'NAME', 'SOHCODE'], `COMPANY=${company}`);
  const groups = await prisma.itemGroup.findMany({ where: { isActive: true }, orderBy: [{ sodtype: 'asc' }, { order: 'asc' }] });
  let linked = 0;
  for (const g of groups) {
    const hit = s1.find((r) => Number(r.SODTYPE) === g.sodtype && (r.CODE === g.code || (!!r.SOHCODE && r.SOHCODE === g.sohCode)));
    const tag = hit ? `→ MTRGROUP ${hit.MTRGROUP} «${clean(hit.NAME)}»` : '— δεν υπάρχει ακόμα στο SoftOne';
    console.log(`  ${g.sodtype} ${g.sohCode.padEnd(5)} ${g.code.padEnd(6)} ${g.name} ${tag}`);
    if (hit && LINK && g.softoneId !== Number(hit.MTRGROUP)) {
      await prisma.itemGroup.update({ where: { id: g.id }, data: { softoneId: Number(hit.MTRGROUP) } });
      linked++;
    }
  }
  console.log(`συνδέθηκαν: ${linked}${LINK ? '' : ' (dry run)'}`);
}

async function readCard(object: string, mtrl: number) {
  const res = await softoneCall<S1>('getData', { OBJECT: object, KEY: String(mtrl) });
  if (res.success === false || !res.data) fail(`getData ${object} ${mtrl}: ${res.error ?? 'κενό'}`);
  return res.data;
}
const IGNORE = new Set(['UPDDATE', 'UPDUSER', 'INSDATE', 'INSUSER', 'LOCKID', 'MTRGROUP']);
function diff(a: Record<string, Record<string, unknown>[]>, b: Record<string, Record<string, unknown>[]>) {
  const out: string[] = [];
  for (const t of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const ra = a[t] ?? [], rb = b[t] ?? [];
    if (ra.length !== rb.length) { out.push(`${t}: γραμμές ${ra.length} → ${rb.length}`); continue; }
    ra.forEach((row, i) => {
      for (const k of new Set([...Object.keys(row), ...Object.keys(rb[i] ?? {})])) {
        if (!IGNORE.has(k) && String(row[k] ?? '') !== String(rb[i]?.[k] ?? '')) out.push(`${t}.${k}: «${row[k] ?? ''}» → «${rb[i]?.[k] ?? ''}»`);
      }
    });
  }
  return out;
}

async function assign() {
  const list = await prisma.itemGroupAssignment.findMany({
    where: { status: { in: ['PROPOSED', 'APPROVED'] }, needsReview: false, groupId: { not: null }, ...(ONLY ? { mtrl: ONLY } : {}) },
    include: { group: { select: { softoneId: true, name: true, sohCode: true } } }, orderBy: { mtrl: 'asc' },
  });
  const ready = list.filter((a) => a.group?.softoneId != null);
  console.log(`προτάσεις: ${list.length} · έτοιμες (ομάδα στο SoftOne): ${ready.length}${ASSIGN ? '' : ' (dry run)'}`);
  let done = 0, skipped = 0;
  for (const a of ready) {
    if (done >= LIMIT) break;
    const object = OBJECT[a.sodtype], target = String(a.group!.softoneId);
    if (!ASSIGN) { console.log(`  · ${a.code} ${a.name} → ${a.group!.sohCode} ${a.group!.name}`); done++; continue; }
    const before = await readCard(object, a.mtrl);
    const cur = keyOf(before[object]?.[0]?.MTRGROUP);
    if (cur && cur !== target) { console.log(`  ⤳ ${a.code} έχει ήδη άλλη ομάδα (${cur}) — παραλείπεται`); skipped++; continue; }
    if (cur !== target) {
      const res = await softoneCall<S1>('setData', { OBJECT: object, KEY: String(a.mtrl), data: { [object]: [{ MTRGROUP: Number(target) }] } });
      if (res.success === false) fail(`${a.code}: ${res.error ?? res.errorcode}`);
    }
    const after = await readCard(object, a.mtrl);
    const changed = diff(before, after);
    if (changed.length) fail(`${a.code} ${a.name}: άλλαξαν και άλλα πεδία → ${changed.join(' · ')}`);
    if (keyOf(after[object]?.[0]?.MTRGROUP) !== target) fail(`${a.code}: η νέα ανάγνωση δεν δείχνει την ομάδα ${target}`);
    await prisma.itemGroupAssignment.update({ where: { mtrl: a.mtrl }, data: { status: 'APPLIED', appliedAt: new Date() } });
    done++;
    console.log(`  ✓ ${a.code} ${a.name} → ${a.group!.sohCode} ${a.group!.name}`);
    await sleep(200);
  }
  console.log(`ανατέθηκαν: ${done}${skipped ? ` · παραλείφθηκαν: ${skipped}` : ''}`);
}

(async () => {
  if (LINK || !ASSIGN) await link();
  if (ASSIGN || !LINK) await assign();
  process.exit(0);
})();
