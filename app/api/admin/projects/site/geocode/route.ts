import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { searchSiteAddress, SiteError } from '@/lib/project-site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ q: z.string().trim().min(3, 'Γράψε τουλάχιστον 3 χαρακτήρες').max(200) });

// POST { q } — υποψήφιες θέσεις για μια διεύθυνση (έως 5, οι ακριβέστερες πρώτα).
export async function POST(req: Request) {
  await requirePermission('projects.manage');
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    return NextResponse.json({ candidates: await searchSiteAddress(parsed.data.q) });
  } catch (e) {
    if (e instanceof SiteError) return NextResponse.json({ error: 'site_error', message: e.message }, { status: e.status });
    throw e;
  }
}
