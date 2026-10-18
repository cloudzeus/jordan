import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAssistantApi } from '@/lib/assistant/access';

export const dynamic = 'force-dynamic';

// GET → τα μηνύματα μιας συνομιλίας του χρήστη.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireAssistantApi();
  if (u instanceof NextResponse) return u;
  const { id } = await ctx.params;
  const conv = await prisma.assistantConversation.findFirst({
    where: { id, userId: u.id },
    include: { messages: { orderBy: { createdAt: 'asc' }, select: { id: true, role: true, content: true, citations: true, feedback: true, createdAt: true } } },
  });
  if (!conv) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ id: conv.id, title: conv.title, messages: conv.messages });
}

// DELETE → διαγραφή συνομιλίας (μόνο της δικής του· η μνήμη που έμαθε μένει).
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireAssistantApi();
  if (u instanceof NextResponse) return u;
  const { id } = await ctx.params;
  const r = await prisma.assistantConversation.deleteMany({ where: { id, userId: u.id } });
  return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
}
