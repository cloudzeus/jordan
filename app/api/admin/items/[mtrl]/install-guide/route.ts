import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { generateInstallGuide, installGuideState } from '@/lib/install-guide/service';
import { badMtrl, mediaError, mtrlOf } from '../media/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// GET — ό,τι χρειάζεται το modal «Οδηγίες εγκατάστασης»: είδος/προφίλ, ηχογραφήσεις, μέσα, οδηγοί.
export async function GET(_req: Request, { params }: { params: Promise<{ mtrl: string }> }) {
  await requirePermission('metadata.read');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return badMtrl();
  try {
    return NextResponse.json(await installGuideState(mtrl));
  } catch (e) {
    return mediaError(e);
  }
}

// POST — δημιουργία οδηγού με AI (κείμενα + δείγματα + κατηγορία) και PDF στα «Αρχεία» του είδους.
export async function POST(_req: Request, { params }: { params: Promise<{ mtrl: string }> }) {
  const u = await requirePermission('metadata.manage');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return badMtrl();
  try {
    const guide = await generateInstallGuide(mtrl, { id: u.id, name: u.name });
    await logAudit({
      userId: u.id, userEmail: u.email, action: 'item.install-guide.generate', resource: 'softone_item', resourceId: String(mtrl),
      metadata: { guideId: guide.id, pdfMediaId: guide.pdfMediaId, model: guide.model, steps: guide.content.steps.length },
    }).catch(() => null);
    return NextResponse.json({ guide }, { status: 201 });
  } catch (e) {
    console.error('[install-guide] generate', e);
    return mediaError(e);
  }
}
