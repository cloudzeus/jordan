import { NextRequest } from 'next/server';
import { getSetting } from '@/lib/settings';
import { mailgunConfig, sendTransactionalEmail } from '@/lib/mailgun';
import { emailBrand } from '@/lib/email/brand';
import { accessRequestEmail } from '@/lib/email/templates';
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

  const [brand, inbox] = await Promise.all([emailBrand(), getSetting<string>('company.email')]);
  const to = inbox?.trim() || mailgunConfig().address;
  const m = accessRequestEmail(brand, { kind, name, company, profession, vat, email, phone, message });

  try {
    await sendTransactionalEmail(to, m.subject, m.html, { replyTo: email, fromName: brand.name, text: m.text });
  } catch (e) {
    console.error('[access-request] αποτυχία αποστολής', e instanceof Error ? e.message : e);
    return redirectTo('/auth/register?error=send');
  }
  return redirectTo('/auth/register?success=1');
}
