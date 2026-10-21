import 'server-only';
import type { ZodType } from 'zod';
import { getCurrentUserWithPermissions } from '@/lib/rbac';

// Κοινά εργαλεία για τα Server Actions των σελίδων admin (`app/admin/**/actions.ts`).
// Ένα action δεν κάνει ποτέ redirect μέσα σε φόρμα: επιστρέφει { ok:false, message } και το UI το δείχνει.

export type { ActionResult } from '@/lib/action-result';
export type ActionFail = { ok: false; message: string };

export const fail = (message: string): ActionFail => ({ ok: false, message });
export const done = <T>(data: T): { ok: true; data: T } => ({ ok: true, data });
export const doneEmpty = (): { ok: true; data: undefined } => ({ ok: true, data: undefined });

type ActionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUserWithPermissions>>>;

/** Ο συνδεδεμένος χρήστης αν έχει ΟΛΑ τα δικαιώματα, αλλιώς μήνυμα (όχι redirect). */
export async function actor(...keys: string[]): Promise<{ user: ActionUser } | { error: ActionFail }> {
  const u = await getCurrentUserWithPermissions();
  if (!u) return { error: fail('Η σύνδεση έληξε — συνδεθείτε ξανά.') };
  if (u.role.key !== 'SUPER_ADMIN' && !keys.every((k) => u.permissionKeys.has(k))) {
    return { error: fail(`Δεν έχετε το δικαίωμα (${keys.join(', ')}).`) };
  }
  return { user: u };
}

export function parse<T>(schema: ZodType<T>, input: unknown): { data: T } | { error: ActionFail } {
  const r = schema.safeParse(input);
  return r.success ? { data: r.data } : { error: fail(r.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία') };
}

/** Θετικός ακέραιος (π.χ. PRJC) ή null. */
export const posInt = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null);

type ErrorClass = abstract new (...args: never[]) => Error;

/** Γνωστά σφάλματα του domain → το μήνυμά τους· οτιδήποτε άλλο → log + γενικό μήνυμα. */
export function caught(e: unknown, tag: string, known: ErrorClass[]): ActionFail {
  if (known.some((K) => e instanceof K)) return fail((e as Error).message);
  console.error(`[${tag} action]`, e);
  return fail('Κάτι πήγε στραβά — δοκιμάστε ξανά.');
}
