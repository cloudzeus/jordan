import 'server-only';
import { company } from '@/lib/site-catalog';
import { getSetting } from '@/lib/settings';

/**
 * Στοιχεία εταιρείας για το B2B website και τα νομικά κείμενα.
 *
 * Πηγή: https://atelierdamask.gr/ (σελίδες «Επικοινωνία», «Οι υπηρεσίες μας», footer — ανάγνωση
 * 2026-10-18). Το atelierdamask.gr ΔΕΝ έχει σελίδες όρων/απορρήτου· τα νομικά κείμενα του site
 * γράφτηκαν για το B2B portal με αυτά τα στοιχεία και θέλουν έλεγχο από νομικό πριν τη δημοσίευση.
 * Επωνυμία/ΑΦΜ έρχονται από τις Ρυθμίσεις (company.legalName / company.vat) και υπερισχύουν.
 */
export const ATELIER_PROFILE = {
  brand: 'Atelier by Damask',
  tagline: 'Εκεί που η αρχιτεκτονική βρίσκει τις εφαρμογές των υλικών της.',
  pitch: 'Εταιρεία φυσικών δομικών υλικών και αρχιτεκτονικών τελειωμάτων, αποκλειστικά για τεχνικά γραφεία, αρχιτέκτονες και κατασκευαστές.',
  address: 'Λεωφ. Βουλιαγμένης 39 & Ραζηκότζικα 4, 116 36 Μετς, Αθήνα',
  hours: 'Λειτουργούμε μόνο με ραντεβού',
  phones: ['210 2162310', '6937 038850', '210 6718005'],
  salesEmail: 'sales@atelier-dm.gr',
  website: 'https://atelierdamask.gr/',
  yearsOfExperience: 27,
} as const;

export async function siteCompany() {
  const [c, vat] = await Promise.all([company(), getSetting<string>('company.vat')]);
  return {
    ...c,
    brand: ATELIER_PROFILE.brand,
    legal: c.legal?.replace(/Μ\s*Ι\s*Κ\s*Ε(?=\s|$)/, 'ΜΙΚΕ') ?? ATELIER_PROFILE.brand,
    vat: vat?.trim() || null,
    address: ATELIER_PROFILE.address,
    phones: [...ATELIER_PROFILE.phones],
    salesEmail: ATELIER_PROFILE.salesEmail,
    privacyEmail: c.email ?? ATELIER_PROFILE.salesEmail,
    hours: ATELIER_PROFILE.hours,
  };
}
export type SiteCompany = Awaited<ReturnType<typeof siteCompany>>;
