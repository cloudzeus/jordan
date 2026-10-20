import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { recipeItemInfo } from '@/lib/install-recipes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?mtrl=1,2,3 — μονάδα και τελευταία τιμή αγοράς των ειδών που μπαίνουν σε συνταγή.
export async function GET(req: Request) {
  await requirePermission('recipes.manage');
  const ids = (new URL(req.url).searchParams.get('mtrl') ?? '')
    .split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 100);
  return NextResponse.json({ items: ids.length ? await recipeItemInfo(ids) : {} });
}
