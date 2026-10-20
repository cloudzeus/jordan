'use client';

import * as React from 'react';
import Image from 'next/image';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { FiMapPin, FiPhone, FiX } from 'react-icons/fi';
import { BookingForm } from '@/components/site/booking';
import { useLinkModal } from '@/components/site/link-modal';

export const BOOKING_PATH = '/appointment';

/**
 * «Κλείστε ραντεβού στο atelier» σε modal πάνω σε οποιαδήποτε σελίδα: ανοίγει από κάθε σύνδεσμο προς
 * /appointment (η σελίδα μένει ως εναλλακτική). Αριστερά το atelier, δεξιά οι ελεύθερες ώρες.
 */
export function BookingModalHost({ address, hours, phone }: { address: string; hours: string; phone: string }) {
  const [open, setOpen] = React.useState(false);
  const [key, setKey] = React.useState(0);
  useLinkModal(BOOKING_PATH, () => { setKey((k) => k + 1); setOpen(true); }, open);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-90 bg-[#0B1620]/70 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          className="site fixed inset-x-0 bottom-0 z-91 max-h-[94dvh] overflow-hidden bg-white text-(--s-ink) shadow-[0_40px_120px_-30px_rgba(0,0,0,0.6)] outline-hidden data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[90dvh] md:w-[min(72rem,calc(100vw-3rem))] md:-translate-x-1/2 md:-translate-y-1/2"
          aria-describedby="booking-desc">
          <div className="grid max-h-[94dvh] md:max-h-[90dvh] md:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
            <aside className="relative hidden overflow-hidden bg-[#0B1620] text-white md:block">
              <Image src="/site/brand/lab.jpg" alt="" fill sizes="26rem" className="object-cover opacity-55" />
              <div className="absolute inset-0 bg-linear-to-t from-[#0B1620] via-[#0B1620]/40 to-transparent" />
              <div className="relative flex h-full flex-col justify-between p-8">
                <Image src="/site/brand/logo-white.png" alt="Atelier by Damask" width={835} height={438} className="h-auto w-[110px]" />
                <div>
                  <p className="font-display text-(length:--fs-36)">Άγγιξε, νιώσε, <em className="text-[#E8D5BF]">επίλεξε.</em></p>
                  <p className="mt-4 text-(length:--fs-14) leading-relaxed text-white/75">Μεγάλες επιφάνειες για κάθε υλικό, mock-ups και meeting room — με την ησυχία που θέλει μια σωστή επιλογή.</p>
                  <ul className="mt-6 space-y-3 text-(length:--fs-14) text-white/80">
                    <li className="flex items-start gap-3"><FiMapPin className="mt-0.5 size-4 shrink-0 text-[#D6B796]" aria-hidden />{address}</li>
                    <li className="flex items-start gap-3"><FiPhone className="mt-0.5 size-4 shrink-0 text-[#D6B796]" aria-hidden /><a href={`tel:${phone.replace(/\s/g, '')}`} className="tabular-nums hover:text-white">{phone}</a></li>
                  </ul>
                  <p className="mt-6 text-(length:--fs-12) font-medium uppercase tracking-[0.18em] text-[#D6B796]">{hours}</p>
                </div>
              </div>
            </aside>

            <div className="relative overflow-y-auto overscroll-contain p-6 sm:p-8 lg:p-10" data-lenis-prevent>
              <DialogPrimitive.Close className="absolute right-3 top-3 grid size-11 cursor-pointer place-items-center text-(--s-ink-2) hover:text-(--s-ink)" aria-label="Κλείσιμο">
                <FiX className="size-5" aria-hidden />
              </DialogPrimitive.Close>
              <p className="s-kicker text-(--s-accent)">Μόνο με ραντεβού</p>
              <DialogPrimitive.Title className="font-display mt-3 pr-10 text-(length:--fs-40)">Κλείστε ραντεβού στο atelier</DialogPrimitive.Title>
              <p id="booking-desc" className="mt-2 text-(length:--fs-15) text-(--s-ink-2)">Διαλέξτε μια ελεύθερη ώρα — σας περιμένουμε με τα υλικά του έργου σας. <span className="md:hidden">{address}.</span></p>
              <div className="mt-8"><BookingForm key={key} idPrefix="bkm" TitleAs="h3" /></div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
