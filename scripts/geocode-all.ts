/**
 * Μαζική γεωκωδικοποίηση συναλλασσομένων (SoftOne TRDR) και συνεργατών (τοπικό μητρώο).
 *
 *   npx tsx --env-file=.env --import ./scripts/templates/register.mjs scripts/geocode-all.ts            # DRY RUN (προεπιλογή)
 *   … scripts/geocode-all.ts --apply                 # γράφει ΜΟΝΟ τα «match» στο TRDR.LATITUDE/LONGITUDE
 *   … scripts/geocode-all.ts --apply --approximate   # + τα «approximate» (σημείο ΤΚ/οικισμού — μόνο με ρητή απόφαση)
 *   … scripts/geocode-all.ts --apply --ambiguous     # + τα «ambiguous» (μόνο με ρητή απόφαση)
 *   … --fill-address                                 # + συμπληρώνει ΚΕΝΗ οδό/ΤΚ/πόλη στο SoftOne από ΑΑΔΕ/VIES (μόνο με ρητή απόφαση)
 *   … --out=/path/report.json  --limit=50  --sodtype=13
 *
 * Όταν λείπει η οδός (ή ΤΚ και πόλη) και υπάρχει ΑΦΜ: διεύθυνση από ΑΑΔΕ (ελληνικός ΑΦΜ, afm2info) ή VIES (ΕΕ).
 *
 * Πάροχος/μνήμη: lib/geocode-cache (cachedGeocodeAddressParts — ίδια με την καρτέλα, μία κλήση ανά διεύθυνση).
 * Εγγραφή: lib/softone-sync/trader-update.updateTrader (setData + ΝΕΑ ανάγνωση και έλεγχος) — ΜΟΝΟ συναλλασσόμενοι
 * ΧΩΡΙΣ ήδη θέση. Οι συνεργάτες δεν έχουν πεδία θέσης: τα αποτελέσματά τους μένουν στη μνήμη γεωκωδικοποίησης.
 */
import { writeFileSync } from 'node:fs';
import { prisma } from '@/lib/db';
import { softoneFetchCountries, softoneGetTable } from '@/lib/softone';
import { cachedGeocodeAddressParts } from '@/lib/geocode-cache';
import { updateTrader } from '@/lib/softone-sync/trader-update';
import { addressLine, classify, hasCoords, isoCountry, needsRegistryAddress, registryTarget, type GeoInput, type GeoStatus } from '@/lib/geo-batch-core';
import { parseAfm2Info } from '@/lib/aade-parse';
import { checkVat } from '@/lib/vat-check';

const arg = (k: string) => process.argv.find((a) => a === `--${k}` || a.startsWith(`--${k}=`));
const val = (k: string) => arg(k)?.split('=')[1];
const APPLY = !!arg('apply');
const WITH_AMBIGUOUS = !!arg('ambiguous');
const WITH_APPROX = !!arg('approximate');
const FILL_ADDRESS = !!arg('fill-address');
const LIMIT = Number(val('limit') ?? 0) || Infinity;
const SODTYPES = (val('sodtype') ?? '12,13').split(',').map(Number).filter(Boolean);
const OUT = val('out');

type Row = { kind: 'trader' | 'partner'; id: string; name: string; sodtype?: number; address: string | null; addressSource?: 'softone' | 'aade' | 'vies'; registry?: { address: string | null; zip: string | null; city: string | null } | null; addressFilled?: 'ok' | 'error'; status: GeoStatus; lat: number | null; lng: number | null; result: string | null; applied?: 'ok' | 'unapplied' | 'error'; error?: string };

/** Διεύθυνση από τα επίσημα μητρώα: ΑΑΔΕ (afm2info, ίδιο με τη φόρμα νέου συναλλασσομένου) ή VIES. */
async function registryAddress(afm: string | null, countryIso: string | null): Promise<{ src: 'aade' | 'vies'; address: string | null; zip: string | null; city: string | null } | null> {
  const t = registryTarget(afm, countryIso);
  if (!t) return null;
  try {
    if (t.kind === 'aade') {
      const r = await fetch('https://vat.wwa.gr/afm2info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ afm: t.afm }), cache: 'no-store', signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return null;
      const rec = parseAfm2Info(await r.json().catch(() => null));
      return rec?.address ? { src: 'aade', address: rec.address, zip: rec.zip, city: rec.city } : null;
    }
    const v = await checkVat(t.vat);
    return v.valid && v.address ? { src: 'vies', address: v.address.replace(/\s*\n\s*/g, ', '), zip: null, city: null } : null;
  } catch { return null; }
}

async function main() {
  console.log(`Γεωκωδικοποίηση — ${APPLY ? `ΕΓΓΡΑΦΗ στο SoftOne (${WITH_AMBIGUOUS ? 'match + ambiguous' : 'μόνο match'})` : 'DRY RUN (καμία εγγραφή)'}`);
  const countries = await softoneFetchCountries().catch(() => []);
  const countryIso = new Map(countries.map((c) => [String(c.id), isoCountry(c.shortcut) ?? isoCountry(c.intcode)]));

  const traders = await softoneGetTable('TRDR', ['TRDR', 'SODTYPE', 'NAME', 'AFM', 'ADDRESS', 'DISTRICT', 'ZIP', 'CITY', 'COUNTRY', 'LATITUDE', 'LONGITUDE', 'ISACTIVE'],
    `SODTYPE IN (${SODTYPES.join(',')}) AND ISACTIVE=1`);
  const todo = traders.filter((t) => !hasCoords(t.LATITUDE, t.LONGITUDE));
  const partners = await prisma.partner.findMany({ where: { isActive: true }, select: { id: true, name: true, address: true, city: true, zip: true, country: true } });
  console.log(`Συναλλασσόμενοι: ${traders.length} ενεργοί (SODTYPE ${SODTYPES.join('/')}), ${traders.length - todo.length} έχουν ήδη θέση, ${todo.length} προς έλεγχο · Συνεργάτες: ${partners.length}`);

  const rows: Row[] = [];
  let n = 0;
  for (const t of todo) {
    if (n++ >= LIMIT) break;
    let input: GeoInput = { address: t.ADDRESS, district: t.DISTRICT, zip: t.ZIP, city: t.CITY, countryIso: countryIso.get(t.COUNTRY) ?? 'GR' };
    let source: Row['addressSource'] = 'softone';
    let registry: Row['registry'] = null;
    if (needsRegistryAddress(input)) {
      const reg = await registryAddress(t.AFM, input.countryIso ?? 'GR');
      if (reg) {
        source = reg.src;
        registry = { address: reg.address, zip: reg.zip, city: reg.city };
        input = reg.src === 'aade'
          ? { address: reg.address, zip: reg.zip ?? input.zip, city: reg.city ?? input.city, countryIso: input.countryIso }
          : { address: reg.address, countryIso: input.countryIso };
      }
    }
    const line = addressLine(input);
    const hit = line ? await cachedGeocodeAddressParts(line, { countryHint: input.countryIso ?? 'GR' }) : null;
    const parts = hit?.found ? hit.parts : null;
    const status = classify(input, hit ? { found: hit.found, lat: parts?.lat ?? null, lng: parts?.lng ?? null, zip: parts?.zip ?? null, city: parts?.city ?? null, countryCode: parts?.countryCode ?? null, formatted: parts?.formatted ?? null } : null);
    const row: Row = { kind: 'trader', id: t.TRDR, name: t.NAME, sodtype: Number(t.SODTYPE), address: line, addressSource: source, registry, status, lat: parts?.lat ?? null, lng: parts?.lng ?? null, result: parts?.formatted ?? null };
    if (APPLY && (status === 'match' || (WITH_APPROX && status === 'approximate') || (WITH_AMBIGUOUS && status === 'ambiguous')) && row.lat != null && row.lng != null) {
      try {
        const r = await updateTrader(Number(t.TRDR), { lat: row.lat, lng: row.lng });
        row.applied = r.unapplied.length ? 'unapplied' : 'ok';
      } catch (e) { row.applied = 'error'; row.error = (e as Error).message; }
    }
    // Συμπλήρωση ΜΟΝΟ κενών πεδίων διεύθυνσης στο SoftOne (ποτέ αντικατάσταση) — μόνο με --fill-address.
    if (APPLY && FILL_ADDRESS && registry && source === 'aade') {
      const fill: Record<string, string> = {};
      if (!String(t.ADDRESS ?? '').trim() && registry.address) fill.address = registry.address;
      if (!String(t.ZIP ?? '').trim() && registry.zip) fill.zip = registry.zip;
      if (!String(t.CITY ?? '').trim() && registry.city) fill.city = registry.city;
      if (Object.keys(fill).length) {
        try { await updateTrader(Number(t.TRDR), fill); row.addressFilled = 'ok'; } catch (e) { row.addressFilled = 'error'; row.error = (e as Error).message; }
      }
    }
    rows.push(row);
    process.stdout.write(`\r${rows.length}/${Math.min(todo.length, LIMIT)} συναλλασσόμενοι…`);
  }
  process.stdout.write('\n');

  for (const p of partners) {
    const input = { address: p.address, zip: p.zip, city: p.city, countryIso: isoCountry(p.country) ?? 'GR' };
    const line = addressLine(input);
    const hit = line ? await cachedGeocodeAddressParts(line, { countryHint: input.countryIso ?? 'GR' }) : null;
    const parts = hit?.found ? hit.parts : null;
    rows.push({ kind: 'partner', id: p.id, name: p.name, address: line, status: classify(input, hit ? { found: hit.found, lat: parts?.lat ?? null, lng: parts?.lng ?? null, zip: parts?.zip ?? null, city: parts?.city ?? null, countryCode: parts?.countryCode ?? null, formatted: parts?.formatted ?? null } : null), lat: parts?.lat ?? null, lng: parts?.lng ?? null, result: parts?.formatted ?? null });
  }

  const count = (k: Row['kind'], s: GeoStatus) => rows.filter((r) => r.kind === k && r.status === s).length;
  for (const k of ['trader', 'partner'] as const) {
    console.log(`${k === 'trader' ? 'Συναλλασσόμενοι' : 'Συνεργάτες'}: match ${count(k, 'match')} · approximate ${count(k, 'approximate')} · ambiguous ${count(k, 'ambiguous')} · not_found ${count(k, 'not_found')} · no_address ${count(k, 'no_address')}`);
  }
  const src = (x: Row['addressSource']) => rows.filter((r) => r.kind === 'trader' && r.addressSource === x).length;
  console.log(`Πηγή διεύθυνσης: SoftOne ${src('softone')} · ΑΑΔΕ ${src('aade')} · VIES ${src('vies')}`);
  if (APPLY) {
    const a = rows.filter((r) => r.applied);
    console.log(`Εγγραφές SoftOne: ok ${a.filter((r) => r.applied === 'ok').length} · δεν κρατήθηκαν ${a.filter((r) => r.applied === 'unapplied').length} · σφάλματα ${a.filter((r) => r.applied === 'error').length}`);
  }
  if (OUT) { writeFileSync(OUT, JSON.stringify(rows, null, 2)); console.log(`Αναφορά: ${OUT}`); }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
