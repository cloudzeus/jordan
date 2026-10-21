// Tokens συνδέσμων και αλυσίδα hash του ημερολογίου συνεδρίας (απόδειξη). Μόνο Node (crypto).
import { createHash, randomBytes } from 'node:crypto';

/** Νέο token συνδέσμου (το βλέπει μόνο ο παραλήπτης) + το hash του για τη βάση. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString('base64url');
  return { token, hash: hashToken(token) };
}
export const hashToken = (token: string) => createHash('sha256').update(`rfp:${token}`).digest('hex');
export const validToken = (t: string) => /^[A-Za-z0-9_-]{20,64}$/.test(t);
export const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');

export type ChainEvent = {
  recipientId: string; type: string; at: Date | string; actor: string; userId?: string | null;
  ip?: string | null; userAgent?: string | null; sessionId?: string | null; data?: unknown;
};

/** Σταθερή σειριοποίηση (ταξινομημένα κλειδιά) — ίδιο hash ανεξάρτητα από τη σειρά των πεδίων. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}

/** Το hash παίρνει ΜΟΝΟ τα πεδία του γεγονότος (όχι id/hash της εγγραφής) — ίδιο στη γραφή και στον έλεγχο. */
export function eventHash(prevHash: string | null, e: ChainEvent): string {
  const at = typeof e.at === 'string' ? new Date(e.at).toISOString() : e.at.toISOString();
  const body = {
    recipientId: e.recipientId, type: e.type, at, actor: e.actor, userId: e.userId ?? null,
    ip: e.ip ?? null, userAgent: e.userAgent ?? null, sessionId: e.sessionId ?? null, data: e.data ?? {},
  };
  return sha256(`${prevHash ?? ''}|${canonical(body)}`);
}

/** Επαλήθευση αλυσίδας (με τη σειρά καταγραφής): όλα τα hash σωστά και δεμένα με το προηγούμενο. */
export function verifyChain(events: (ChainEvent & { prevHash: string | null; hash: string })[]): { ok: boolean; brokenAt: number | null } {
  let prev: string | null = null;
  for (const [i, e] of events.entries()) {
    const { prevHash, hash, ...rest } = e;
    if (prevHash !== prev || eventHash(prev, rest) !== hash) return { ok: false, brokenAt: i };
    prev = hash;
  }
  return { ok: true, brokenAt: null };
}
