// lib/assistant/access-rules.ts — ΚΑΘΑΡΟ. Ο κανόνας πρόσβασης του Air Jordan (δοκιμάζεται χωρίς βάση).

export const ASSISTANT_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);

/** SUPER_ADMIN πάντα· ADMIN μόνο με το δικαίωμα· κάθε άλλος ρόλος ποτέ (ακόμη και με το δικαίωμα). */
export function assistantAllowed(roleKey: string | null | undefined, permissions: ReadonlySet<string>, key: string): boolean {
  if (!roleKey || !ASSISTANT_ROLES.has(roleKey)) return false;
  return roleKey === 'SUPER_ADMIN' || permissions.has(key);
}
