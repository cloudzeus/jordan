import { NextResponse } from 'next/server';
import { customerTrdrOf, getCurrentUserWithPermissions } from '@/lib/rbac';
import { serveStoredFile } from '@/lib/serve-file';
import { contentDisposition } from '@/lib/entity-files/core';
import { customerTaskFile } from '@/lib/project-tasks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — λήψη αρχείου εργασίας από τον πελάτη: ΜΟΝΟ αν η εργασία είναι ορατή και το έργο δικό του.
export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const u = await getCurrentUserWithPermissions();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const trdr = customerTrdrOf(u);
  if (trdr == null) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const f = await customerTaskFile(trdr, (await params).fileId);
  if (!f) return NextResponse.json({ error: 'not_found', message: 'Το αρχείο δεν βρέθηκε.' }, { status: 404 });
  const inline = new URL(req.url).searchParams.get('inline') === '1' && f.ext === 'pdf';
  return serveStoredFile(req, { key: f.storageKey, contentType: f.mimeType, fileName: f.name, disposition: contentDisposition(inline ? 'inline' : 'attachment', f.name) });
}
