'use client';

import * as React from 'react';

/**
 * Ανοίγει ένα modal αντί για τη σελίδα `path`, για ΚΑΘΕ σύνδεσμο προς αυτήν (όπως το AccessModalHost
 * για το /auth/register). Ο σύνδεσμος μένει πραγματικός: χωρίς JavaScript, με Ctrl/⌘-κλικ ή όταν
 * είμαστε ήδη στη σελίδα, ανοίγει κανονικά η σελίδα. Σταματά επίσης την ομαλή κύλιση (Lenis) όσο
 * είναι ανοιχτό.
 */
export function useLinkModal(path: string, onOpen: () => void, open: boolean) {
  const cb = React.useRef(onOpen);
  React.useEffect(() => { cb.current = onOpen; });
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest('a');
      if (!a || a.target === '_blank' || new URL(a.href, location.href).pathname !== path || location.pathname === path) return;
      e.preventDefault();
      cb.current();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [path]);
  React.useEffect(() => {
    const lenis = (window as unknown as { __lenis?: { stop: () => void; start: () => void } }).__lenis;
    if (open) lenis?.stop(); else lenis?.start();
  }, [open]);
}
