import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { updateCategory } from '@/lib/item-classifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const reorderInput = z.object({
  updates: z.array(z.object({
    sodtype: z.union([z.literal(51), z.literal(52)]),
    code: z.number().int(),
    sohCode: z.string().trim().min(1).max(32).regex(/^\d+(\.\d+)*$/, 'Κωδικός ιεραρχίας: αριθμοί με τελείες'),
  })).min(1).max(100),
});

export async function POST(req: Request) {
  const u = await requirePermission('classifications.manage');
  const parsed = reorderInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return NextResponse.json({ error: 'invalid_input', message: i?.message ?? 'Μη έγκυρα στοιχεία' }, { status: 400 });
  }
  const { updates } = parsed.data;
  const results: { sodtype: number; code: number; sohCode: string; ok: boolean; error?: string }[] = [];
  for (const u2 of updates) {
    try {
      await updateCategory(u2.sodtype, u2.code, { sohCode: u2.sohCode });
      results.push({ sodtype: u2.sodtype, code: u2.code, sohCode: u2.sohCode, ok: true });
    } catch (e) {
      results.push({ sodtype: u2.sodtype, code: u2.code, sohCode: u2.sohCode, ok: false, error: (e as Error).message });
    }
  }
  const failed = results.filter((r) => !r.ok);
  await logAudit({
    userId: u.id, userEmail: u.email, action: 'classification.category.reorder',
    resource: 'classification', resourceId: `batch:${updates.length}`,
    metadata: { count: updates.length, failed: failed.length },
  }).catch(() => null);
  if (failed.length) {
    return NextResponse.json({ error: 'partial_failure', message: `${failed.length} από ${updates.length} απέτυχαν`, results }, { status: 207 });
  }
  return NextResponse.json({ ok: true, count: updates.length });
}
