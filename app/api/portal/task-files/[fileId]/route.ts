import { NextResponse } from 'next/server';
import { customerTrdrOf, getPortalUser, partyOf } from '@/lib/rbac';
import { serveStoredFile } from '@/lib/serve-file';
import { contentDisposition } from '@/lib/entity-files/core';
import { customerTaskFile } from '@/lib/project-tasks';
import { partyTaskFile } from '@/lib/portal-party';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — λήψη αρχείου εργασίας: ο πελάτης ΜΟΝΟ από ορατή εργασία δικού του έργου· ο συνεργάτης /
// το συνεργείο ΜΟΝΟ από εργασία όπου είναι εμπλεκόμενος.
export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  // Λήψη = ανάγνωση: ισχύει και η «Προβολή ως» του διαχειριστή.
  const u = await getPortalUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const trdr = customerTrdrOf(u);
  const party = partyOf(u);
  if (trdr == null && !party) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { fileId } = await params;
  const f = trdr != null ? await customerTaskFile(trdr, fileId) : await partyTaskFile(party!, fileId);
  if (!f) return NextResponse.json({ error: 'not_found', message: 'Το αρχείο δεν βρέθηκε.' }, { status: 404 });
  const inline = new URL(req.url).searchParams.get('inline') === '1' && f.ext === 'pdf';
  return serveStoredFile(req, { key: f.storageKey, contentType: f.mimeType, fileName: f.name, disposition: contentDisposition(inline ? 'inline' : 'attachment', f.name) });
}
