'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FiRefreshCw } from 'react-icons/fi';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { SoftoneUser } from '@/lib/softone-action';

export type LinkTarget = { id: string; name: string; email: string; softoneUserId: number | null };

/**
 * Σύνδεση χρήστη του προσωπικού με χρήστη SoftOne (USERS). Τα ραντεβού όπου είναι υπεύθυνος
 * καταχωρίζονται στο SoftOne ως Ενέργειες με αυτόν τον χρήστη ως χειριστή.
 */
export function SoftoneLinkDialog({ target, onClose }: { target: LinkTarget | null; onClose: () => void }) {
  const router = useRouter();
  const [users, setUsers] = React.useState<SoftoneUser[] | null>(null);
  const [value, setValue] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Τα setState μόνο μέσα στο callback του fetch· ο καθαρισμός στο load (χειριστής) ή στην αλλαγή χρήστη.
  const fetchUsers = React.useCallback((fresh = false) =>
    fetch(`/api/admin/softone/users${fresh ? '?fresh=1' : ''}`).catch(() => null).then(async (res) => {
      const d = res ? await res.json().catch(() => ({})) : {};
      if (res?.ok) setUsers(d.users); else { setUsers([]); setError(d.message ?? 'Δεν φορτώθηκαν οι χρήστες SoftOne'); }
    }), []);
  const load = (fresh = false) => { setUsers(null); setError(null); return fetchUsers(fresh); };
  const [prevTarget, setPrevTarget] = React.useState<LinkTarget | null>(null);
  if (target !== prevTarget) {
    setPrevTarget(target);
    if (target) { setValue(target.softoneUserId ? String(target.softoneUserId) : ''); setUsers(null); setError(null); }
  }
  React.useEffect(() => { if (target) void fetchUsers(); }, [target, fetchUsers]);

  async function save() {
    if (!target) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${target.id}/softone`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ softoneUserId: value ? Number(value) : null }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message ?? 'Η αποθήκευση απέτυχε');
      toast.success(d.softoneUserName ? `${target.name || target.email} ↔ SoftOne «${d.softoneUserName}»` : 'Η σύνδεση με SoftOne αφαιρέθηκε');
      onClose(); router.refresh();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Χρήστης SoftOne</DialogTitle>
          <DialogDescription>{target?.name || target?.email}: τα ραντεβού του στο ημερολόγιο θα καταχωρίζονται στο SoftOne ως Ενέργειες με αυτόν τον χειριστή.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-2">
          <div className="flex items-end gap-2">
            <label className="block flex-1 space-y-1 text-(length:--fs-12) font-medium">
              <span>Χρήστης SoftOne</span>
              <select value={value} onChange={(e) => setValue(e.target.value)} disabled={!users} className="h-9 w-full rounded-md border border-input bg-background px-2 text-(length:--fs-13) font-normal">
                <option value="">— Καμία σύνδεση —</option>
                {(users ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}{u.code !== u.name ? ` (${u.code})` : ''} · #{u.id}</option>)}
              </select>
            </label>
            <Button type="button" variant="outline" size="icon" className="size-9" onClick={() => load(true)} aria-label="Ανανέωση από SoftOne"><FiRefreshCw className="size-3.5" aria-hidden /></Button>
          </div>
          {!users && <p className="text-(length:--fs-12) text-muted-foreground">Φόρτωση από SoftOne…</p>}
          {error && <p role="alert" className="text-(length:--fs-12) text-destructive">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Άκυρο</Button>
          <Button type="button" onClick={save} disabled={busy || !users}>Αποθήκευση</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
