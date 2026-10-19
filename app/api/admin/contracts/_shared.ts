import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ContractError } from '@/lib/contracts/service';
import { DocParseError } from '@/lib/contracts/core';
import { TaskError } from '@/lib/project-tasks';
import { SoftoneError } from '@/lib/softone';

export const idOf = async (ctx: { params: Promise<{ id: string }> }) => (await ctx.params).id;

/** Ενιαίος χειρισμός σφαλμάτων: γνωστά → μήνυμα στον χρήστη, τα υπόλοιπα → 500. */
export function fail(e: unknown) {
  if (e instanceof ContractError || e instanceof TaskError) return NextResponse.json({ error: 'contract_error', message: e.message }, { status: e.status });
  if (e instanceof ZodError) return NextResponse.json({ error: 'invalid_input', message: e.issues[0]?.message ?? 'Μη έγκυρα στοιχεία' }, { status: 400 });
  if (e instanceof DocParseError) return NextResponse.json({ error: 'ai_parse', message: e.message }, { status: 502 });
  if (e instanceof SoftoneError) return NextResponse.json({ error: 'softone', message: `SoftOne: ${e.message}` }, { status: 502 });
  console.error('[contracts]', e);
  return NextResponse.json({ error: 'internal', message: e instanceof Error ? e.message : 'Σφάλμα' }, { status: 500 });
}
