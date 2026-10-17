import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { listClassifications } from '@/lib/item-classifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — κατηγορίες & ομάδες (καθρέφτης) με πλήθος ενεργών ειδών ανά εγγραφή.
export async function GET() {
  await requirePermission('metadata.read');
  return NextResponse.json(await listClassifications());
}
