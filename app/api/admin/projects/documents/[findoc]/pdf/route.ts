import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { softoneGetTable } from '@/lib/softone';
import { MYDATA_FIELDS } from '@/lib/project-profit';
import { safeUrl } from '@/lib/project-profit/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * GET — το ΕΠΙΣΗΜΟ PDF του παρόχου ηλεκτρονικής τιμολόγησης για ένα παραστατικό (μόνο ανάγνωση).
 *
 * Πηγή: MYDATAHEADER.INVOICEURL («QR Url Παρόχου») του παραστατικού, διαβασμένο ζωντανά. Το αρχείο
 * κατεβαίνει από τον server και περνά στον browser — ο browser δεν βλέπει ποτέ στοιχεία SoftOne.
 * Αν δεν υπάρχει URL ή ο πάροχος δεν επιστρέψει PDF ⇒ 404/502· ΠΟΤΕ δεν φτιάχνουμε δικό μας «PDF».
 * (Τα συνημμένα του SoftOne — XTRDOCDATA — σε αυτή την εγκατάσταση είναι κενά· βλ. Αναφορά integrator.)
 */
export async function GET(_req: Request, ctx: { params: Promise<{ findoc: string }> }) {
  await requirePermission('projects.financials');
  const findoc = Number((await ctx.params).findoc);
  if (!Number.isInteger(findoc) || findoc <= 0) return NextResponse.json({ error: 'invalid_findoc' }, { status: 400 });

  const [head] = await softoneGetTable('FINDOC', ['FINDOC', 'FINCODE', 'SOSOURCE'], `FINDOC=${findoc}`);
  if (!head) return NextResponse.json({ error: 'not_found', message: 'Το παραστατικό δεν βρέθηκε' }, { status: 404 });
  const [md] = await softoneGetTable('MYDATAHEADER', MYDATA_FIELDS, `SOID=${findoc} AND SOSOURCE=${Number(head.SOSOURCE)} AND ISCANCEL=0`);
  const url = safeUrl(md?.INVOICEURL);
  if (!url) {
    return NextResponse.json({ error: 'no_provider_pdf', message: 'Δεν υπάρχει επίσημο PDF παρόχου για αυτό το παραστατικό στο SoftOne.' }, { status: 404 });
  }

  // Ανακατευθύνσεις με το χέρι: κάθε βήμα ξαναελέγχεται (όχι ανακατεύθυνση σε εσωτερικό host).
  let res: Response | null = null;
  let next: string | null = url;
  for (let hop = 0; next && hop < 4; hop++) {
    res = await fetch(next, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20_000) }).catch(() => null);
    const loc: string | null = res && res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    next = loc ? safeUrl(new URL(loc, next as string).toString()) : null;
    if (loc && !next) { res = null; break; }
  }
  const type = res?.headers.get('content-type') ?? '';
  if (!res?.ok || !/application\/pdf/i.test(type)) {
    return NextResponse.json({ error: 'provider_error', message: 'Ο πάροχος δεν επέστρεψε PDF.' }, { status: 502 });
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 502 });
  const name = `${(head.FINCODE || `FINDOC-${findoc}`).replace(/[^\p{L}\p{N}._-]+/gu, '_')}.pdf`;
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(buf.byteLength),
      'Content-Disposition': `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
