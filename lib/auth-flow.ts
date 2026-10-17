import { cookies } from 'next/headers';

/**
 * Το email της εκκρεμούς ροής OTP κρατιέται σε httpOnly cookie 15′ — ΟΧΙ στο URL (δεν μένει σε
 * ιστορικό/logs/Referer). Οι σελίδες /auth/* το διαβάζουν για να το δείξουν· τα routes για να το χρησιμοποιήσουν.
 */
export const PENDING_COOKIE = 'auth_pending';
const MAX_AGE = 15 * 60;

export type PendingMode = 'reset' | 'login';
export type Pending = { email: string; mode: PendingMode };

export function pendingCookie(p: Pending | null) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const value = p ? encodeURIComponent(JSON.stringify(p)) : '';
  return `${PENDING_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${p ? MAX_AGE : 0}${secure}`;
}

export function parsePending(raw: string | undefined | null): Pending | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(decodeURIComponent(raw));
    if (typeof p?.email === 'string' && (p.mode === 'reset' || p.mode === 'login')) return { email: p.email, mode: p.mode };
  } catch {}
  return null;
}

export async function readPending() {
  return parsePending((await cookies()).get(PENDING_COOKIE)?.value);
}

/** 302 με (προαιρετικά) πολλά Set-Cookie. */
export function redirectTo(location: string, ...setCookies: string[]) {
  const headers = new Headers({ Location: location });
  for (const c of setCookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
}

export const normEmail = (v: FormDataEntryValue | null) => v?.toString().trim().toLowerCase() || '';
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
