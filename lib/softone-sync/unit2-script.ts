import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { clearCachedToken, loadSoftoneConfig, softoneFetch, softoneGetToken } from '@/lib/softone';
import { ItemMaintenanceError } from '@/lib/softone-sync/item-maintenance';
import { readSoftoneItem, type ItemRecord } from '@/lib/softone-sync/item-edit';

/**
 * ΕΞΑΙΡΕΣΗ (εγκεκριμένη 17/10/2026, ΜΟΝΟ για αυτή την περίπτωση) στον κανόνα «μόνο επίσημα S1 services»:
 * το setData του ITEM δεν αλλάζει Μ.Μ.2 σε είδος με παραστατικά (ερώτηση επιβεβαίωσης που το Web
 * Service δεν μπορεί να απαντήσει). Το custom script softone/scripts/units.js γράφει ΜΟΝΟ
 * MTRUNIT2/MU21/MU12MODE με δικούς του ελέγχους. Εδώ: τοπικοί έλεγχοι → dry-run → εγγραφή →
 * ανάγνωση με το ΕΠΙΣΗΜΟ readSoftoneItem → επαλήθευση. Τίποτε άλλο δεν περνά από αυτό το κανάλι.
 */

export const unit2Input = z.object({
  unit2: z.coerce.number().int().positive(),
  ratio2: z.coerce.number().positive().max(100000),
  strict2: z.boolean().default(false),
});
export type Unit2Input = z.infer<typeof unit2Input>;

const scriptResult = z.object({
  success: z.boolean(),
  code: z.string().optional(),
  error: z.string().optional(),
  dryRun: z.boolean().optional(),
});

/** Ρυθμίσεις από το .env: διαδρομή του script στο SoftOne και κοινό μυστικό. */
export function unit2ScriptConfig() {
  const path = (process.env.SOFTONE_UNITS_SCRIPT || 'skroutz.units').trim().replace(/^\/+|\/+$/g, '');
  const secret = (process.env.SOFTONE_UNITS_SECRET || '').trim();
  return { path, secret, enabled: secret.length >= 16 };
}

/** Το μήνυμα του SoftOne όταν αρνείται αλλαγή Μ.Μ.2 σε είδος με παραστατικά. */
export const isUnit2LockedError = (msg: string | null | undefined) => !!msg && /Μ\.Μ\.2/.test(msg) && /(αλλαγή|παραστατικ)/i.test(msg);

const SCRIPT_ERRORS: Record<string, string> = {
  forbidden_user: 'Ο χρήστης Web Services δεν επιτρέπεται στο script — έλεγξε το ALLOWED_USERS.',
  not_configured: 'Το script στο SoftOne δεν έχει ρυθμιστεί (SHARED_SECRET).',
  bad_secret: 'Το μυστικό κλειδί δεν ταιριάζει με το script στο SoftOne.',
  qty2_in_use: 'Υπάρχουν ήδη γραμμές με ποσότητα Μ.Μ.2 — η αλλαγή θα αλλοίωνε το ιστορικό.',
};

async function callScript(fn: string, body: Record<string, unknown>) {
  const cfg = await loadSoftoneConfig();
  const { path, secret } = unit2ScriptConfig();
  const url = `${cfg.endpoint.replace(/\/+$/, '')}/JS/${path}/${fn}`;
  const run = async (clientID: string) => softoneFetch<Record<string, unknown>>(url, { clientID, appId: cfg.appId, SECRET: secret, ...body });
  let raw = await run(await softoneGetToken());
  // Ληγμένο session → μία νέα σύνδεση και ξανά (όπως το softoneCall).
  if (raw && raw.success === false && typeof raw.errorcode === 'number' && (raw.errorcode as number) < 0) {
    await clearCachedToken();
    raw = await run(await softoneGetToken(true));
  }
  const parsed = scriptResult.safeParse(raw);
  if (!parsed.success) throw new ItemMaintenanceError('script_bad_response', `Μη αναμενόμενη απάντηση από το script ${path}.${fn} — είναι εγκατεστημένο;`, 502);
  if (!parsed.data.success) {
    const code = parsed.data.code ?? 'script_error';
    throw new ItemMaintenanceError(`script_${code}`, SCRIPT_ERRORS[code] ?? parsed.data.error ?? 'Το script απέτυχε.', code === 'forbidden_user' || code === 'bad_secret' ? 403 : 422);
  }
  return parsed.data;
}

export type Unit2Result = { mtrl: number; before: ItemRecord; after: ItemRecord; dryRun: boolean };

/**
 * Αλλάζει Μ.Μ.2 (μονάδα, σχέση, αυστηρή) μέσω του script. `dryRun` = μόνο οι έλεγχοι του script.
 * Πάντα: πρώτα dry-run, μετά εγγραφή, μετά ανάγνωση από το επίσημο getData και σύγκριση.
 */
export async function setUnit2ViaScript(mtrl: number, input: Unit2Input, opts: { dryRun?: boolean } = {}): Promise<Unit2Result> {
  if (!unit2ScriptConfig().enabled) {
    throw new ItemMaintenanceError('script_disabled', 'Η αλλαγή Μ.Μ.2 μέσω script δεν είναι ενεργή: λείπει το SOFTONE_UNITS_SECRET στο .env.', 503);
  }
  const before = await readSoftoneItem(mtrl);
  if (before.isService) throw new ItemMaintenanceError('not_item', 'Μ.Μ.2 έχουν μόνο τα είδη αποθήκης.', 422);
  if (String(before.unit1) === String(input.unit2)) throw new ItemMaintenanceError('same_as_base', 'Η Μ.Μ.2 δεν μπορεί να είναι ίδια με τη βασική μονάδα.', 422);
  const unit = await prisma.softoneUnit.findFirst({ where: { code: input.unit2, isActive: true }, select: { code: true } });
  if (!unit) throw new ItemMaintenanceError('unknown_unit', 'Άγνωστη ή ανενεργή μονάδα — κάνε συγχρονισμό μονάδων.', 422);

  const body = { MTRL: mtrl, MTRUNIT2: input.unit2, MU21: input.ratio2, MU12MODE: input.strict2 ? 1 : 0 };
  await callScript('setUnit2', { ...body, DRYRUN: 1 });
  if (opts.dryRun) return { mtrl, before, after: before, dryRun: true };

  await callScript('setUnit2', { ...body, DRYRUN: 0 });
  const after = await readSoftoneItem(mtrl);
  const ok = String(after.unit2) === String(input.unit2) && Math.abs(Number(after.ratio2) - input.ratio2) < 1e-6 && !!after.strict2 === input.strict2;
  if (!ok) throw new ItemMaintenanceError('not_persisted', 'Το script απάντησε επιτυχία αλλά η ανάγνωση από το SoftOne δεν δείχνει τη νέα Μ.Μ.2.', 502);
  return { mtrl, before, after, dryRun: false };
}
