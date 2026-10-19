import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { crewOptions, itemDefaults, projectChoices, searchCustomers, staffOptions } from '@/lib/contracts/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?kind=crew|customers|staff|projects|item&q= — επιλογές για τη φόρμα σύμβασης (μόνο τοπική βάση).
export async function GET(req: Request) {
  await requirePermission('projects.read');
  const sp = new URL(req.url).searchParams;
  const q = sp.get('q') ?? '';
  switch (sp.get('kind')) {
    case 'crew': return NextResponse.json({ options: await crewOptions(q) });
    case 'customers': return NextResponse.json({ options: await searchCustomers(q) });
    case 'staff': return NextResponse.json({ options: await staffOptions() });
    case 'projects': return NextResponse.json({ options: await projectChoices(q) });
    case 'item': return NextResponse.json({ item: await itemDefaults(Number(sp.get('mtrl'))) });
    default: return NextResponse.json({ error: 'kind' }, { status: 400 });
  }
}
