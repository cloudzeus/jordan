'use server';

// Server Actions των δυνητικών πελατών (μόνο βάση της εφαρμογής — τίποτα προς το SoftOne).
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { logAudit } from '@/lib/audit';
import { actor, done, doneEmpty, fail, type ActionResult } from '@/lib/server-actions';
import { createProspect, deleteProspect, ProspectError, updateProspect } from '@/lib/prospects';

type ProspectOut = Awaited<ReturnType<typeof createProspect>>;

function caught(e: unknown) {
  if (e instanceof ProspectError) return fail(e.message);
  if (e instanceof ZodError) return fail(e.issues[0]?.message ?? 'Μη έγκυρα στοιχεία');
  console.error('[prospects action]', e);
  return fail('Κάτι πήγε στραβά — δοκιμάστε ξανά.');
}

/** Νέος (id = null) ή αλλαγή δυνητικού πελάτη. */
export async function saveProspectAction(id: number | null, input: unknown): Promise<ActionResult<ProspectOut>> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  try {
    const p = id ? await updateProspect(id, input) : await createProspect(input, a.user.id);
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: id ? 'prospect.update' : 'prospect.create', resource: 'prospect', resourceId: String(p.id) }).catch(() => null);
    revalidatePath('/admin/prospects');
    return done(p);
  } catch (e) {
    return caught(e);
  }
}

export async function deleteProspectAction(id: number): Promise<ActionResult> {
  const a = await actor('projects.manage');
  if ('error' in a) return a.error;
  try {
    await deleteProspect(id);
    await logAudit({ userId: a.user.id, userEmail: a.user.email, action: 'prospect.delete', resource: 'prospect', resourceId: String(id) }).catch(() => null);
    revalidatePath('/admin/prospects');
    return doneEmpty();
  } catch (e) {
    return caught(e);
  }
}
