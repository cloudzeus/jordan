'use client';

import { FiPrinter } from 'react-icons/fi';

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} data-print-hide
      className="inline-flex min-h-12 cursor-pointer items-center gap-2 bg-(--s-ink) px-5 text-(length:--fs-15) font-medium text-white transition-colors hover:bg-[#2C4556]">
      <FiPrinter className="size-4" aria-hidden />Εκτύπωση / PDF
    </button>
  );
}
