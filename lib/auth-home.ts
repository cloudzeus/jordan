/**
 * Πού «προσγειώνεται» κάθε ρόλος μετά τη σύνδεση — ΜΙΑ πηγή για κωδικό, OTP και το «Η περιοχή μου»
 * του website. Προσωπικό → διαχείριση· πελάτες/συνεργάτες/προμηθευτές → το portal τους.
 * Άγνωστος ρόλος → portal πελάτη (ποτέ η διαχείριση: το /admin φυλάγεται ούτως ή άλλως από requireStaff).
 */
export const HOME_BY_ROLE: Record<string, string> = {
  SUPER_ADMIN: '/admin',
  ADMIN: '/admin',
  EMPLOYEE: '/admin',
  CUSTOMER: '/dashboard/customer',
  COLLABORATOR: '/dashboard/collaborator',
  SUPPLIER: '/dashboard/supplier',
};

export function homeFor(roleKey: string | null | undefined): string {
  return (roleKey && HOME_BY_ROLE[roleKey]) || '/dashboard/customer';
}

export function isStaffRole(roleKey: string | null | undefined) {
  return homeFor(roleKey) === '/admin';
}

/** Ελάχιστοι κανόνες κωδικού (ίδιοι σε επαναφορά και ορισμό από διαχειριστή). */
export function passwordProblem(pw: string | null | undefined, confirm?: string | null): string | null {
  if (!pw) return 'missing_password';
  if (pw.length < 8) return 'weak';
  if (confirm !== undefined && confirm !== pw) return 'mismatch';
  return null;
}
