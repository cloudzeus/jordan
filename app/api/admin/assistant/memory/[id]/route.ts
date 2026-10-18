import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { requireAssistantApi } from '@/lib/assistant/access';

export const dynamic = 'force-dynamic';

// DELETE → «ξέχασε» μία μνήμη.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireAssistantApi('memory');
  if (u instanceof NextResponse) return u;
  const { id } = await ctx.params;
  const row = await prisma.assistantMemory.findUnique({ where: { id }, select: { text: true } });
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await prisma.assistantMemory.delete({ where: { id } });
  await logAudit({ userId: u.id, userEmail: u.email, action: 'assistant.memory.delete', resource: 'assistant_memory', resourceId: id, metadata: { text: row.text.slice(0, 200) } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
