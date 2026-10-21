'use server';

// Server Actions των συνταγών τοποθέτησης — τα καλεί απευθείας το UI (χωρίς fetch σε /api).
// Τα REST routes στο /api/admin/recipes μένουν για εξωτερικούς πελάτες (mobile app).
// Κάθε action ελέγχει μόνο του δικαιώματα και επιστρέφει { ok, … } — ποτέ redirect μέσα στη φόρμα.
import { revalidatePath } from 'next/cache';
import type { ZodType } from 'zod';
import { logAudit } from '@/lib/audit';
import { getCurrentUserWithPermissions } from '@/lib/rbac';
import {
  RecipeError, applyRecipeInput, applyRecipeToBudget, copyRecipe, createRecipe, deleteRecipe, listRecipes,
  recipeCopyInput, recipeInput, recipeItemInfo, updateRecipe,
  type RecipeItemInfo, type RecipeView,
} from '@/lib/install-recipes';

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string };

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

/** Ο συνδεδεμένος χρήστης αν έχει ΟΛΑ τα δικαιώματα, αλλιώς μήνυμα (όχι redirect). */
async function actor(...keys: string[]) {
  const u = await getCurrentUserWithPermissions();
  if (!u) return { error: fail('Η σύνδεση έληξε — συνδεθείτε ξανά.') };
  if (u.role.key !== 'SUPER_ADMIN' && !keys.every((k) => u.permissionKeys.has(k))) {
    return { error: fail(`Δεν έχετε το δικαίωμα (${keys.join(', ')}).`) };
  }
  return { user: u };
}

function parse<T>(schema: ZodType<T>, input: unknown): { data: T } | { error: { ok: false; message: string } } {
  const r = schema.safeParse(input);
  return r.success ? { data: r.data } : { error: fail(r.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία') };
}

function caught(e: unknown): { ok: false; message: string } {
  if (e instanceof RecipeError) return fail(e.message);
  console.error('[recipes action]', e);
  return fail('Κάτι πήγε στραβά — δοκιμάστε ξανά.');
}

/** Όλες οι συνταγές (για τους διαλόγους «Από συνταγή» σε έργα και προσφορές). */
export async function listRecipesAction(): Promise<ActionResult<RecipeView[]>> {
  const a = await actor('recipes.read');
  if ('error' in a) return a.error!;
  return { ok: true, data: await listRecipes() };
}

/** Νέα συνταγή (id = null) ή πλήρης αντικατάσταση υπάρχουσας. */
export async function saveRecipeAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  const a = await actor('recipes.manage');
  if ('error' in a) return a.error!;
  const p = parse(recipeInput, input);
  if ('error' in p) return p.error;
  try {
    const r = id ? await updateRecipe(id, p.data) : await createRecipe(p.data, a.user.id);
    await logAudit({
      userId: a.user.id, userEmail: a.user.email, action: id ? 'recipe.update' : 'recipe.create', resource: 'install_recipe', resourceId: r.id,
      metadata: { name: r.name, ...(id ? {} : { kind: p.data.kind }) },
    }).catch(() => null);
    revalidatePath('/admin/recipes');
    revalidatePath(`/admin/recipes/${r.id}`);
    return { ok: true, data: { id: r.id } };
  } catch (e) {
    return caught(e);
  }
}

export async function deleteRecipeAction(id: string): Promise<ActionResult> {
  const a = await actor('recipes.manage');
  if ('error' in a) return a.error!;
  try {
    await deleteRecipe(id);
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'recipe.delete', resource: 'install_recipe', resourceId: id }).catch(() => null);
    revalidatePath('/admin/recipes');
    return { ok: true, data: undefined };
  } catch (e) {
    return caught(e);
  }
}

export async function copyRecipeAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const a = await actor('recipes.manage');
  if ('error' in a) return a.error!;
  const p = parse(recipeCopyInput, input);
  if ('error' in p) return p.error;
  try {
    const r = await copyRecipe(id, p.data, a.user.id);
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'recipe.copy', resource: 'install_recipe', resourceId: r.id, metadata: { name: r.name, from: id } }).catch(() => null);
    revalidatePath('/admin/recipes');
    return { ok: true, data: { id: r.id } };
  } catch (e) {
    return caught(e);
  }
}

/** Μονάδα + τελευταία τιμή αγοράς για τα είδη που μπαίνουν στη φόρμα. */
export async function recipeItemInfoAction(mtrls: number[]): Promise<Record<number, RecipeItemInfo>> {
  const a = await actor('recipes.manage');
  if ('error' in a) return {};
  const ids = mtrls.filter((n) => Number.isInteger(n) && n > 0).slice(0, 100);
  return ids.length ? recipeItemInfo(ids) : {};
}

/** Συνταγή → γραμμές στον προϋπολογισμό έργου. */
export async function applyRecipeToBudgetAction(prjc: number, input: unknown): Promise<ActionResult<{ lines: number; value: number }>> {
  const a = await actor('projects.manage', 'recipes.read');
  if ('error' in a) return a.error!;
  if (!Number.isInteger(prjc) || prjc <= 0) return fail('Άκυρο έργο');
  const p = parse(applyRecipeInput, input);
  if ('error' in p) return p.error;
  try {
    const out = await applyRecipeToBudget(prjc, p.data, a.user.id);
    await logAudit({
      userId: a.user.id, userEmail: a.user.email, action: 'project.budget.recipe', resource: 'project', resourceId: String(prjc),
      metadata: { recipeId: out.recipe.id, recipe: out.recipe.name, sqm: p.data.sqm, lines: out.lines, value: out.value },
    }).catch(() => null);
    return { ok: true, data: { lines: out.lines, value: out.value } };
  } catch (e) {
    return caught(e);
  }
}
