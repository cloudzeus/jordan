// lib/softone-mirror/worker.ts — SERVER. Ο περιοδικός συγχρονισμός του καθρέφτη SoftOne μέσα στον Next
// server (ξεκινά από το instrumentation.ts). Κάθε λίγα λεπτά ένας αυξητικός κύκλος· τη νύχτα, συμφωνία.
//
// Δεν τρέχει όταν `JOBS_DISABLED=1` (π.χ. το σταθερό preview στο :3001 — εκεί τον κάνει ο dev server ή
// το cron) ούτε σε tests/scripts. Το ίδιο κάνει και το `SOFTONE_MIRROR_DISABLED=1`, αν χρειαστεί
// να σβήσει μόνο αυτός. Δύο instances με worker δεν συγκρούονται: τη σειρά την κρατά η μίσθωση.
import 'server-only';
import { runMirrorCycle } from './sync';

const DEFAULT_INTERVAL_MS = 3 * 60_000;
const FIRST_DELAY_MS = 30_000;

const g = globalThis as unknown as { __softoneMirrorWorker?: ReturnType<typeof setInterval> };

export function mirrorWorkerDisabled(): boolean {
  if (process.env.JOBS_DISABLED === '1' || process.env.SOFTONE_MIRROR_DISABLED === '1') return true;
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return true;
  return (process.env.NEXT_RUNTIME ?? '') !== 'nodejs';
}

export function mirrorIntervalMs(): number {
  const n = Number(process.env.SOFTONE_MIRROR_INTERVAL_MS);
  // Κάτω από 1′ δεν έχει νόημα (και φορτώνει ένα ήδη αργό SoftOne).
  return Number.isFinite(n) && n >= 60_000 ? n : DEFAULT_INTERVAL_MS;
}

async function tick(): Promise<void> {
  // Τυλιγμένο ολόκληρο: εξαίρεση που ξεφεύγει από setInterval ρίχνει τη διεργασία του server.
  try {
    const r = await runMirrorCycle({ mode: 'auto', trigger: 'worker' });
    const changed = r.steps.reduce((s, x) => s + x.changed, 0);
    const failed = r.steps.filter((s) => !s.ok);
    if (r.skipped) console.log(`[softone-mirror] παράλειψη: ${r.skipped}`);
    else if (changed > 0 || failed.length || r.mode === 'reconcile') {
      console.log(`[softone-mirror] ${r.mode}: ${changed} αλλαγές σε ${r.ms}ms${failed.length ? ` · σφάλματα: ${failed.map((f) => `${f.table} (${f.error})`).join('; ')}` : ''}`);
    }
  } catch (e) {
    console.error('[softone-mirror] tick', (e as Error).message);
  }
}

export function startMirrorWorker(): boolean {
  if (mirrorWorkerDisabled() || g.__softoneMirrorWorker) return false;
  const every = mirrorIntervalMs();
  const first = setTimeout(() => { void tick(); }, FIRST_DELAY_MS);
  first.unref?.();
  g.__softoneMirrorWorker = setInterval(() => { void tick(); }, every);
  g.__softoneMirrorWorker.unref?.();
  console.log(`[softone-mirror] worker started (κάθε ${Math.round(every / 1000)}″)`);
  return true;
}
