import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { TaskError } from '@/lib/project-tasks';
import { EntityFileError } from '@/lib/entity-files/core';

export type PrjcCtx = { params: Promise<{ prjc: string }> };
export type TaskCtx = { params: Promise<{ prjc: string; id: string }> };

export async function prjcOf(ctx: { params: Promise<{ prjc: string }> }) {
  const n = Number((await ctx.params).prjc);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const badPrjc = () => NextResponse.json({ error: 'invalid_prjc', message: 'Άκυρο έργο' }, { status: 400 });

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<{ data: T } | { error: NextResponse }> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (parsed.success) return { data: parsed.data };
  const i = parsed.error.issues[0];
  return { error: NextResponse.json({ error: 'invalid_input', message: i?.message ?? 'Μη έγκυρα στοιχεία', field: i?.path?.join('.') ?? null }, { status: 400 }) };
}

export function taskError(e: unknown) {
  if (e instanceof TaskError) return NextResponse.json({ error: 'task_error', message: e.message }, { status: e.status });
  if (e instanceof EntityFileError) return NextResponse.json({ error: 'file_error', message: e.message }, { status: e.status });
  console.error('[tasks]', e);
  return NextResponse.json({ error: 'internal_error', message: 'Κάτι πήγε στραβά — δοκιμάστε ξανά.' }, { status: 500 });
}
