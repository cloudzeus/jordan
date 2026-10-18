import { NextResponse } from 'next/server';
import { requireAnyPermission } from '@/lib/rbac';
import { fetchDocumentDetail } from '@/lib/document-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — κεφαλή + γραμμές ενός παραστατικού από το SoftOne (μόνο ανάγνωση).
// Το βλέπουν όσοι βλέπουν έργα ή συναλλασσόμενους — εκεί εμφανίζονται τα παραστατικά.
export async function GET(_req: Request, ctx: { params: Promise<{ findoc: string }> }) {
  await requireAnyPermission('projects.read', 'metadata.read');
  const findoc = Number((await ctx.params).findoc);
  if (!Number.isInteger(findoc) || findoc <= 0) return NextResponse.json({ error: 'invalid_findoc' }, { status: 400 });
  try {
    const doc = await fetchDocumentDetail(findoc);
    if (!doc) return NextResponse.json({ error: 'not_found', message: 'Το παραστατικό δεν βρέθηκε στο SoftOne.' }, { status: 404 });
    return NextResponse.json({ doc });
  } catch (e) {
    return NextResponse.json({ error: 'softone_error', message: (e as Error).message }, { status: 502 });
  }
}
