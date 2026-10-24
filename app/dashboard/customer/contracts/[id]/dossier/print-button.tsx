'use client';

import { FiPrinter } from 'react-icons/fi';

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} data-print-hide
      className="p-btn p-btn-primary">
      <FiPrinter className="size-4" aria-hidden />Εκτύπωση / PDF
    </button>
  );
}
