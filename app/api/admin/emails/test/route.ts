import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { emailBrand } from '@/lib/email/brand';
import { catalogEntry } from '@/lib/email/catalog';
import { sendLeadMail } from '@/lib/lead-mail';
import { renderStatementPdf } from '@/lib/statement/pdf';
import { sampleStatementDoc } from '@/lib/statement/sample';
import { statementFileName } from '@/lib/statement/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { id } — δοκιμαστική αποστολή ενός προτύπου (με δείγμα δεδομένων) ΜΟΝΟ στο email του συνδεδεμένου χρήστη.
export async function POST(req: Request) {
  const u = await requirePermission('metadata.read');
  const { id } = await req.json().catch(() => ({}));
  const entry = typeof id === 'string' ? catalogEntry(id) : null;
  if (!entry) return NextResponse.json({ error: 'Άγνωστο πρότυπο' }, { status: 404 });
  const brand = await emailBrand();
  const m = entry.render(brand);
  const attachments = entry.id === 'statement'
    ? [{ filename: statementFileName(sampleStatementDoc(brand)), content: await renderStatementPdf(sampleStatementDoc(brand)), contentType: 'application/pdf' }]
    : undefined;
  const result = await sendLeadMail(u.email, `[Δοκιμή] ${m.subject}`, m.html, { text: m.text, attachments });
  if (result === 'failed') return NextResponse.json({ error: 'Η αποστολή απέτυχε (Mailgun)' }, { status: 502 });
  return NextResponse.json({ ok: true, result, to: u.email });
}
