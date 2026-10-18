import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAssistantApi } from '@/lib/assistant/access';

export const dynamic = 'force-dynamic';

// GET → οι συνομιλίες ΤΟΥ χρήστη (νεότερες πρώτα).
export async function GET() {
  const u = await requireAssistantApi();
  if (u instanceof NextResponse) return u;
  const rows = await prisma.assistantConversation.findMany({
    where: { userId: u.id }, orderBy: { updatedAt: 'desc' }, take: 50, select: { id: true, title: true, updatedAt: true },
  });
  return NextResponse.json({ conversations: rows });
}
