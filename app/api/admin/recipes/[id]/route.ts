import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { deleteRecipe, getRecipe, recipeInput, updateRecipe } from '@/lib/install-recipes';
import { parseBody, recipeError, type IdCtx } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: IdCtx) {
  await requirePermission('recipes.read');
  const r = await getRecipe((await ctx.params).id);
  if (!r) return NextResponse.json({ error: 'not_found', message: 'Η συνταγή δεν βρέθηκε' }, { status: 404 });
  return NextResponse.json({ recipe: r });
}

// PUT — πλήρης αντικατάσταση της συνταγής (κεφαλή + γραμμές).
export async function PUT(req: Request, ctx: IdCtx) {
  const u = await requirePermission('recipes.manage');
  const body = await parseBody(req, recipeInput);
  if ('error' in body) return body.error;
  try {
    const r = await updateRecipe((await ctx.params).id, body.data);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'recipe.update', resource: 'install_recipe', resourceId: r.id, metadata: { name: r.name } }).catch(() => null);
    return NextResponse.json({ recipe: r });
  } catch (e) {
    return recipeError(e);
  }
}

export async function DELETE(_req: Request, ctx: IdCtx) {
  const u = await requirePermission('recipes.manage');
  const { id } = await ctx.params;
  try {
    await deleteRecipe(id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'recipe.delete', resource: 'install_recipe', resourceId: id }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return recipeError(e);
  }
}
