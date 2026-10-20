import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { applyRecipeInput, applyRecipeToBudget } from '@/lib/install-recipes';
import { parseBody, recipeError } from '../../../../recipes/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { recipeId, sqm, laborMtrl? } — οι γραμμές μιας συνταγής τοποθέτησης στον προϋπολογισμό του έργου.
export async function POST(req: Request, ctx: { params: Promise<{ prjc: string }> }) {
  const u = await requirePermission('projects.manage');
  await requirePermission('recipes.read');
  const prjc = Number((await ctx.params).prjc);
  if (!Number.isInteger(prjc) || prjc <= 0) return NextResponse.json({ error: 'invalid_prjc', message: 'Άκυρο έργο' }, { status: 400 });
  const body = await parseBody(req, applyRecipeInput);
  if ('error' in body) return body.error;
  try {
    const out = await applyRecipeToBudget(prjc, body.data, u.id);
    await logAudit({
      userId: u.id, userEmail: u.email, action: 'project.budget.recipe', resource: 'project', resourceId: String(prjc),
      metadata: { recipeId: out.recipe.id, recipe: out.recipe.name, sqm: body.data.sqm, lines: out.lines, value: out.value },
    }).catch(() => null);
    return NextResponse.json(out, { status: 201 });
  } catch (e) {
    return recipeError(e);
  }
}
