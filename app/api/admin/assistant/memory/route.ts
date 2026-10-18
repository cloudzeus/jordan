import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAssistantApi } from '@/lib/assistant/access';
import { remember, MEMORY_KINDS, type MemoryKind } from '@/lib/assistant/search';

export const dynamic = 'force-dynamic';

// POST { kind, text } — χειροκίνητη προσθήκη γνώσης (π.χ. «Πορσελάνες = Porcelanosa, προμηθευτής 0012»).
export async function POST(req: Request) {
  const u = await requireAssistantApi('memory');
  if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => ({}))) as { kind?: string; text?: string };
  const kind = (MEMORY_KINDS as readonly string[]).includes(b.kind ?? '') ? (b.kind as MemoryKind) : 'fact';
  const text = (b.text ?? '').trim();
  if (text.length < 3) return NextResponse.json({ error: 'empty', message: 'Γράψτε τι να θυμάται' }, { status: 400 });
  const r = await remember({ kind, text, userId: u.id });
  return NextResponse.json(r);
}

// GET → όλη η μνήμη (ό,τι έχει μάθει).
export async function GET() {
  const u = await requireAssistantApi('memory');
  if (u instanceof NextResponse) return u;
  const rows = await prisma.assistantMemory.findMany({ orderBy: { updatedAt: 'desc' }, take: 500, select: { id: true, kind: true, text: true, refKey: true, uses: true, updatedAt: true } });
  return NextResponse.json({ memories: rows });
}
