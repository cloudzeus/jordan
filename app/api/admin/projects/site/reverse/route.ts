import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { reverseSite, SiteError } from '@/lib/project-site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ lat: z.number().finite(), lng: z.number().finite() });

// POST { lat, lng } — η διεύθυνση στο σημείο της πινέζας (αντίστροφη γεωκωδικοποίηση).
export async function POST(req: Request) {
  await requirePermission('projects.manage');
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  try {
    return NextResponse.json({ candidate: await reverseSite(parsed.data.lat, parsed.data.lng) });
  } catch (e) {
    if (e instanceof SiteError) return NextResponse.json({ error: 'site_error', message: e.message }, { status: e.status });
    throw e;
  }
}
