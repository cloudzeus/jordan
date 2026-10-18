import { NextResponse } from 'next/server';
import { staffWith } from '@/lib/staff-guard';
import { searchParties } from '@/lib/appointment-parties';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?q= — συναλλασσόμενοι, επαφές τους, συνεργάτες και επαφές συνεργατών για νέο ραντεβού.
export async function GET(req: Request) {
  const g = await staffWith('appointments.schedule');
  if ('error' in g) return g.error;
  const q = new URL(req.url).searchParams.get('q') ?? '';
  return NextResponse.json({ results: await searchParties(q) });
}
