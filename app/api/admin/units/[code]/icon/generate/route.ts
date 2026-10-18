import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { MAX_HINT_CHARS, generateUnitIcon } from '@/lib/unit-icons';
import { invalid, unitErrorResponse } from '../../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const body = z.object({ hint: z.string().trim().max(MAX_HINT_CHARS, `Έως ${MAX_HINT_CHARS} χαρακτήρες`).optional().nullable() });

// POST { hint? } — δημιουργία εικονιδίου με AI (OpenRouter / Gemini) και αποθήκευση στη βιβλιοθήκη.
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const u = await requirePermission('units.manage');
  const code = Number((await ctx.params).code);
  if (!Number.isInteger(code) || code <= 0) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return invalid(parsed.error.issues);
  try {
    const res = await generateUnitIcon(code, parsed.data.hint, u.id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'unit.icon.generate', resource: 'unit', resourceId: String(code), metadata: { mediaId: res.mediaId, hint: parsed.data.hint ?? null } }).catch(() => null);
    return NextResponse.json(res);
  } catch (e) { return unitErrorResponse(e); }
}
