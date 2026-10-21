import { NextResponse } from 'next/server';
import { customerTrdrOf, getPortalUser, partyOf } from '@/lib/rbac';
import { serveStoredFile } from '@/lib/serve-file';
import { contentDisposition } from '@/lib/entity-files/core';
import { customerContractDocFile } from '@/lib/portal-customer';
import { partyContractDocFile } from '@/lib/portal-party';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — PDF προσφοράς/σύμβασης από το portal: ο πελάτης παίρνει ΜΟΝΟ έγγραφα «πελάτη» δικής του
// σύμβασης, ο συνεργάτης/το συνεργείο ΜΟΝΟ τη δική του σύμβαση ανάθεσης. Η ταυτότητα από τη συνεδρία.
export async function GET(req: Request, { params }: { params: Promise<{ docId: string }> }) {
  // Λήψη = ανάγνωση: ισχύει και η «Προβολή ως» του διαχειριστή.
  const u = await getPortalUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { docId } = await params;
  const trdr = customerTrdrOf(u);
  const party = partyOf(u);
  const f = trdr != null ? await customerContractDocFile(trdr, docId) : party ? await partyContractDocFile(party, docId) : null;
  if (!f) return NextResponse.json({ error: 'not_found', message: 'Το έγγραφο δεν βρέθηκε.' }, { status: 404 });
  const inline = new URL(req.url).searchParams.get('inline') === '1' && f.ext === 'pdf';
  return serveStoredFile(req, { key: f.storageKey, contentType: f.mimeType, fileName: f.name, disposition: contentDisposition(inline ? 'inline' : 'attachment', f.name) });
}
