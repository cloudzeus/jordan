'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { startViewAsAction } from '@/app/admin/users/view-as-actions';

/**
 * «Προβολή portal»: ανοίγει την πύλη του πελάτη/συνεργάτη/συνεργείου όπως τη βλέπει ο ίδιος (μόνο
 * ανάγνωση). Το action κάνει redirect· αν επιστρέψει, είναι μήνυμα σφάλματος.
 */
export function useViewAs(back?: string) {
  const [pending, start] = React.useTransition();
  const open = React.useCallback((userId: string) => start(async () => {
    const r = await startViewAsAction(userId, back ?? window.location.pathname);
    if (r && !r.ok) toast.error(r.message);
  }), [back]);
  return { open, pending };
}
