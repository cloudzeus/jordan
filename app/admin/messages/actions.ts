'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUserWithPermissions, PORTAL_HOME } from '@/lib/rbac';
import { messageRecipients, MessageError, sendMessage } from '@/lib/messages';
import { messageInput, type Recipient } from '@/lib/messages-core';
import { contractHistory } from '@/lib/contracts/history';
import type { HistoryEntry } from '@/lib/contracts/history-core';
import { EntityFileError } from '@/lib/entity-files/core';
import { logAudit } from '@/lib/audit';
import type { ActionResult } from '@/lib/action-result';

/** Μόνο προσωπικό (όχι πελάτες/συνεργάτες/συνεργεία της πύλης). */
async function staff() {
  const u = await getCurrentUserWithPermissions();
  if (!u || !u.isActive || (u.role.key && PORTAL_HOME[u.role.key])) return null;
  return u;
}

const scope = z.object({ prjc: z.number().int().nullish(), trdr: z.number().int().nullish() });

export async function messageRecipientsAction(raw: unknown): Promise<ActionResult<Recipient[]>> {
  if (!(await staff())) return { ok: false, message: 'Δεν έχετε δικαίωμα' };
  const s = scope.safeParse(raw);
  if (!s.success || (s.data.prjc == null && s.data.trdr == null)) return { ok: false, message: 'Λείπει έργο ή πελάτης' };
  return { ok: true, data: (await messageRecipients(s.data)).recipients };
}

/** FormData: `data` (JSON του messageInput) + `files`. */
export async function sendMessageAction(form: FormData): Promise<ActionResult<{ emailStatus: string | null }>> {
  const u = await staff();
  if (!u) return { ok: false, message: 'Δεν έχετε δικαίωμα' };
  let raw: unknown;
  try { raw = JSON.parse(String(form.get('data') ?? '{}')); } catch { return { ok: false, message: 'Μη έγκυρα στοιχεία' }; }
  const v = messageInput.safeParse(raw);
  if (!v.success) return { ok: false, message: v.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία' };
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0).slice(0, 10);
  try {
    const m = await sendMessage(v.data, files, { id: u.id, name: u.name ?? null, email: u.email });
    await logAudit({ userId: u.id, userEmail: u.email, action: v.data.kind === 'LOG' ? 'message.log' : 'message.send', resource: 'message', resourceId: m.id, metadata: { prjc: v.data.prjc, trdr: v.data.trdr, email: m.emailStatus } }).catch(() => null);
    if (v.data.prjc != null) revalidatePath(`/admin/projects/${v.data.prjc}`);
    if (v.data.contractId) revalidatePath(`/admin/projects/contracts/${v.data.contractId}`);
    return { ok: true, data: { emailStatus: m.emailStatus } };
  } catch (e) {
    if (e instanceof MessageError || e instanceof EntityFileError) return { ok: false, message: e.message };
    console.error('[message]', e);
    return { ok: false, message: 'Το μήνυμα δεν στάλθηκε — δοκιμάστε ξανά.' };
  }
}

/** Ιστορικό πελάτη (όλες οι προσφορές/συμβάσεις και τα μηνύματά του) — για την καρτέλα «Ιστορικό» του πελάτη. */
export async function traderHistoryAction(trdr: number): Promise<ActionResult<HistoryEntry[]>> {
  if (!(await staff())) return { ok: false, message: 'Δεν έχετε δικαίωμα' };
  if (!Number.isInteger(trdr)) return { ok: false, message: 'Μη έγκυρος πελάτης' };
  return { ok: true, data: await contractHistory({ trdr }, 'STAFF', { limit: 300 }) };
}
