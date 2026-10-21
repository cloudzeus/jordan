import 'server-only';
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { clientIp, tooMany } from '@/lib/public-form';
import { RfpError, type EventCtx } from './service';

// Κοινά για τα routes των αιτημάτων προσφοράς: πλαίσιο καταγραφής (IP, browser, session cookie),
// όριο αιτημάτων και ενιαίος χειρισμός σφαλμάτων.

export const SESSION_COOKIE = 'rfp_sid';

/** Session του browser: υπάρχον cookie ή νέο (το route το γράφει στην απάντηση με `withSession`). */
export function sessionOf(req: Request): { sid: string; fresh: boolean } {
  const m = /(?:^|;\s*)rfp_sid=([A-Za-z0-9_-]{16,64})/.exec(req.headers.get('cookie') ?? '');
  return m ? { sid: m[1], fresh: false } : { sid: randomBytes(16).toString('base64url'), fresh: true };
}

export function ctxOf(req: Request, actor: EventCtx['actor'], sid: string, userId: string | null = null): EventCtx {
  return { actor, userId, ip: clientIp(req), userAgent: req.headers.get('user-agent'), sessionId: sid };
}

export function withSession<T extends Response>(res: T, s: { sid: string; fresh: boolean }): T {
  if (s.fresh) res.headers.append('Set-Cookie', `${SESSION_COOKIE}=${s.sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 90}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  return res;
}

/** 30 αιτήματα / λεπτό ανά IP στα δημόσια endpoints. */
export const limited = (req: Request) => tooMany(`rfp:${clientIp(req)}`, 30, 60_000);

export function rfpFail(e: unknown) {
  if (e instanceof RfpError) return NextResponse.json({ error: 'rfp', message: e.message }, { status: e.status });
  if (e instanceof ZodError) return NextResponse.json({ error: 'invalid_input', message: e.issues[0]?.message ?? 'Μη έγκυρα στοιχεία' }, { status: 400 });
  console.error('[rfp]', e);
  return NextResponse.json({ error: 'internal', message: 'Κάτι πήγε στραβά — δοκιμάστε ξανά.' }, { status: 500 });
}

export const pdfResponse = (pdf: Buffer, name: string) => new Response(new Uint8Array(pdf), {
  headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name}"`, 'Cache-Control': 'private, no-store' },
});
