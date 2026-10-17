import { describe, expect, it } from 'vitest';
import { homeFor, isStaffRole, passwordProblem } from '@/lib/auth-home';
import { isEmail, parsePending, pendingCookie } from '@/lib/auth-flow';
import { siteEmailHtml } from '@/lib/site-email';

describe('homeFor — πού πηγαίνει κάθε ρόλος μετά την είσοδο', () => {
  it('προσωπικό → διαχείριση', () => {
    for (const r of ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']) expect(homeFor(r)).toBe('/admin');
  });
  it('εξωτερικοί → το portal τους (όχι /dashboard/employee όπως παλιά στο OTP)', () => {
    expect(homeFor('CUSTOMER')).toBe('/dashboard/customer');
    expect(homeFor('COLLABORATOR')).toBe('/dashboard/collaborator');
    expect(homeFor('SUPPLIER')).toBe('/dashboard/supplier');
  });
  it('άγνωστος/κενός ρόλος → ΠΟΤΕ η διαχείριση', () => {
    expect(homeFor('WHATEVER')).toBe('/dashboard/customer');
    expect(homeFor(null)).toBe('/dashboard/customer');
    expect(isStaffRole('CUSTOMER')).toBe(false);
    expect(isStaffRole('EMPLOYEE')).toBe(true);
  });
});

describe('passwordProblem', () => {
  it('ελέγχει μήκος και επιβεβαίωση', () => {
    expect(passwordProblem(undefined)).toBe('missing_password');
    expect(passwordProblem('1234567')).toBe('weak');
    expect(passwordProblem('12345678', '12345679')).toBe('mismatch');
    expect(passwordProblem('12345678', '12345678')).toBeNull();
    expect(passwordProblem('12345678')).toBeNull();
  });
});

describe('εκκρεμής ροή OTP σε cookie (όχι στο URL)', () => {
  it('γράφει και διαβάζει πίσω το ίδιο', () => {
    const c = pendingCookie({ email: 'maria@x.gr', mode: 'reset' });
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Max-Age=900');
    const raw = c.split(';')[0].split('=').slice(1).join('=');
    expect(parsePending(raw)).toEqual({ email: 'maria@x.gr', mode: 'reset' });
  });
  it('το καθάρισμα λήγει αμέσως', () => {
    expect(pendingCookie(null)).toContain('Max-Age=0');
  });
  it('απορρίπτει σκουπίδια / άγνωστο mode', () => {
    expect(parsePending(undefined)).toBeNull();
    expect(parsePending('%7Bnot-json')).toBeNull();
    expect(parsePending(encodeURIComponent(JSON.stringify({ email: 'a@b.gr', mode: 'register' })))).toBeNull();
  });
  it('isEmail', () => {
    expect(isEmail('a@b.gr')).toBe(true);
    expect(isEmail('xx')).toBe(false);
    expect(isEmail('a b@c.gr')).toBe(false);
  });
});

describe('siteEmailHtml', () => {
  it('κάνει escape ό,τι έρχεται από τον χρήστη και δείχνει τον κωδικό', () => {
    const html = siteEmailHtml({ brand: 'ATELIER', title: 'Νέος <κωδικός>', intro: 'Γεια "σου" & χαρά', code: '012345' });
    expect(html).toContain('Νέος &lt;κωδικός&gt;');
    expect(html).toContain('Γεια &quot;σου&quot; &amp; χαρά');
    expect(html).toContain('012345');
    expect(html).not.toContain('<κωδικός>');
  });
});
