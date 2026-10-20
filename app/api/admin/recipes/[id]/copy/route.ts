import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { copyRecipe, recipeCopyInput } from '@/lib/install-recipes';
import { parseBody, recipeError, type IdCtx } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { name, mtrl?, materialPrice? } — αντίγραφο της συνταγής για ομοειδές υλικό.
export async function POST(req: Request, ctx: IdCtx) {
  const u = await requirePermission('recipes.manage');
  const body = await parseBody(req, recipeCopyInput);
  if ('error' in body) return body.error;
  const { id } = await ctx.params;
  try {
    const r = await copyRecipe(id, body.data, u.id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'recipe.copy', resource: 'install_recipe', resourceId: r.id, metadata: { name: r.name, from: id } }).catch(() => null);
    return NextResponse.json({ recipe: r }, { status: 201 });
  } catch (e) {
    return recipeError(e);
  }
}
