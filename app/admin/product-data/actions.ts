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
import { createRegistryRow, deleteRegistryRow, RegistryError, updateRegistryRow } from '@/lib/product-registry';
import { isRegistryKind } from '@/lib/product-registry-core';

const PAGE = '/admin/product-data';

function caught(e: unknown) {
  if (e instanceof ClassificationError || e instanceof RegistryError) return fail(e.message);
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

// ── Μάρκες & κατασκευαστές (αντικείμενα-λίστα) ──────────────────────────────────────────────
// Κάθε εγγραφή διαβάζει ΟΛΗ τη λίστα, αλλάζει μία γραμμή και ξαναδιαβάζει για επιβεβαίωση· αν
// επηρεαστεί άλλη γραμμή, γίνεται επαναφορά (βλ. lib/product-registry.ts).

export async function createRegistryRowAction(kind: string, input: unknown): Promise<ActionResult<{ id: number }>> {
  const a = await actor('classifications.manage');
  if ('error' in a) return a.error;
  if (!isRegistryKind(kind)) return fail('Άγνωστο μητρώο');
  try {
    const r = await createRegistryRow(kind, input);
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'product_data.registry.create', resource: 'lookup', resourceId: `${kind}:${r.id}`, metadata: { kind, ...(input as object) } }).catch(() => null);
    revalidatePath(PAGE);
    return done(r);
  } catch (e) {
    return caught(e);
  }
}

export async function updateRegistryRowAction(kind: string, id: number, input: unknown): Promise<ActionResult> {
  const a = await actor('classifications.manage');
  if ('error' in a) return a.error;
  if (!isRegistryKind(kind)) return fail('Άγνωστο μητρώο');
  try {
    await updateRegistryRow(kind, id, input);
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'product_data.registry.update', resource: 'lookup', resourceId: `${kind}:${id}`, metadata: { kind, ...(input as object) } }).catch(() => null);
    revalidatePath(PAGE);
    return done(undefined);
  } catch (e) {
    return caught(e);
  }
}

/** Διαγραφή — μόνο όταν κανένα είδος δεν τη χρησιμοποιεί (το ελέγχει ο καλών στο UI). */
export async function deleteRegistryRowAction(kind: string, id: number): Promise<ActionResult> {
  const a = await actor('classifications.manage');
  if ('error' in a) return a.error;
  if (!isRegistryKind(kind)) return fail('Άγνωστο μητρώο');
  try {
    await deleteRegistryRow(kind, id);
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'product_data.registry.delete', resource: 'lookup', resourceId: `${kind}:${id}`, metadata: { kind } }).catch(() => null);
    revalidatePath(PAGE);
    return done(undefined);
  } catch (e) {
    return caught(e);
  }
}
