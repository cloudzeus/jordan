import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { RecipeError } from '@/lib/install-recipes';

export type IdCtx = { params: Promise<{ id: string }> };

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<{ data: T } | { error: NextResponse }> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (parsed.success) return { data: parsed.data };
  const i = parsed.error.issues[0];
  return { error: NextResponse.json({ error: 'invalid_input', message: i?.message ?? 'Μη έγκυρα στοιχεία', field: i?.path?.join('.') ?? null }, { status: 400 }) };
}

export function recipeError(e: unknown) {
  if (e instanceof RecipeError) return NextResponse.json({ error: 'recipe_error', message: e.message }, { status: e.status });
  console.error('[recipes]', e);
  return NextResponse.json({ error: 'internal_error', message: 'Κάτι πήγε στραβά — δοκιμάστε ξανά.' }, { status: 500 });
}
