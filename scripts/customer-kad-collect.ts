import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { softoneGetTable, loadSoftoneConfig } from '@/lib/softone';
import { parseAfm2Info, type Afm2InfoRecord } from '@/lib/aade-parse';
import { isValidAfm } from '@/lib/ocr/validate';

// Συλλογή ΚΑΔ πελατών (TRDR SODTYPE 13) ή προμηθευτών (`--suppliers` → SODTYPE 12) — ΜΟΝΟ ΑΝΑΓΝΩΣΗ,
// στο SoftOne και στην ΑΑΔΕ.
//
// 1. SoftOne: πελάτες (ΑΦΜ, χώρα, TRDCATEGORY/TRDBUSINESS/TRDGROUP) + ΚΑΔ καρτέλας (TRDEXTRA.KAD/KAD1 → KADTAXIS).
// 2. ΑΑΔΕ (`afm2info`, ίδιος proxy με την «Εξακρίβωση ΑΑΔΕ» της καρτέλας): μόνο έγκυρα ελληνικά ΑΦΜ.
//    Αργά (1 αίτημα / THROTTLE_MS) και με cache ανά ΑΦΜ, ώστε μια επανάληψη να μη ρωτά ξανά.
// 3. Γράφει ένα JSON με όλα — το διαβάζει το `scripts/customer-kad-report.ts`.
//
//   npx tsx --import ./scripts/templates/register.mjs scripts/customer-kad-collect.ts [--suppliers] [out.json]

const THROTTLE_MS = 1500;
const CACHE_FILE = path.join(process.cwd(), '.next', 'cache', 'aade-afm2info.json');
const SUPPLIERS = process.argv.includes('--suppliers');
const SODTYPE = SUPPLIERS ? 12 : 13;
const OUT = process.argv.slice(2).find((a) => !a.startsWith('--'))
  ?? path.join(process.cwd(), '.next', 'cache', SUPPLIERS ? 'supplier-kad.json' : 'customer-kad.json');

type CacheEntry = { at: string; raw: unknown } | { at: string; error: string };

function loadCache(): Record<string, CacheEntry> {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return {}; }
}
function saveCache(c: Record<string, CacheEntry>) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(c));
}

async function afm2info(afm: string): Promise<unknown> {
  const r = await fetch('https://vat.wwa.gr/afm2info', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ afm }), cache: 'no-store',
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export interface CollectedCustomer {
  trdr: number;
  code: string;
  name: string;
  afm: string | null;
  country: string | null;
  isActive: boolean;
  jobType: string | null;
  trdCategory: string | null;
  trdBusiness: string | null;
  trdGroup: string | null;
  softoneKad: { code: string; name: string } | null;
  softoneKad1: { code: string; name: string } | null;
  /** greek = έγκυρο ελληνικό ΑΦΜ · foreign · invalid · none */
  afmKind: 'greek' | 'foreign' | 'invalid' | 'none';
  aade: Afm2InfoRecord | null;
  aadeError: string | null;
}

(async () => {
  const cfg = await loadSoftoneConfig();
  const company = Number(cfg.company);
  const rows = await softoneGetTable(
    'TRDR',
    ['TRDR', 'CODE', 'NAME', 'AFM', 'COUNTRY', 'ISACTIVE', 'JOBTYPETRD', 'TRDCATEGORY', 'TRDBUSINESS', 'TRDGROUP'],
    `SODTYPE=${SODTYPE} AND COMPANY=${company}`,
  );
  console.log(`${SUPPLIERS ? 'προμηθευτές' : 'πελάτες'} SoftOne: ${rows.length}`);

  const extra = await softoneGetTable('TRDEXTRA', ['TRDR', 'KAD', 'KAD1'], `TRDR IN (${rows.map((r) => r.TRDR).join(',')})`)
    .catch((e) => { console.warn('TRDEXTRA:', (e as Error).message); return []; });
  const kadIds = [...new Set(extra.flatMap((x) => [x.KAD, x.KAD1]).filter(Boolean))];
  const kadRows = kadIds.length
    ? await softoneGetTable('KADTAXIS', ['KADTAXIS', 'CODE', 'NAME'], `KADTAXIS IN (${kadIds.join(',')})`).catch(() => [])
    : [];
  const kadById = new Map(kadRows.map((k) => [k.KADTAXIS, { code: k.CODE, name: k.NAME }]));
  const extraByTrdr = new Map(extra.map((x) => [x.TRDR, x]));

  const cache = loadCache();
  const out: CollectedCustomer[] = [];
  let queried = 0;
  for (const r of rows) {
    const afmRaw = (r.AFM ?? '').trim();
    const digits = afmRaw.replace(/\D/g, '');
    const foreignCountry = r.COUNTRY && r.COUNTRY !== '1000';
    const afmKind: CollectedCustomer['afmKind'] = !afmRaw ? 'none'
      : foreignCountry || /[A-Za-z]/.test(afmRaw) ? 'foreign'
      : isValidAfm(digits) && !/^(\d)\1{8}$/.test(digits) ? 'greek' : 'invalid';

    let aade: Afm2InfoRecord | null = null;
    let aadeError: string | null = null;
    if (afmKind === 'greek') {
      let entry = cache[digits];
      if (!entry || 'error' in entry) {
        if (queried > 0) await sleep(THROTTLE_MS);
        queried += 1;
        try {
          entry = { at: new Date().toISOString(), raw: await afm2info(digits) };
        } catch (e) {
          await sleep(THROTTLE_MS * 3);
          try { entry = { at: new Date().toISOString(), raw: await afm2info(digits) }; }
          catch (e2) { entry = { at: new Date().toISOString(), error: (e2 as Error).message || (e as Error).message }; }
        }
        cache[digits] = entry;
        saveCache(cache);
        process.stdout.write(`\rΑΑΔΕ: ${queried} αιτήματα`);
      }
      if ('error' in entry) aadeError = entry.error;
      else {
        aade = parseAfm2Info(entry.raw);
        if (!aade) aadeError = 'not_found';
      }
    }

    const x = extraByTrdr.get(r.TRDR);
    out.push({
      trdr: Number(r.TRDR),
      code: r.CODE,
      name: r.NAME,
      afm: afmRaw || null,
      country: r.COUNTRY || null,
      isActive: r.ISACTIVE !== '0',
      jobType: r.JOBTYPETRD || null,
      trdCategory: r.TRDCATEGORY || null,
      trdBusiness: r.TRDBUSINESS || null,
      trdGroup: r.TRDGROUP || null,
      softoneKad: (x?.KAD && kadById.get(x.KAD)) || null,
      softoneKad1: (x?.KAD1 && kadById.get(x.KAD1)) || null,
      afmKind,
      aade,
      aadeError,
    });
  }
  console.log(`\nνέα αιτήματα ΑΑΔΕ: ${queried} · cache: ${Object.keys(cache).length} ΑΦΜ`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), company, sodtype: SODTYPE, customers: out }, null, 2));
  console.log(`→ ${OUT}`);
  process.exit(0);
})();
