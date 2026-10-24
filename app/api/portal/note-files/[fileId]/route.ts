import { NextResponse } from 'next/server';
import { customerTrdrOf, getPortalUser } from '@/lib/rbac';
import { serveStoredFile } from '@/lib/serve-file';
import { contentDisposition } from '@/lib/entity-files/core';
import { customerNoteFile } from '@/lib/contracts/notes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — φωτογραφία σημείωσης προσφοράς: ο πελάτης ΜΟΝΟ από σημείωση που μοιράζεται μαζί του (ή δική του)
// σε δική του προσφορά.
export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const u = await getPortalUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const trdr = customerTrdrOf(u);
  if (trdr == null) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const f = await customerNoteFile(trdr, (await params).fileId);
  if (!f) return NextResponse.json({ error: 'not_found', message: 'Το αρχείο δεν βρέθηκε.' }, { status: 404 });
  return serveStoredFile(req, { key: f.storageKey, contentType: f.mimeType, fileName: f.name, disposition: contentDisposition('inline', f.name) });
}
