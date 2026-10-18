import { requirePermission } from '@/lib/rbac';
import { renderStatementPdf } from '@/lib/statement/pdf';
import { statementFileName } from '@/lib/statement/email';
import { statementDocFor, statementErrorResponse } from '@/lib/statement/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?from=&to=[&download=1] — το PDF της κατάστασης (trdr «sample» = δείγμα). Μόνο ανάγνωση.
export async function GET(req: Request, ctx: { params: Promise<{ trdr: string }> }) {
  await requirePermission('metadata.read');
  const q = new URL(req.url).searchParams;
  try {
    const d = await statementDocFor((await ctx.params).trdr, { from: q.get('from'), to: q.get('to') });
    const pdf = await renderStatementPdf(d);
    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${q.get('download') ? 'attachment' : 'inline'}; filename="${statementFileName(d)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return statementErrorResponse(e);
  }
}
