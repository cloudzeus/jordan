import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAssistantApi } from '@/lib/assistant/access';
import { remember } from '@/lib/assistant/search';

export const dynamic = 'force-dynamic';

// POST { value: 1 | -1 } — «Σωστό» κρατά την ερώτηση+απάντηση στη μνήμη (θα τη θυμάται σε παρόμοιες
// ερωτήσεις), «Λάθος» τη σημειώνει ώστε να ΜΗΝ αποθηκευτεί.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireAssistantApi();
  if (u instanceof NextResponse) return u;
  const { id } = await ctx.params;
  const value = Number(((await req.json().catch(() => ({}))) as { value?: unknown }).value);
  if (value !== 1 && value !== -1) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  const msg = await prisma.assistantMessage.findFirst({ where: { id, role: 'assistant', conversation: { userId: u.id } }, select: { id: true, content: true, conversationId: true, createdAt: true } });
  if (!msg) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await prisma.assistantMessage.update({ where: { id }, data: { feedback: value } });
  if (value === 1) {
    const q = await prisma.assistantMessage.findFirst({ where: { conversationId: msg.conversationId, role: 'user', createdAt: { lte: msg.createdAt } }, orderBy: { createdAt: 'desc' }, select: { content: true } });
    if (q) {
      const day = msg.createdAt.toLocaleDateString('el-GR', { timeZone: 'Europe/Athens' });
      await remember({ kind: 'answer', text: `Ερώτηση: ${q.content.slice(0, 300)}\nΕπιβεβαιωμένη απάντηση (${day}): ${msg.content.slice(0, 650)}`, userId: u.id, messageId: msg.id }).catch((e) => console.error('remember failed', e));
    }
  } else {
    await prisma.assistantMemory.deleteMany({ where: { messageId: msg.id, kind: 'answer' } });
  }
  return NextResponse.json({ ok: true });
}
