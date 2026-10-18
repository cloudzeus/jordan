import 'dotenv/config';
import { MIRROR_TABLES, runMirrorCycle, type MirrorTable } from '@/lib/softone-mirror/sync';

// Ένας κύκλος συγχρονισμού του καθρέφτη SoftOne (lib/softone-mirror) από τη γραμμή εντολών — π.χ. από
// cron του server όταν ο worker είναι κλειστός. ΜΟΝΟ ανάγνωση από το SoftOne, ιδιωτική συνεδρία.
//
//   npx tsx --import ./scripts/templates/register.mjs scripts/softone-mirror-sync.ts [incremental|reconcile|auto] [πίνακας…]

(async () => {
  const [arg, ...tables] = process.argv.slice(2);
  const mode = arg === 'incremental' || arg === 'reconcile' ? arg : 'auto';
  const only = tables.filter((t): t is MirrorTable => (MIRROR_TABLES as string[]).includes(t));
  const r = await runMirrorCycle({ mode, trigger: 'script', ...(only.length ? { only } : {}) });
  for (const s of r.steps) console.log(`${s.ok ? '✓' : '✗'} ${s.table.padEnd(9)}${s.full ? ' (πλήρης)' : '         '} ${String(s.changed).padStart(5)} αλλαγές  ${s.ms}ms${s.error ? `  ${s.error}` : ''}${s.note ? `  (${s.note})` : ''}`);
  console.log(r.skipped ? `Παράλειψη: ${r.skipped}` : `${r.mode} σε ${r.ms}ms`);
  // Ο ξαναϋπολογισμός κερδοφορίας τρέχει στο παρασκήνιο μετά από αλλαγές — λίγος χρόνος να τελειώσει.
  setTimeout(() => process.exit(r.ok || r.skipped ? 0 : 1), 3000);
})();
