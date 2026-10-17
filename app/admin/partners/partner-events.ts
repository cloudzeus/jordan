'use client';

import * as React from 'react';

/**
 * Κανάλι ανανέωσης μεταξύ των κομματιών της σελίδας «Συνεργάτες» (dropdown ενεργειών, modals,
 * ανοιγμένη γραμμή μέσα στο DataTable) — ίδιο μοτίβο με τα «Έργα».
 */
const EVENT = 'partner:changed';

export function emitPartnerChanged(id: string) {
  window.dispatchEvent(new CustomEvent<{ id: string }>(EVENT, { detail: { id } }));
}

export function usePartnerChanged(id: string, onChange: () => void) {
  const cb = React.useRef(onChange);
  React.useEffect(() => { cb.current = onChange; });
  React.useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent<{ id: string }>).detail?.id === id) cb.current(); };
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, [id]);
}
