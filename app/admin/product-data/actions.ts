'use server';

// Server Actions της σελίδας «Δεδομένα προϊόντων»: συγχρονισμός των τεσσάρων μητρώων από το SoftOne
// και εγγραφή εμπορικών κατηγοριών (το μόνο από τα τέσσερα που γράφεται με ασφάλεια).
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { logAudit } from '@/lib/audit';
import { setSetting } from '@/lib/settings';
import { actor, done, fail, parse, type ActionResult } from '@/lib/server-actions';
import {
  categoryCreateInput, categoryUpdateInput, ClassificationError, createCategory, syncClassifications, updateCategory,
} from '@/lib/item-classifications';
import { replaceLookups } from '@/lib/softone-sync/resync';
import { SoftoneError } from '@/lib/softone';

const PAGE = '/admin/product-data';

function caught(e: unknown) {
  if (e instanceof ClassificationError) return fail(e.message);
  if (e instanceof ZodError) return fail(e.issues[0]?.message ?? 'Μη έγκυρα στοιχεία');
  if (e instanceof SoftoneError) return fail(`SoftOne: ${e.message}`);
  console.error('[product-data]', e);
  return fail('Κάτι πήγε στραβά — δοκιμάστε ξανά.');
}

export type ProductSyncResult = {
  classifications: { created: number; updated: number; deactivated: number };
  lookups: { brands: number; manufacturers: number };
  /** Βοηθητικοί πίνακες που δεν απάντησαν — το μητρώο τους έμεινε ως είχε. */
  notAnswered: string[];
};

/**
 * Κατεβάζει και τα τέσσερα μητρώα: κατηγορίες & ομάδες (`SoftoneClassification`) και μάρκες &
 * κατασκευαστές (`SoftoneLookup`). ΜΟΝΟ ανάγνωση από το SoftOne.
 */
export async function syncProductDataAction(): Promise<ActionResult<ProductSyncResult>> {
  const a = await actor('classifications.manage');
  if ('error' in a) return a.error;
  try {
    const classifications = await syncClassifications();
    const lookups = await replaceLookups();
    const now = new Date().toISOString();
    await Promise.all([
      setSetting('integrations.softoneClassificationsLastSync', now, a.user.id).catch(() => null),
      setSetting('integrations.softoneLookupsLastSync', now, a.user.id).catch(() => null),
    ]);
    const out: ProductSyncResult = {
      classifications,
      lookups: { brands: lookups.byKind.MTRMARK ?? 0, manufacturers: lookups.byKind.MTRMANFCTR ?? 0 },
      notAnswered: lookups.failed,
    };
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'product_data.sync', resource: 'classification', metadata: { ...out } }).catch(() => null);
    revalidatePath(PAGE);
    return done(out);
  } catch (e) {
    return caught(e);
  }
}

/** Νέα εμπορική κατηγορία — ΓΡΑΦΕΙ στο SoftOne (object `ITECATEGORY`/`SRVCATEGORY`). */
export async function createCategoryAction(input: unknown): Promise<ActionResult<{ code: number }>> {
  const a = await actor('classifications.manage');
  if ('error' in a) return a.error;
  const v = parse(categoryCreateInput, input);
  if ('error' in v) return v.error;
  try {
    const c = await createCategory(v.data);
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'classification.category.create', resource: 'classification', resourceId: String(c.code), metadata: { ...v.data } }).catch(() => null);
    revalidatePath(PAGE);
    return done({ code: c.code });
  } catch (e) {
    return caught(e);
  }
}

/** Αλλαγή ονομασίας/κατάστασης εμπορικής κατηγορίας — ΓΡΑΦΕΙ στο SoftOne. */
export async function updateCategoryAction(sodtype: number, code: number, input: unknown): Promise<ActionResult> {
  const a = await actor('classifications.manage');
  if ('error' in a) return a.error;
  const v = parse(categoryUpdateInput, input);
  if ('error' in v) return v.error;
  try {
    await updateCategory(sodtype, code, v.data);
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'classification.category.update', resource: 'classification', resourceId: `${sodtype}:${code}`, metadata: { ...v.data } }).catch(() => null);
    revalidatePath(PAGE);
    return done(undefined);
  } catch (e) {
    return caught(e);
  }
}
