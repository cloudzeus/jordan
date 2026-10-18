'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { AirJordanAvatar } from './air-jordan-icon';
import { AirJordanChat } from './air-jordan-chat';

/**
 * Πλωτό κουμπί του Air Jordan σε κάθε σελίδα της διαχείρισης (μόνο για ADMIN / SUPER_ADMIN — το
 * αποφασίζει ο server στο admin layout). Ανοίγει πλαϊνό πάνελ (οθόνη υπολογιστή) ή πλήρη οθόνη (κινητό).
 * Συντόμευση: Ctrl/⌘ + J.
 */
export function AirJordanLauncher({ canMemory }: { canMemory: boolean }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  // Μια παραπομπή (σύνδεσμος) οδηγεί σε άλλη σελίδα: το πάνελ κλείνει για να φανεί.
  React.useEffect(() => { setOpen(false); }, [pathname]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Στη δική του σελίδα δεν χρειάζεται το πλωτό κουμπί.
  if (pathname?.startsWith('/admin/assistant')) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Air Jordan — ρωτήστε τον βοηθό (Ctrl+J)"
          title="Air Jordan (Ctrl+J)"
          className="fixed right-3 z-40 inline-flex size-12 cursor-pointer overflow-hidden lg:size-14 items-center justify-center shadow-lg shadow-blue-900/25 ring-1 ring-black/5 transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] lg:bottom-6 lg:right-6 rounded-[14px] lg:rounded-2xl"
        >
          <AirJordanAvatar size={56} className="size-full" />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          // Η εστίαση πάει κατευθείαν στο πεδίο ερώτησης (όχι στο πρώτο κουμπί, το ⋮).
          onOpenAutoFocus={(e) => { e.preventDefault(); document.querySelector<HTMLTextAreaElement>('[data-aj-input]')?.focus(); }}
          className="fixed inset-0 z-50 flex flex-col bg-background shadow-2xl outline-none sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(460px,100vw)] sm:border-l sm:border-border data-[state=open]:animate-in data-[state=open]:slide-in-from-right-10"
        >
          <DialogPrimitive.Title className="sr-only">Air Jordan</DialogPrimitive.Title>
          <AirJordanChat variant="panel" canMemory={canMemory} onClose={() => setOpen(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
