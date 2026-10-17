import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { PartnerError } from '@/lib/partners';

export const intParam = (v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Διαβάζει και επικυρώνει το σώμα· επιστρέφει { data } ή { res } με 400 και το πρώτο μήνυμα. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<{ data: T; res?: never } | { res: NextResponse; data?: never }> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { res: NextResponse.json({ error: 'invalid_input', message: issue?.message ?? 'Μη έγκυρα στοιχεία', field: issue?.path?.[0] ?? null }, { status: 400 }) };
  }
  return { data: parsed.data };
}

/** PartnerError → JSON με το status του· οτιδήποτε άλλο ξαναπετιέται. */
export function partnerErrorResponse(e: unknown) {
  if (e instanceof PartnerError) return NextResponse.json({ error: 'partner_error', message: e.message }, { status: e.status });
  throw e;
}
