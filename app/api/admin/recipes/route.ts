import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { createRecipe, listRecipes, recipeInput } from '@/lib/install-recipes';
import { parseBody, recipeError } from './_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  await requirePermission('recipes.read');
  return NextResponse.json({ recipes: await listRecipes() });
}

// POST — νέα συνταγή τοποθέτησης (κεφαλή + βοηθητικά υλικά).
export async function POST(req: Request) {
  const u = await requirePermission('recipes.manage');
  const body = await parseBody(req, recipeInput);
  if ('error' in body) return body.error;
  try {
    const r = await createRecipe(body.data, u.id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'recipe.create', resource: 'install_recipe', resourceId: r.id, metadata: { name: r.name, kind: body.data.kind } }).catch(() => null);
    return NextResponse.json({ recipe: r }, { status: 201 });
  } catch (e) {
    return recipeError(e);
  }
}
