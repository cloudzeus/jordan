import { NextResponse } from 'next/server';
import { requireAssistantApi } from '@/lib/assistant/access';
import { reindexKnowledge } from '@/lib/assistant/indexer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// POST → επανευρετηρίαση της γνώσης από τη βάση της εφαρμογής (μόνο ό,τι άλλαξε παίρνει νέο embedding).
export async function POST() {
  const u = await requireAssistantApi('memory');
  if (u instanceof NextResponse) return u;
  try {
    return NextResponse.json(await reindexKnowledge({ userId: u.id }));
  } catch (e) {
    console.error('assistant reindex failed', e);
    return NextResponse.json({ error: 'reindex_failed', message: (e as Error).message.slice(0, 200) }, { status: 500 });
  }
}
