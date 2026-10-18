import 'server-only';
import { getSetting } from '@/lib/settings';
import { ATELIER_PROFILE, siteCompany } from '@/lib/site-company';
import type { EmailBrand } from '@/lib/email/layout';
import { parseBankAccounts } from '@/lib/email/bank';

/** Η ταυτότητα της εταιρείας για ΚΑΘΕ email/PDF: Ρυθμίσεις → Εταιρεία, με εφεδρεία το προφίλ του atelier. */
export async function emailBrand(): Promise<EmailBrand> {
  try {
    return await loadBrand();
  } catch (e) {
    // Ποτέ να μη χαθεί email (π.χ. OTP) επειδή δεν διαβάστηκαν οι Ρυθμίσεις.
    console.error('[email-brand]', e instanceof Error ? e.message : e);
    const p = ATELIER_PROFILE;
    return { name: p.brand, address: p.address, phones: [...p.phones], email: p.salesEmail, website: p.website };
  }
}

async function loadBrand(): Promise<EmailBrand> {
  const [c, name, taxOffice, banks] = await Promise.all([
    siteCompany(),
    getSetting<string>('company.name'),
    getSetting<string>('company.taxOffice'),
    getSetting<string>('company.bankAccounts'),
  ]);
  return {
    name: name?.trim() || c.brand,
    legalName: c.legal,
    vat: c.vat,
    taxOffice: taxOffice?.trim() || null,
    address: c.address,
    phones: c.phones,
    email: c.salesEmail,
    website: ATELIER_PROFILE.website,
    bankAccounts: parseBankAccounts(banks),
  };
}
