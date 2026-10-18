import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { isEmail } from '@/lib/auth-flow';
import { sendLeadMail } from '@/lib/lead-mail';
import { getSetting } from '@/lib/settings';
import { renderStatementPdf } from '@/lib/statement/pdf';
import { statementEmail, statementFileName } from '@/lib/statement/email';
import { statementDocFor, statementErrorResponse } from '@/lib/statement/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { from, to, message, target: 'me' | 'customer', email? } — αποστολή της κατάστασης με PDF.
 *  • 'me': ΜΟΝΟ στο email του συνδεδεμένου χρήστη (δοκιμή), με «[Δοκιμή]» στο θέμα.
 *  • 'customer': ρητή ενέργεια με επιβεβαίωση στο UI· χρειάζεται metadata.manage, καταγράφεται στο audit.
 */
export async function POST(req: Request, ctx: { params: Promise<{ trdr: string }> }) {
  const body = await req.json().catch(() => ({}));
  const toCustomer = body.target === 'customer';
  const u = await requirePermission(toCustomer ? 'metadata.manage' : 'metadata.read');
  const trdr = (await ctx.params).trdr;
  if (toCustomer && trdr === 'sample') return NextResponse.json({ error: 'Το δείγμα στέλνεται μόνο σε εσάς' }, { status: 400 });
  const to = toCustomer ? String(body.email ?? '').trim() : u.email;
  if (!isEmail(to)) return NextResponse.json({ error: 'Μη έγκυρο email παραλήπτη' }, { status: 400 });
  try {
    const d = await statementDocFor(trdr, body);
    const [m, pdf, inbox] = await Promise.all([Promise.resolve(statementEmail(d)), renderStatementPdf(d), getSetting<string>('company.email')]);
    const subject = toCustomer ? m.subject : `[Δοκιμή] ${m.subject}`;
    const result = await sendLeadMail(to, subject, m.html, {
      text: m.text, replyTo: inbox ?? d.brand.email ?? null,
      attachments: [{ filename: statementFileName(d), content: pdf, contentType: 'application/pdf' }],
    });
    if (toCustomer) {
      await logAudit({ userId: u.id, userEmail: u.email, action: 'statement.send', resource: 'trader', resourceId: String(d.customer.trdr), metadata: { to, result, from: d.statement.from, to_: d.statement.to, closing: d.statement.closing } }).catch(() => null);
    }
    if (result === 'failed') return NextResponse.json({ error: 'Η αποστολή απέτυχε (Mailgun)' }, { status: 502 });
    return NextResponse.json({ ok: true, result, to });
  } catch (e) {
    return statementErrorResponse(e);
  }
}
