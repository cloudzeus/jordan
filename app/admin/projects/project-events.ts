'use client';

import * as React from 'react';

/**
 * Κανάλι ανανέωσης μεταξύ των κομματιών της σελίδας «Έργα» (dropdown ενεργειών, modal
 * προσθήκης, ανοιγμένη γραμμή). Δεν μοιράζονται γονέα που να κρατά state — η ανοιγμένη γραμμή
 * ζει μέσα στο DataTable — οπότε ένα window event είναι η απλούστερη σωστή σύνδεση.
 *
 * `budget`: άλλαξε μόνο ο προϋπολογισμός (δική μας βάση) — όχι νέα κλήση στο SoftOne.
 * `all`:    ξαναδιάβασε και τις κινήσεις από το SoftOne.
 */
export type ProjectRefreshScope = 'budget' | 'all';
type Detail = { prjc: number; scope: ProjectRefreshScope };

const EVENT = 'project:refresh';

export function emitProjectRefresh(prjc: number, scope: ProjectRefreshScope) {
  window.dispatchEvent(new CustomEvent<Detail>(EVENT, { detail: { prjc, scope } }));
}

export function useProjectRefresh(prjc: number, onRefresh: (scope: ProjectRefreshScope) => void) {
  const cb = React.useRef(onRefresh);
  React.useEffect(() => { cb.current = onRefresh; });
  React.useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<Detail>).detail;
      if (d?.prjc === prjc) cb.current(d.scope);
    };
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, [prjc]);
}
