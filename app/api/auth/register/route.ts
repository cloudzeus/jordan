import { NextRequest } from 'next/server';
import { getSetting } from '@/lib/settings';
import { mailgunConfig, sendTransactionalEmail } from '@/lib/mailgun';
import { escapeHtml, siteEmailHtml } from '@/lib/site-email';
import { isEmail, normEmail, redirectTo } from '@/lib/auth-flow';

/**
 * «Αίτημα πρόσβασης» (B2B): ΔΕΝ δημιουργεί λογαριασμό. Η πρόσβαση δίνεται μόνο από την καρτέλα
 * πελάτη/συνεργάτη (Πρόσβαση στο portal) — έτσι κάθε χρήστης είναι δεμένος με τον σωστό πελάτη.
 * Εδώ απλώς στέλνουμε το αίτημα στο email της εταιρείας (Reply-To = ο αιτών).
 */
export async function POST(request: NextRequest) {
  const f = await request.formData();
  if (f.get('website')?.toString()) return redirectTo('/auth/register?success=1'); // honeypot: bots

  const field = (k: string, max = 200) => (f.get(k)?.toString() ?? '').trim().slice(0, max);
  const name = field('name');
  const company = field('company');
  const email = normEmail(f.get('email'));
  const phone = field('phone', 40);
  const vat = field('vat', 20);
  const kind = field('kind') === 'partner' ? 'Συνεργάτης' : 'Πελάτης';
  const message = field('message', 2000);
  const profession = field('profession', 80);
  if (!name || !company) return redirectTo('/auth/register?error=missing');
  if (!isEmail(email)) return redirectTo('/auth/register?error=email');
  // B2B μόνο: ΑΦΜ (≥ 8 ψηφία, και ξένοι με πρόθεμα χώρας) + αποδοχή όρων.
  if (!/\d{8,}/.test(vat.replace(/\s/g, ''))) return redirectTo('/auth/register?error=vat');
  if (f.get('terms')?.toString() !== '1') return redirectTo('/auth/register?error=terms');

  const [brand, inbox] = await Promise.all([getSetting<string>('company.name'), getSetting<string>('company.email')]);
  const to = inbox?.trim() || mailgunConfig().address;
  const row = (k: string, v: string) => (v ? `<tr><td style="padding:6px 16px 6px 0;color:#8A847C;white-space:nowrap">${k}</td><td style="padding:6px 0;color:#1C1B19">${escapeHtml(v)}</td></tr>` : '');
  const body = `<table role="presentation" cellpadding="0" cellspacing="0" style="font:400 14px/1.5 Helvetica,Arial,sans-serif">${
    row('Ως', kind) + row('Ονοματεπώνυμο', name) + row('Εταιρεία', company) + row('Δραστηριότητα', profession) + row('ΑΦΜ', vat) + row('Email', email) + row('Τηλέφωνο', phone)
  }</table>${message ? `<p style="margin:16px 0 0;white-space:pre-wrap">${escapeHtml(message)}</p>` : ''}
  <p style="margin:12px 0 0;color:#8A847C">Αποδέχτηκε τους όρους χρήσης της B2B πύλης.</p>
  <p style="margin:20px 0 0">Για να δώσετε πρόσβαση: καρτέλα πελάτη ή συνεργάτη → ⋮ → «Πρόσβαση στο portal».</p>`;

  try {
    await sendTransactionalEmail(
      to,
      `Αίτημα πρόσβασης — ${company}`,
      siteEmailHtml({ brand: brand ?? 'ATELIER', title: 'Νέο αίτημα πρόσβασης', intro: `Από τη φόρμα του website (${kind.toLowerCase()}).`, body, footer: 'Απαντήστε σε αυτό το email για να επικοινωνήσετε απευθείας με τον αιτούντα.' }),
      { replyTo: email, fromName: brand ?? 'ATELIER' },
    );
  } catch (e) {
    console.error('[access-request] αποτυχία αποστολής', e instanceof Error ? e.message : e);
    return redirectTo('/auth/register?error=send');
  }
  return redirectTo('/auth/register?success=1');
}
